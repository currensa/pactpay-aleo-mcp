import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MCP_ROOT = fileURLToPath(new URL("..", import.meta.url));
const NETWORK_SETTINGS_PATH = fileURLToPath(new URL("../config/networks.json", import.meta.url));

// Internal network configuration

type JsonObject = Record<string, unknown>;

function objectAt(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid network settings: ${label} must be an object.`);
  }
  return value as JsonObject;
}

function stringAt(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid network settings: ${label} must be a non-empty string.`);
  }
  return value;
}

function programAt(value: unknown, label: string): string {
  const program = stringAt(value, label);
  if (!/^[a-z][a-z0-9_]*\.aleo$/.test(program)) {
    throw new Error(`Invalid network settings: ${label} must be an Aleo program ID.`);
  }
  return program;
}

function heightAt(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Invalid network settings: ${label} must be a non-negative integer.`);
  }
  return value as number;
}

function loadDefaults() {
  const root = objectAt(JSON.parse(readFileSync(NETWORK_SETTINGS_PATH, "utf8")), "root");
  if (root.schemaVersion !== 1) {
    throw new Error("Invalid network settings: unsupported schemaVersion.");
  }
  const network = stringAt(root.defaultNetwork, "defaultNetwork");
  const networks = objectAt(root.networks, "networks");
  const selected = objectAt(networks[network], `networks.${network}`);
  const contracts = objectAt(selected.contracts, `networks.${network}.contracts`);
  const payroll = objectAt(contracts.payroll, `networks.${network}.contracts.payroll`);
  const mockToken = objectAt(contracts.mockToken, `networks.${network}.contracts.mockToken`);
  const payrollDeployment = objectAt(payroll.deployment, `networks.${network}.contracts.payroll.deployment`);
  const endpoint = stringAt(selected.rpcUrl, `networks.${network}.rpcUrl`);

  const url = new URL(endpoint);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Invalid network settings: networks.${network}.rpcUrl must use HTTP(S).`);
  }

  const priorityFees = stringAt(selected.priorityFees, `networks.${network}.priorityFees`);
  if (priorityFees !== "default" && !/^\d+$/.test(priorityFees)) {
    throw new Error(`Invalid network settings: networks.${network}.priorityFees must be digits or "default".`);
  }

  return Object.freeze({
    network,
    endpoint,
    payrollProgram: programAt(payroll.programId, `networks.${network}.contracts.payroll.programId`),
    payrollDeploymentHeight: heightAt(payrollDeployment.blockHeight, `networks.${network}.contracts.payroll.deployment.blockHeight`),
    mockTokenProgram: programAt(mockToken.programId, `networks.${network}.contracts.mockToken.programId`),
    priorityFees
  });
}

export const DEFAULTS = loadDefaults();

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

// ─── Leo CLI runner ───────────────────────────────────────────────────────────

export type LeoResult = {
  stdout: string;
  stderr: string;
  combined: string;
};

function printableLeoArgs(args: string[]): string {
  const sensitiveFlags = new Set(["--private-key", "-k"]);
  return args.map((arg, index) => sensitiveFlags.has(args[index - 1] ?? "") ? "***" : arg).join(" ");
}

export function runLeo(args: string[]): LeoResult {
  const result = spawnSync("leo", args, {
    cwd: MCP_ROOT,
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
      `leo ${printableLeoArgs(args)} failed (exit ${result.status}).\n${stderr || stdout}`
    );
  }

  return { stdout, stderr, combined: `${stdout}\n${stderr}`.trim() };
}
