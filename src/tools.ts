import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AleoClient } from "./aleo-client.ts";
import { DEFAULTS, redact } from "./common.ts";
import {
  buildDepositTx,
  buildEscrowWithdrawTx,
  buildFundArcEscrow,
  buildFundCreditsEscrow,
  buildMintMockArc,
  randomField
} from "./builders.ts";
import {
  leoBuild,
  leoDecryptRecord,
  leoDeploy,
  leoExecute,
  leoNewAccount,
  leoTest
} from "./leo.ts";

type ToolReturn = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(value: unknown): ToolReturn {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function fail(message: string): ToolReturn {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function textResult(fn: () => unknown | Promise<unknown>): Promise<ToolReturn> {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

const builtTxSchema = {
  program: z.string().describe("Program id, e.g. payroll_private_v2.aleo"),
  transition: z.string().describe("Transition name, e.g. fund_credits_escrow"),
  args: z.array(z.string()).describe("Ordered Leo transition inputs"),
  imports: z.array(z.string()).optional().describe("Program ids to import")
};

const allocationSchema = z.object({
  receiver: z.string().describe("Aleo address aleo1..."),
  amount: z.string().describe('Amount literal, e.g. "1000u64"')
});

export function registerTools(server: McpServer, client: AleoClient): void {
  // ── Read-only network queries (no leo, no key, no config) ───────────────

  server.tool("aleo_height", "Get the latest block height.", async () =>
    textResult(() => client.latestHeight())
  );

  server.tool("aleo_latest_block", "Get the latest full block.", async () =>
    textResult(() => client.latestBlock())
  );

  server.tool("aleo_block", "Get a block by height or hash.", { heightOrHash: z.string() }, async ({ heightOrHash }) =>
    textResult(() => client.block(heightOrHash))
  );

  server.tool(
    "aleo_transaction",
    "Get a transaction by id. Poll after broadcasting to read output record ciphertexts.",
    { txId: z.string().describe("Transaction id at1...") },
    async ({ txId }) => textResult(() => client.transaction(txId))
  );

  server.tool("aleo_program", "Get the source of a deployed program.", { programId: z.string() }, async ({ programId }) =>
    textResult(() => client.program(programId))
  );

  server.tool("aleo_mappings", "List the mappings of a program.", { programId: z.string() }, async ({ programId }) =>
    textResult(() => client.mappings(programId))
  );

  server.tool(
    "aleo_mapping",
    "Read a mapping value: programId / mapping / key.",
    { programId: z.string(), mapping: z.string(), key: z.string() },
    async ({ programId, mapping, key }) => textResult(() => client.mappingValue(programId, mapping, key))
  );

  server.tool(
    "aleo_balance",
    "Get the public credits balance (microcredits) of an address.",
    { address: z.string() },
    async ({ address }) => textResult(() => client.mappingValue("credits.aleo", "account", address))
  );

  server.tool(
    "aleo_arc_balance",
    "Get the public ARC token balance of an address.",
    { address: z.string(), tokenProgram: z.string().optional().describe("Defaults to mock_token.aleo") },
    async ({ address, tokenProgram }) =>
      textResult(() => client.mappingValue(tokenProgram || DEFAULTS.mockTokenProgram, "account", address))
  );

  // ── Pure transaction builders (no leo, no key) ──────────────────────────

  server.tool(
    "build_fund_credits_escrow",
    "Build fund_credits_escrow: move public credits into payroll escrow, returns DepositVault.",
    { amount: z.string().describe('e.g. "1000u64"') },
    async ({ amount }) => textResult(() => buildFundCreditsEscrow(amount))
  );

  server.tool(
    "build_fund_arc_escrow",
    "Build fund_arc_escrow: move public ARC tokens into payroll escrow, returns DepositVault.",
    { tokenProgram: z.string().describe("e.g. \"'mock_token'\""), amount: z.string() },
    async ({ tokenProgram, amount }) => textResult(() => buildFundArcEscrow(tokenProgram, amount))
  );

  server.tool(
    "build_mint_mock_arc",
    "Build mint_public on mock_token.aleo to mint demo ARC tokens.",
    { receiver: z.string(), amount: z.string() },
    async ({ receiver, amount }) => textResult(() => buildMintMockArc(receiver, amount))
  );

  server.tool(
    "build_deposit",
    "Build a deposit call (1-16 receivers) consuming a DepositVault.",
    {
      vaultRecord: z.string().describe("Decrypted DepositVault plaintext"),
      allocations: z.array(allocationSchema).min(1).max(16),
      paddingReceiver: z.string().optional()
    },
    async ({ vaultRecord, allocations, paddingReceiver }) =>
      textResult(() => buildDepositTx(vaultRecord, allocations, paddingReceiver))
  );

  server.tool(
    "build_withdraw",
    "Build a withdrawal from a PayrollNote (auto-selects credits or ARC path).",
    {
      noteRecord: z.string().describe("Decrypted PayrollNote plaintext"),
      amount: z.string(),
      payoutTo: z.string().describe("Public payout address aleo1...")
    },
    async ({ noteRecord, amount, payoutTo }) =>
      textResult(() => buildEscrowWithdrawTx(noteRecord, amount, payoutTo))
  );

  // ── Local cryptography (requires leo on PATH) ───────────────────────────

  server.tool("random_field", "Generate a random Leo field element (no leo required).", async () =>
    textResult(() => randomField())
  );

  server.tool("gen_account", "Generate a new Aleo account (requires leo on PATH).", async () =>
    textResult(() => leoNewAccount())
  );

  server.tool(
    "decrypt_record",
    "Decrypt a record ciphertext into plaintext (requires leo). Feed the result into build_deposit or build_withdraw.",
    {
      ciphertext: z.string().describe("Record ciphertext record1..."),
      key: z.string().describe("View key or private key to decrypt with")
    },
    async ({ ciphertext, key }) => textResult(() => leoDecryptRecord(ciphertext, key))
  );

  // ── Sign and broadcast (requires leo + private key + project path) ──────

  server.tool(
    "execute",
    "Sign and run a built transaction via leo. After broadcasting, use aleo_transaction to poll confirmation, then decrypt_record on the output ciphertexts.",
    {
      builtTx: z.object(builtTxSchema),
      privateKey: z.string().describe("Aleo private key APrivateKey1..."),
      projectPath: z.string().describe("Path to the pactpay-aleo project root (with contracts/)"),
      broadcast: z.boolean().optional().describe("true (default) broadcasts; false only prints")
    },
    async ({ builtTx, privateKey, projectPath, broadcast }) =>
      textResult(() => leoExecute(builtTx, { privateKey, projectPath, broadcast }))
  );

  server.tool(
    "compile",
    "Compile Leo programs (requires leo + project path).",
    {
      target: z.enum(["mock", "payroll", "all"]),
      projectPath: z.string().describe("Path to the pactpay-aleo project root")
    },
    async ({ target, projectPath }) => textResult(() => leoBuild(target, projectPath))
  );

  server.tool(
    "test_contracts",
    "Run Leo-native payroll tests (requires leo + project path).",
    { projectPath: z.string().describe("Path to the pactpay-aleo project root") },
    async ({ projectPath }) => textResult(() => leoTest(projectPath))
  );

  server.tool(
    "deploy",
    "Deploy a program via leo. broadcast=false (default) only prints the tx.",
    {
      target: z.enum(["mock", "payroll"]),
      privateKey: z.string().describe("Aleo private key APrivateKey1..."),
      projectPath: z.string().describe("Path to the pactpay-aleo project root"),
      broadcast: z.boolean().optional()
    },
    async ({ target, privateKey, projectPath, broadcast }) =>
      textResult(() => leoDeploy(target, { privateKey, projectPath, broadcast }))
  );
}
