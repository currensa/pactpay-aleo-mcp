import { PrivateKey, RecordCiphertext, ViewKey } from "@provablehq/sdk/testnet.js";
import type { AleoClient } from "./aleo-client.ts";
import { DEFAULTS } from "./common.ts";

export type PayrollRecordKind = "DepositVault" | "PayrollNote";

export type ScanRecordsOpts = {
  privateKey: string;
  kind: PayrollRecordKind;
  startHeight?: number;
  endHeight?: number;
  maxBlocks?: number;
};

type RecordOutput = {
  ciphertext: string;
  kind: PayrollRecordKind;
};

const DEFAULT_SCAN_BLOCKS = 1_000;
const MAX_SCAN_BLOCKS = 10_000;
const BLOCKS_PER_REQUEST = 50;
const BLOCK_REQUEST_CONCURRENCY = 4;

function recordKind(functionName: string, outputIndex: number): PayrollRecordKind | null {
  if ((functionName === "fund_credits_escrow" || functionName === "fund_arc_escrow") && outputIndex === 0) {
    return "DepositVault";
  }
  if (functionName === "deposit_one" || functionName === "deposit_16") return "PayrollNote";
  if ((functionName === "withdraw_credits_from_escrow" || functionName === "withdraw_arc_from_escrow") && outputIndex === 0) {
    return "PayrollNote";
  }
  return null;
}

function recordOutputs(value: unknown): RecordOutput[] {
  if (!Array.isArray(value)) throw new Error("Unexpected block-range response from the Aleo endpoint.");
  const outputs: RecordOutput[] = [];

  for (const block of value) {
    if (!block || typeof block !== "object") continue;
    const transactions = (block as Record<string, unknown>).transactions;
    if (!Array.isArray(transactions)) continue;

    for (const confirmed of transactions) {
      if (!confirmed || typeof confirmed !== "object") continue;
      const transaction = (confirmed as Record<string, unknown>).transaction;
      if (!transaction || typeof transaction !== "object") continue;
      const execution = (transaction as Record<string, unknown>).execution;
      if (!execution || typeof execution !== "object") continue;
      const transitions = (execution as Record<string, unknown>).transitions;
      if (!Array.isArray(transitions)) continue;

      for (const transition of transitions) {
        if (!transition || typeof transition !== "object") continue;
        const item = transition as Record<string, unknown>;
        if (item.program !== DEFAULTS.payrollProgram || typeof item.function !== "string" || !Array.isArray(item.outputs)) continue;

        item.outputs.forEach((output, outputIndex) => {
          const kind = recordKind(item.function as string, outputIndex);
          if (!kind || !output || typeof output !== "object") return;
          const record = output as Record<string, unknown>;
          if (record.type === "record" && typeof record.value === "string") {
            outputs.push({ ciphertext: record.value, kind });
          }
        });
      }
    }
  }
  return outputs;
}

async function fetchBlocks(client: AleoClient, startHeight: number, endHeight: number): Promise<unknown[]> {
  const ranges: Array<[number, number]> = [];
  for (let start = startHeight; start <= endHeight; start += BLOCKS_PER_REQUEST) {
    ranges.push([start, Math.min(endHeight + 1, start + BLOCKS_PER_REQUEST)]);
  }

  const blocks: unknown[] = [];
  for (let index = 0; index < ranges.length; index += BLOCK_REQUEST_CONCURRENCY) {
    const batch = ranges.slice(index, index + BLOCK_REQUEST_CONCURRENCY);
    const results = await Promise.all(batch.map(([start, end]) => client.blockRange(start, end)));
    for (const result of results) {
      if (!Array.isArray(result)) throw new Error("Unexpected block-range response from the Aleo endpoint.");
      blocks.push(...result);
    }
  }
  return blocks;
}

export async function scanUnspentPayrollRecords(client: AleoClient, opts: ScanRecordsOpts) {
  const maxBlocks = opts.maxBlocks ?? DEFAULT_SCAN_BLOCKS;
  if (!Number.isInteger(maxBlocks) || maxBlocks < 1 || maxBlocks > MAX_SCAN_BLOCKS) {
    throw new Error(`maxBlocks must be an integer from 1 to ${MAX_SCAN_BLOCKS}.`);
  }

  let privateKey: PrivateKey | undefined;
  let viewKey: ViewKey | undefined;
  try {
    privateKey = PrivateKey.from_string(opts.privateKey);
    viewKey = privateKey.to_view_key();
    const latestHeight = Number(await client.latestHeight());
    const endHeight = opts.endHeight ?? latestHeight;
    const startHeight = opts.startHeight ?? Math.max(DEFAULTS.payrollDeploymentHeight, endHeight - maxBlocks + 1);

    if (!Number.isInteger(latestHeight)) throw new Error("The Aleo endpoint returned an invalid latest height.");
    if (!Number.isInteger(startHeight) || !Number.isInteger(endHeight) || startHeight < 0 || endHeight < startHeight) {
      throw new Error("startHeight and endHeight must define a valid non-negative block range.");
    }
    if (endHeight > latestHeight) throw new Error(`endHeight cannot exceed the latest height (${latestHeight}).`);
    if (startHeight < DEFAULTS.payrollDeploymentHeight) {
      throw new Error(`startHeight cannot precede the payroll deployment (${DEFAULTS.payrollDeploymentHeight}).`);
    }
    if (endHeight - startHeight + 1 > maxBlocks) {
      throw new Error(`Requested range exceeds maxBlocks (${maxBlocks}). Scan another page using nextEndHeight.`);
    }

    const scanPrivateKey = privateKey;
    const scanViewKey = viewKey;
    const candidates = recordOutputs(await fetchBlocks(client, startHeight, endHeight))
      .filter((candidate) => candidate.kind === opts.kind);
    const owned = candidates.flatMap((candidate) => {
      let ciphertext: RecordCiphertext | undefined;
      try {
        ciphertext = RecordCiphertext.fromString(candidate.ciphertext);
        if (!ciphertext.isOwner(scanViewKey)) return [];
        const plaintext = ciphertext.decrypt(scanViewKey);
        try {
          const recordViewKey = plaintext.recordViewKey(scanViewKey).toString();
          const serialNumber = plaintext.serialNumberString(scanPrivateKey, DEFAULTS.payrollProgram, candidate.kind, recordViewKey);
          return [{ plaintext: plaintext.toString(), serialNumber }];
        } finally {
          plaintext.free();
        }
      } catch {
        return [];
      } finally {
        ciphertext?.free();
      }
    });

    const spent = await Promise.all(owned.map((record) => client.isTransitionInputSpent(record.serialNumber)));
    const records = owned.filter((_, index) => !spent[index]).map((record) => record.plaintext);

    return {
      recordType: opts.kind,
      program: DEFAULTS.payrollProgram,
      unspentOnly: true,
      startHeight,
      endHeight,
      latestHeight,
      nextEndHeight: startHeight > DEFAULTS.payrollDeploymentHeight ? startHeight - 1 : null,
      count: records.length,
      records
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replaceAll(opts.privateKey, "***"));
  } finally {
    viewKey?.free();
    privateKey?.free();
  }
}
