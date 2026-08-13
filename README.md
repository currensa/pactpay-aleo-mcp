# PactPay Aleo MCP Server

Privacy-preserving payroll on Aleo — exposed as a [Model Context Protocol](https://modelcontextprotocol.io) server.

This MCP server provides 21 tools that cover the full PactPay Aleo demo workflow: querying the Aleo network, constructing private payroll transactions, signing/broadcasting via `leo`, and decrypting output records. Zero configuration required — install and run.

## Quick Start

```bash
cd pactpay-aleo-mcp
npm install
npm start
```

Register with Claude Code:

```bash
claude mcp add pactpay-aleo -- node --experimental-strip-types /path/to/pactpay-aleo-mcp/src/index.ts
```

## Requirements

- **Node.js ≥ 22** (uses `--experimental-strip-types` for native TypeScript)
- **leo** on PATH (only for sign/broadcast/compile/test/decrypt tools; install with `cargo install leo-lang`)

No `.env` file or environment variables needed. The server ships with sensible defaults (testnet, Provable endpoint, standard program IDs).

## Tools

### Read-only Network Queries

No private key, no leo, no configuration. Just HTTP calls to the Aleo endpoint.

| Tool | Description |
|------|-------------|
| `aleo_height` | Latest block height |
| `aleo_latest_block` | Latest full block |
| `aleo_block` | Block by height or hash |
| `aleo_transaction` | Transaction by id (poll after broadcast) |
| `aleo_program` | Source of a deployed program |
| `aleo_mappings` | List mappings of a program |
| `aleo_mapping` | Read a single mapping value |
| `aleo_balance` | Public credits balance (microcredits) |
| `aleo_arc_balance` | Public ARC token balance |

### Transaction Builders

Pure functions — no leo, no key. Each returns a `{program, transition, args, imports?}` object ready for the `execute` tool.

| Tool | Description |
|------|-------------|
| `build_fund_credits_escrow` | Fund payroll escrow with public Aleo credits |
| `build_fund_arc_escrow` | Fund payroll escrow with public ARC tokens |
| `build_mint_mock_arc` | Mint demo ARC tokens (mock_token.aleo) |
| `build_deposit` | Create 1–16 private PayrollNote records from a DepositVault |
| `build_withdraw` | Withdraw from a PayrollNote (auto credits/ARC) |

### Local Cryptography

| Tool | Description | Requires leo? |
|------|-------------|:---:|
| `random_field` | Generate a random BLS12-377 field element | No |
| `gen_account` | Generate a new Aleo keypair | Yes |
| `decrypt_record` | Decrypt a record ciphertext into plaintext | Yes |

`decrypt_record` requires a `key` parameter (view key or private key).

### Sign and Broadcast

These tools call `leo execute` / `leo deploy` and require `privateKey` and `projectPath` as parameters.

| Tool | Description |
|------|-------------|
| `execute` | Sign and broadcast a built transaction |
| `compile` | Compile Leo programs (`leo build`) |
| `test_contracts` | Run Leo-native payroll tests |
| `deploy` | Deploy a program (print or broadcast) |

## End-to-End Workflow

A typical deposit → withdraw cycle using these tools:

```
1. build_fund_credits_escrow(amount: "1000u64")
   → returns builtTx

2. execute(builtTx, privateKey, projectPath)
   → returns { transactionId: "at1..." }

3. aleo_transaction(txId: "at1...")
   → poll until confirmed; extract DepositVault ciphertext from outputs

4. decrypt_record(ciphertext, key)
   → returns DepositVault plaintext

5. build_deposit(vaultRecord: <plaintext>, allocations: [{receiver, amount}])
   → returns builtTx

6. execute(builtTx, privateKey, projectPath)
   → creates PayrollNote records on-chain

7. aleo_transaction → decrypt_record
   → obtain PayrollNote plaintext

8. build_withdraw(noteRecord: <plaintext>, amount, payoutTo)
   → returns builtTx

9. execute(builtTx, privateKey, projectPath)
   → pays out public credits/tokens to payout address
```

## Defaults

| Setting | Default |
|---------|---------|
| Network | `testnet` |
| Endpoint | `https://api.explorer.provable.com/v1` |
| Payroll program | `payroll_private_v2.aleo` |
| Mock token program | `mock_token.aleo` |
| Priority fees | `0` |

## Project Structure

```
src/
├── index.ts        Entry point — creates server, registers tools, starts stdio transport
├── tools.ts        All 21 tool definitions and handlers
├── builders.ts     Pure transaction construction logic
├── leo.ts          leo CLI wrapper (execute/deploy/build/test/decrypt/account)
├── aleo-client.ts  HTTP client for Aleo node read queries
└── common.ts       Shared utilities and built-in defaults
```

## Known Limitations

- **No record discovery**: The server can decrypt known ciphertexts but cannot scan the chain for records belonging to an address. This requires an indexer or the Shield wallet browser extension.
- **Leo required for signing**: Unlike the web frontend (which delegates to Shield), this server signs via `leo execute` — the `leo` binary must be installed and on PATH.
- **Testnet only**: Defaults point to the Provable testnet explorer. Adjust endpoint/network via tool parameters if targeting a different network.

## License

MIT
