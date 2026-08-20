import { DEFAULTS, findTransactionId, runLeo } from "./common.ts";
import type { BuiltTransaction } from "./builders.ts";

function networkArgs(network?: string, endpoint?: string): string[] {
  return [
    "--network", network || DEFAULTS.network,
    "--endpoint", endpoint || DEFAULTS.endpoint
  ];
}

function networkOnlyArgs(network?: string): string[] {
  return ["--network", network || DEFAULTS.network];
}

function assertSupportedProgram(programId: string): void {
  if (programId !== DEFAULTS.payrollProgram && programId !== DEFAULTS.mockTokenProgram) {
    throw new Error(`Unsupported program "${programId}".`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type ExecuteOpts = {
  privateKey: string;
  broadcast?: boolean;
  network?: string;
  endpoint?: string;
  priorityFees?: string;
};

export type ExecuteResult = {
  transactionId: string | null;
  broadcast: boolean;
  program: string;
  transition: string;
  output: string;
};

export function leoExecuteArgs(tx: BuiltTransaction, opts: ExecuteOpts): string[] {
  assertSupportedProgram(tx.program);
  const broadcast = opts.broadcast ?? true;
  return [
    "execute",
    `${tx.program}::${tx.transition}`,
    ...tx.args,
    "--no-local",
    ...(tx.imports?.length ? ["--with", tx.imports.join(",")] : []),
    ...networkArgs(opts.network, opts.endpoint),
    "--private-key", opts.privateKey,
    "--priority-fees", opts.priorityFees || DEFAULTS.priorityFees,
    "--yes",
    broadcast ? "--broadcast" : "--print"
  ];
}

export function leoExecute(tx: BuiltTransaction, opts: ExecuteOpts): ExecuteResult {
  const broadcast = opts.broadcast ?? true;
  const args = leoExecuteArgs(tx, opts);

  const { combined } = runLeo(args);
  return {
    transactionId: findTransactionId(combined),
    broadcast,
    program: tx.program,
    transition: tx.transition,
    output: combined
  };
}

export function leoNewAccount(network?: string, endpoint?: string): string {
  return runLeo(["account", "new", ...networkArgs(network, endpoint)]).combined;
}

export function leoDecryptRecord(ciphertext: string, key: string, network?: string): string {
  return runLeo([
    "account", "decrypt",
    "--ciphertext", ciphertext,
    "-k", key,
    ...networkOnlyArgs(network)
  ]).combined;
}
