import assert from "node:assert/strict";
import test from "node:test";
import { AleoClient } from "../src/aleo-client.ts";

test("Aleo client falls back to the alternate latest-height route", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return urls.length === 1
      ? new Response("missing", { status: 404 })
      : new Response("12345", { status: 200 });
  };
  try {
    const client = new AleoClient("https://example.test/v1/", "testnet");
    assert.equal(await client.latestHeight(), 12345);
    assert.deepEqual(urls, [
      "https://example.test/v1/testnet/latest/height",
      "https://example.test/v1/testnet/latest/block/height"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Aleo client URL-encodes mapping components", async () => {
  const originalFetch = globalThis.fetch;
  let requested = "";
  globalThis.fetch = async (input) => {
    requested = String(input);
    return new Response("null", { status: 200 });
  };
  try {
    const client = new AleoClient("https://example.test/v1", "testnet");
    await client.mappingValue("program.aleo", "some mapping", "'credits'");
    assert.equal(requested, "https://example.test/v1/testnet/program/program.aleo/mapping/some%20mapping/'credits'");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
