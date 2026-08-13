// Pure Aleo transaction builders — fully self-contained, zero config required.

import { DEFAULTS } from "./common.ts";

export const MAX_BATCH_RECEIVERS = 16;

export const payrollTransitions = {
  fundCreditsEscrow: "fund_credits_escrow",
  fundArcEscrow: "fund_arc_escrow",
  depositOne: "deposit_one",
  deposit16: "deposit_16",
  withdrawCreditsFromEscrow: "withdraw_credits_from_escrow",
  withdrawArcFromEscrow: "withdraw_arc_from_escrow"
} as const;

export const mockTokenTransitions = {
  mintPublic: "mint_public",
  transferPublic: "transfer_public",
  transferPublicAsSigner: "transfer_public_as_signer"
} as const;

export type ReceiverAllocation = {
  receiver: string;
  amount: string;
};

export type BuiltTransaction = {
  program: string;
  transition: string;
  args: string[];
  imports?: string[];
};

type PayrollRecordName = "DepositVault" | "PayrollNote";

export const ALEO_ZERO_ADDRESS = "aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc";

export function randomField(): string {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  const value = bytes.reduce((acc, byte) => (acc << 8n) + BigInt(byte), 0n);
  return `${value}field`;
}

function normalizeAmount(value: string, label = "amount"): string {
  const amount = value.trim();
  if (!/^[0-9]+(u64|u32|u128)?$/.test(amount)) {
    throw new Error(`Invalid ${label} "${value}". Must be a non-negative integer (e.g. "1000u64").`);
  }
  return amount;
}

function normalizeAddress(value: string, label = "address"): string {
  const address = value.trim();
  if (!/^aleo1[0-9a-z]+$/i.test(address)) {
    throw new Error(`Invalid ${label} "${value}". Must be a valid Aleo address.`);
  }
  return address;
}

function normalizeIdentifier(value: string, label = "identifier"): string {
  const identifier = value.trim();
  if (!/^'[a-zA-Z][a-zA-Z0-9_]*'$/.test(identifier)) {
    throw new Error(`Invalid ${label} "${value}". Must be a Leo identifier literal (e.g. "'mock_token'").`);
  }
  return identifier;
}

function identifierLiteralToProgramId(identifier: string): string {
  return `${identifier.slice(1, -1)}.aleo`;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecordPlaintext(value: string, recordName: PayrollRecordName) {
  const payload = value.toLowerCase();
  if (recordName === "DepositVault") {
    return payload.includes("owner") && payload.includes("token_program") && payload.includes("amount") && payload.includes("nonce") && !payload.includes("note_secret");
  }
  return payload.includes("owner") && payload.includes("token_program") && payload.includes("amount") && payload.includes("note_secret") && payload.includes("nonce");
}

function findRecordPlaintext(value: unknown, recordName: PayrollRecordName, seen = new WeakSet<object>()): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = parseJson(trimmed);
    if (parsed && parsed !== value) return findRecordPlaintext(parsed, recordName, seen);
    return isRecordPlaintext(trimmed, recordName) ? trimmed : null;
  }
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const record = value as Record<string, unknown>;
  for (const key of ["plaintext", "plainText", "decrypted", "decryptedRecord", "recordPlaintext", "record_plaintext"]) {
    const found = findRecordPlaintext(record[key], recordName, seen);
    if (found) return found;
  }
  for (const nested of Object.values(record)) {
    const found = findRecordPlaintext(nested, recordName, seen);
    if (found) return found;
  }
  return null;
}

export function recordInput(value: string, recordName: PayrollRecordName) {
  const trimmed = value.trim();
  const found = findRecordPlaintext(trimmed, recordName);
  if (found) return found;
  throw new Error(`Selected ${recordName} is not a decrypted record plaintext.`);
}

