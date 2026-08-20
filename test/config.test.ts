import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULTS } from "../src/common.ts";

test("internal network settings load the deployed programs", () => {
  assert.equal(DEFAULTS.network, "testnet");
  assert.match(DEFAULTS.endpoint, /^https?:\/\//);
  assert.equal(DEFAULTS.payrollProgram, "payroll_private_v2.aleo");
  assert.equal(DEFAULTS.mockTokenProgram, "mock_token.aleo");
  assert.ok(DEFAULTS.payrollDeploymentHeight > 0);
});
