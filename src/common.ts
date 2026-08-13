import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// ─── Built-in defaults (zero config) ─────────────────────────────────────────

export const DEFAULTS = {
  network: "testnet",
  endpoint: "https://api.explorer.provable.com/v1",
  payrollProgram: "payroll_private_v2.aleo",
  mockTokenProgram: "mock_token.aleo",
  priorityFees: "0"
} as const;

// ─── Utilities ────────────────────────────────────────────────────────────────

export function redact(value: string | undefined) {
  if (!value) return "";
  if (value.length <= 12) return "***";
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function findTransactionId(value: unknown): string | null {
  if (typeof value === "string") {
    const match = value.match(/\bat1[0-9a-z]+\b/i);
    return match?.[0] ?? null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTransactionId(item);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = findTransactionId(item);
      if (found) return found;
    }
  }
  return null;
}

// ─── Contract path resolver ───────────────────────────────────────────────────

export function resolveContractPath(projectPath: string, name: "mock" | "payroll"): string {
  if (!existsSync(projectPath)) {
    throw new Error(`Project path "${projectPath}" does not exist.`);
  }
  if (name === "mock") return path.join(projectPath, "contracts/mock_token");
  if (name === "payroll") return path.join(projectPath, "contracts/payroll_private");
  throw new Error(`Unknown program '${name}'. Use mock or payroll.`);
}

// ─── Leo CLI runner ───────────────────────────────────────────────────────────

export type LeoResult = {
  stdout: string;
  stderr: string;
  combined: string;
};

export function runLeo(args: string[], cwd?: string): LeoResult {
  const result = spawnSync("leo", args, {
    cwd: cwd || process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.error) {
    throw new Error(
      "leo CLI was not found on PATH. Install it with `cargo install leo-lang` and retry."
    );
  }

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (result.status !== 0) {
    throw new Error(
      `leo ${args.join(" ")} failed (exit ${result.status}).\n${stderr || stdout}`
    );
  }

  return { stdout, stderr, combined: `${stdout}\n${stderr}`.trim() };
}