export function payrollNoteTokenProgram(value: string): string {
  const note = recordInput(value, "PayrollNote");
  const match = note.match(/(?:token_program|tokenProgram)\s*(?::|=)\s*(?:["']\s*)?'?([a-zA-Z][a-zA-Z0-9_]*)'?/);
  if (!match?.[1]) {
    throw new Error("Selected PayrollNote does not include a readable token program.");
  }
  return match[1];
}

// ─── Builders ─────────────────────────────────────────────────────────────────

export function buildFundCreditsEscrow(amount: string): BuiltTransaction {
  return {
    program: DEFAULTS.payrollProgram,
    transition: payrollTransitions.fundCreditsEscrow,
    args: [normalizeAmount(amount), randomField()]
  };
}

export function buildFundArcEscrow(tokenProgram: string, amount: string): BuiltTransaction {
  const id = normalizeIdentifier(tokenProgram, "token program");
  return {
    program: DEFAULTS.payrollProgram,
    transition: payrollTransitions.fundArcEscrow,
    args: [id, normalizeAmount(amount), randomField()],
    imports: [identifierLiteralToProgramId(id)]
  };
}

export function buildMintMockArc(receiver: string, amount: string): BuiltTransaction {
  return {
    program: DEFAULTS.mockTokenProgram,
    transition: mockTokenTransitions.mintPublic,
    args: [normalizeAddress(receiver, "mock holder"), normalizeAmount(amount)]
  };
}

export function buildDepositTx(
  vaultRecord: string,
  allocations: ReceiverAllocation[],
  paddingReceiver?: string
): BuiltTransaction {
  if (!vaultRecord.trim()) throw new Error("Select a DepositVault record first.");

  const vaultRecordInput = recordInput(vaultRecord, "DepositVault");
  const active = allocations.filter((a) => a.receiver.trim() || a.amount.trim());

  if (active.length === 0) throw new Error("At least one receiver is required.");
  if (active.some((a) => !a.receiver.trim() || !a.amount.trim())) {
    throw new Error("Every active receiver row needs both an address and an amount.");
  }

  const normalized = active.map((a) => ({
    receiver: normalizeAddress(a.receiver, "receiver address"),
    amount: normalizeAmount(a.amount)
  }));

  if (normalized.length === 1) {
    const [a] = normalized;
    return {
      program: DEFAULTS.payrollProgram,
      transition: payrollTransitions.depositOne,
      args: [vaultRecordInput, a.receiver, a.amount, randomField(), randomField()]
    };
  }

  if (normalized.length > MAX_BATCH_RECEIVERS) {
    throw new Error(`A single deposit supports up to ${MAX_BATCH_RECEIVERS} receivers.`);
  }

  const pad = paddingReceiver ? normalizeAddress(paddingReceiver, "padding receiver") : ALEO_ZERO_ADDRESS;
  const padded = [
    ...normalized,
    ...Array.from({ length: MAX_BATCH_RECEIVERS - normalized.length }, () => ({
      receiver: pad,
      amount: "0u64"
    }))
  ];

  return {
    program: DEFAULTS.payrollProgram,
    transition: payrollTransitions.deposit16,
    args: [
      vaultRecordInput,
      `[${padded.map((a) => a.receiver).join(", ")}]`,
      `[${padded.map((a) => a.amount).join(", ")}]`,
      `[${Array.from({ length: MAX_BATCH_RECEIVERS }, () => randomField()).join(", ")}]`,
      `[${Array.from({ length: MAX_BATCH_RECEIVERS }, () => randomField()).join(", ")}]`
    ]
  };
}

export function buildCreditsEscrowWithdrawTx(noteRecord: string, amount: string, payoutTo: string): BuiltTransaction {
  if (!noteRecord.trim()) throw new Error("Select a PayrollNote record first.");
  const input = recordInput(noteRecord, "PayrollNote");
  return {
    program: DEFAULTS.payrollProgram,
    transition: payrollTransitions.withdrawCreditsFromEscrow,
    args: [input, normalizeAmount(amount), normalizeAddress(payoutTo, "payout address"), randomField(), randomField(), randomField()]
  };
}

export function buildArcEscrowWithdrawTx(noteRecord: string, amount: string, payoutTo: string): BuiltTransaction {
  if (!noteRecord.trim()) throw new Error("Select a PayrollNote record first.");
  const input = recordInput(noteRecord, "PayrollNote");
  const token = payrollNoteTokenProgram(noteRecord);
  return {
    program: DEFAULTS.payrollProgram,
    transition: payrollTransitions.withdrawArcFromEscrow,
    args: [input, normalizeAmount(amount), normalizeAddress(payoutTo, "payout address"), randomField(), randomField(), randomField()],
    imports: [`${token}.aleo`]
  };
}

export function buildEscrowWithdrawTx(noteRecord: string, amount: string, payoutTo: string): BuiltTransaction {
  return payrollNoteTokenProgram(noteRecord) === "credits"
    ? buildCreditsEscrowWithdrawTx(noteRecord, amount, payoutTo)
    : buildArcEscrowWithdrawTx(noteRecord, amount, payoutTo);
}
