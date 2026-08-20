import assert from "node:assert/strict";
import test from "node:test";
import { buildFundArcEscrow, buildFundCreditsEscrow } from "../src/builders.ts";
import { leoExecuteArgs } from "../src/leo.ts";

const options = {
  privateKey: "test-private-key",
  broadcast: false
};

test("Leo execution loads dynamic external programs from builder imports", () => {
  const args = leoExecuteArgs(buildFundArcEscrow("'mock_token'", "1000u64"), options);
  const withIndex = args.indexOf("--with");

  assert.notEqual(withIndex, -1);
  assert.equal(args[withIndex + 1], "mock_token.aleo");
});

test("Leo execution omits --with when a transaction has no imports", () => {
  const args = leoExecuteArgs(buildFundCreditsEscrow("1000u64"), options);
  assert.equal(args.includes("--with"), false);
});
