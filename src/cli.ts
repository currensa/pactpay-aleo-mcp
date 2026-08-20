#!/usr/bin/env node
import process from "node:process";
import { AleoClient } from "./aleo-client.ts";
import {
  buildDepositTx,
  buildEscrowWithdrawTx,
  buildFundArcEscrow,
  buildFundCreditsEscrow,
  buildMintMockArc,
  randomField,
  type BuiltTransaction,
  type ReceiverAllocation
} from "./builders.ts";
import { DEFAULTS } from "./common.ts";
import { leoDecryptRecord, leoExecute, leoNewAccount } from "./leo.ts";
import { scanUnspentPayrollRecords, type PayrollRecordKind } from "./records.ts";

type Options = Record<string, string | boolean>;

const HELP = `PactPay Aleo CLI

Usage: pactpay-aleo <command> [options]

Network: height, latest-block, block, transaction, program, mappings, mapping,
         balance, arc-balance
Builders: build-fund-credits, build-fund-arc, build-mint-mock,
          build-deposit, build-withdraw
Records: scan-deposit-vaults, scan-payroll-notes
Crypto: random-field, gen-account, decrypt-record
Execution: execute

Run pactpay-aleo help or see CLI.md for command options and examples.`;

function parseOptions(args: string[]): Options {
  const options: Options = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token?.startsWith("--")) throw new Error(`Unexpected argument "${token}".`);
    const equals = token.indexOf("=");
    if (equals > 2) {
      options[token.slice(2, equals)] = token.slice(equals + 1);
      continue;
    }
    const name = token.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      options[name] = true;
    } else {
      options[name] = next;
      index += 1;
    }
  }
  return options;
}

function required(options: Options, name: string, envName?: string): string {
  const value = options[name] ?? (envName ? process.env[envName] : undefined);
  if (typeof value !== "string" || !value) throw new Error(`Missing required --${name}.`);
  return value;
}

function optional(options: Options, name: string): string | undefined {
  const value = options[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`--${name} requires a value.`);
  return value;
}

function optionalInteger(options: Options, name: string): number | undefined {
  const value = optional(options, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`--${name} must be an integer.`);
  return parsed;
}

function json<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function print(value: unknown): void {
  if (typeof value === "string") process.stdout.write(`${value}\n`);
  else process.stdout.write(`${JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2)}\n`);
}

async function scan(client: AleoClient, options: Options, kind: PayrollRecordKind) {
  return scanUnspentPayrollRecords(client, {
    privateKey: required(options, "private-key", "ALEO_PRIVATE_KEY"),
    kind,
    startHeight: optionalInteger(options, "start-height"),
    endHeight: optionalInteger(options, "end-height"),
    maxBlocks: optionalInteger(options, "max-blocks")
  });
}

async function main(argv: string[]): Promise<void> {
  const [command = "help", ...rest] = argv;
  if (command === "help" || command === "--help" || command === "-h") {
    print(HELP);
    return;
  }

  const options = parseOptions(rest);
  const client = new AleoClient(DEFAULTS.endpoint, DEFAULTS.network);

  switch (command) {
    case "height": print(await client.latestHeight()); break;
    case "latest-block": print(await client.latestBlock()); break;
    case "block": print(await client.block(required(options, "height-or-hash"))); break;
    case "transaction": print(await client.transaction(required(options, "tx-id"))); break;
    case "program": print(await client.program(required(options, "program-id"))); break;
    case "mappings": print(await client.mappings(required(options, "program-id"))); break;
    case "mapping": print(await client.mappingValue(required(options, "program-id"), required(options, "mapping"), required(options, "key"))); break;
    case "balance": print(await client.mappingValue("credits.aleo", "account", required(options, "address"))); break;
    case "arc-balance": print(await client.mappingValue(optional(options, "token-program") ?? DEFAULTS.mockTokenProgram, "account", required(options, "address"))); break;
    case "build-fund-credits": print(buildFundCreditsEscrow(required(options, "amount"))); break;
    case "build-fund-arc": print(buildFundArcEscrow(required(options, "token-program"), required(options, "amount"))); break;
    case "build-mint-mock": print(buildMintMockArc(required(options, "receiver"), required(options, "amount"))); break;
    case "build-deposit": print(buildDepositTx(
      required(options, "vault-record"),
      json<ReceiverAllocation[]>(required(options, "allocations"), "--allocations"),
      optional(options, "padding-receiver")
    )); break;
    case "build-withdraw": print(buildEscrowWithdrawTx(
      required(options, "note-record"),
      required(options, "amount"),
      required(options, "payout-to")
    )); break;
    case "scan-deposit-vaults": print(await scan(client, options, "DepositVault")); break;
    case "scan-payroll-notes": print(await scan(client, options, "PayrollNote")); break;
    case "random-field": print(randomField()); break;
    case "gen-account": print(leoNewAccount()); break;
    case "decrypt-record": print(leoDecryptRecord(
      required(options, "ciphertext"),
      required(options, "key", "ALEO_VIEW_KEY")
    )); break;
    case "execute": print(leoExecute(
      json<BuiltTransaction>(required(options, "built-tx"), "--built-tx"),
      {
        privateKey: required(options, "private-key", "ALEO_PRIVATE_KEY"),
        broadcast: options.broadcast === true
      }
    )); break;
    default: throw new Error(`Unknown command "${command}". Run pactpay-aleo help.`);
  }
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
