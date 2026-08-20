import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function cli(args: string[]) {
  return spawnSync(process.execPath, ["--experimental-strip-types", "src/cli.ts", ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

test("CLI help lists command groups", () => {
  const result = cli(["help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Network:/);
  assert.match(result.stdout, /Execution:/);
});

test("CLI builds a credits funding transaction", () => {
  const result = cli(["build-fund-credits", "--amount", "25u64"]);
  assert.equal(result.status, 0, result.stderr);
  const tx = JSON.parse(result.stdout);
  assert.equal(tx.transition, "fund_credits_escrow");
  assert.equal(tx.args[0], "25u64");
});

test("CLI random-field emits a Leo field", () => {
  const result = cli(["random-field"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout.trim(), /^\d+field$/);
});

test("CLI reports unknown commands", () => {
  const result = cli(["not-a-command"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command/);
});
