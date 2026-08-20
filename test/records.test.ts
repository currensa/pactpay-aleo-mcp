import assert from "node:assert/strict";
import test from "node:test";
import { Account } from "@provablehq/sdk/testnet.js";
import type { AleoClient } from "../src/aleo-client.ts";
import { DEFAULTS } from "../src/common.ts";
import { scanUnspentPayrollRecords } from "../src/records.ts";

function temporaryKey(): string {
  const account = new Account();
  try {
    return account.privateKey().toString();
  } finally {
    account.destroy();
  }
}

test("scanner returns a bounded empty page and cursor", async () => {
  const latest = DEFAULTS.payrollDeploymentHeight + 100;
  const client = {
    latestHeight: async () => latest,
    blockRange: async () => [],
    isTransitionInputSpent: async () => false
  } as unknown as AleoClient;

  const result = await scanUnspentPayrollRecords(client, {
    privateKey: temporaryKey(),
    kind: "PayrollNote",
    startHeight: latest - 9,
    endHeight: latest,
    maxBlocks: 10
  });
  assert.equal(result.count, 0);
  assert.equal(result.nextEndHeight, latest - 10);
});

test("scanner rejects ranges before deployment", async () => {
  const client = { latestHeight: async () => DEFAULTS.payrollDeploymentHeight + 1 } as unknown as AleoClient;
  await assert.rejects(() => scanUnspentPayrollRecords(client, {
    privateKey: temporaryKey(),
    kind: "DepositVault",
    startHeight: DEFAULTS.payrollDeploymentHeight - 1,
    endHeight: DEFAULTS.payrollDeploymentHeight,
    maxBlocks: 2
  }), /cannot precede the payroll deployment/);
});
