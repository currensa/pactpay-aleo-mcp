import { DEFAULTS, findTransactionId, resolveContractPath, runLeo } from "./common.ts";
import type { BuiltTransaction } from "./builders.ts";

function networkArgs(network?: string, endpoint?: string): string[] {
  return [
    "--network", network || DEFAULTS.network,
    "--endpoint", endpoint || DEFAULTS.endpoint
  ];
}

function shortNameForProgram(programId: string): "mock" | "payroll" {
  if (programId.includes("payroll")) return "payroll";
  if (programId.includes("mock_token")) return "mock";
  throw new Error(`Cannot resolve contract for "${programId}". Expected payroll or mock_token.`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type ExecuteOpts = {
  privateKey: string;
  projectPath: string;
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

export function leoExecute(tx: BuiltTransaction, opts: ExecuteOpts): ExecuteResult {
  const shortName = shortNameForProgram(tx.program);
  const broadcast = opts.broadcast ?? true;
  const args = [
    "execute",
    tx.transition,
    ...tx.args,
    "--path", resolveContractPath(opts.projectPath, shortName),
    ...networkArgs(opts.network, opts.endpoint),
    "--private-key", opts.privateKey,
    "--priority-fees", opts.priorityFees || DEFAULTS.priorityFees,
    "--yes",
    broadcast ? "--broadcast" : "--print"
  ];

  const { combined } = runLeo(args, opts.projectPath);
  return {
    transactionId: findTransactionId(combined),
    broadcast,
    program: tx.program,
    transition: tx.transition,
    output: combined
  };
}

export type DeployOpts = {
  privateKey: string;
  projectPath: string;
  broadcast?: boolean;
  network?: string;
  endpoint?: string;
  priorityFees?: string;
};

export type DeployResult = {
  transactionId: string | null;
  broadcast: boolean;
  target: string;
  output: string;
};

export function leoDeploy(target: "mock" | "payroll", opts: DeployOpts): DeployResult {
  const broadcast = opts.broadcast ?? false;
  const args = [
    "deploy",
    "--path", resolveContractPath(opts.projectPath, target),
    ...networkArgs(opts.network, opts.endpoint),
    "--private-key", opts.privateKey,
    "--priority-fees", opts.priorityFees || DEFAULTS.priorityFees,
    "--yes",
    broadcast ? "--broadcast" : "--print"
  ];

  const { combined } = runLeo(args, opts.projectPath);
  return {
    transactionId: findTransactionId(combined),
    broadcast,
    target,
    output: combined
  };
}

export function leoBuild(target: "mock" | "payroll" | "all", projectPath: string): string {
  const targets = target === "all" ? (["mock", "payroll"] as const) : [target];
  const outputs: string[] = [];
  for (const item of targets) {
    outputs.push(runLeo(["build", "--path", resolveContractPath(projectPath, item)], projectPath).stdout.trim());
  }
  return outputs.join("\n\n").trim();
}

export function leoTest(projectPath: string): string {
  return runLeo(["test", "--path", resolveContractPath(projectPath, "payroll")], projectPath).stdout.trim();
}

export function leoNewAccount(network?: string, endpoint?: string): string {
  return runLeo(["account", "new", ...networkArgs(network, endpoint)]).combined;
}

export function leoDecryptRecord(ciphertext: string, key: string, network?: string, endpoint?: string): string {
  return runLeo([
    "account", "decrypt",
    "--ciphertext", ciphertext,
    "-k", key,
    ...networkArgs(network, endpoint)
  ]).combined;
}
