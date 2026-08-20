import assert from "node:assert/strict";
import test from "node:test";
import {
  ALEO_ZERO_ADDRESS,
  buildDepositTx,
  buildEscrowWithdrawTx,
  buildFundArcEscrow,
  buildFundCreditsEscrow,
  buildMintMockArc
} from "../src/builders.ts";
import { DEFAULTS } from "../src/common.ts";

const vault = `{ owner: ${ALEO_ZERO_ADDRESS}.private, token_program: credits.private, amount: 10u64.private, nonce: 1field.private, _nonce: 1group.public }`;
const note = `{ owner: ${ALEO_ZERO_ADDRESS}.private, token_program: credits.private, amount: 10u64.private, note_secret: 1field.private, nonce: 2field.private, _nonce: 2group.public }`;

test("fund builders use configured programs and transitions", () => {
  assert.equal(buildFundCreditsEscrow("10u64").program, DEFAULTS.payrollProgram);
  assert.deepEqual(buildFundArcEscrow("'mock_token'", "10u64").imports, [DEFAULTS.mockTokenProgram]);
  assert.equal(buildMintMockArc(ALEO_ZERO_ADDRESS, "10u64").transition, "mint_public");
});

test("deposit builder selects one and fixed-width batch transitions", () => {
  assert.equal(buildDepositTx(vault, [{ receiver: ALEO_ZERO_ADDRESS, amount: "10u64" }]).transition, "deposit_one");
  const batch = buildDepositTx(vault, [
    { receiver: ALEO_ZERO_ADDRESS, amount: "4u64" },
    { receiver: ALEO_ZERO_ADDRESS, amount: "6u64" }
  ]);
  assert.equal(batch.transition, "deposit_16");
  assert.match(batch.args[1]!, /^\[.*\]$/);
});

test("withdraw builder detects credits notes", () => {
  const tx = buildEscrowWithdrawTx(note, "3u64", ALEO_ZERO_ADDRESS);
  assert.equal(tx.transition, "withdraw_credits_from_escrow");
  assert.equal(tx.args.length, 6);
});

test("builders reject malformed amounts", () => {
  assert.throws(() => buildFundCreditsEscrow("-1"), /Invalid amount/);
});
