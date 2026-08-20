# PactPay Aleo MCP Server

Privacy-preserving payroll on Aleo — exposed as a [Model Context Protocol](https://modelcontextprotocol.io) server.

This MCP server provides 20 tools that cover the PactPay Aleo workflow: querying the Aleo network, discovering private payroll records, constructing transactions, signing/broadcasting via `leo`, and decrypting output records. Zero configuration required — install and run.

## Quick Start

```bash
cd pactpay-aleo-mcp
npm install
npm run build
npm start
```

Register the compiled stdio server with an MCP client. For Claude Code:

```bash
claude mcp add pactpay-aleo -- node /path/to/pactpay-aleo-mcp/dist/index.js
```

See [MCP.md](MCP.md) for client configuration, every tool's input schema,
transaction safety, record-scan pagination, and complete usage examples.

The same operations are available from the standalone CLI:

```bash
npm run cli -- help
npm run cli -- height
```

See [CLI.md](CLI.md) for every command, option, and safety behavior.

## Documentation

| Guide | Use it for |
|---|---|
| [MCP.md](MCP.md) | MCP client setup, tool inputs, workflows, and key handling |
| [CLI.md](CLI.md) | Direct shell commands and environment-variable usage |

## Requirements

- **Node.js ≥ 22**
- **leo** on PATH (only for sign/broadcast/decrypt tools; install with `cargo install leo-lang`)

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

### Private Record Scanning

| Tool | Description |
|------|-------------|
| `scan_deposit_vaults` | Find owned, unspent `DepositVault` records in a bounded block range |
| `scan_payroll_notes` | Find owned, unspent `PayrollNote` records in a bounded block range |

Both scanners use the supplied private key locally and restrict discovery to the configured payroll program. A scan covers the latest 1,000 blocks by default and returns `nextEndHeight` for scanning the preceding page, stopping at the configured payroll deployment height. At most 10,000 blocks may be requested per call.

### Local Cryptography

| Tool | Description | Requires leo? |
|------|-------------|:---:|
| `random_field` | Generate a random BLS12-377 field element | No |
| `gen_account` | Generate a new Aleo keypair | Yes |
| `decrypt_record` | Decrypt a record ciphertext into plaintext | Yes |

`decrypt_record` requires a `key` parameter (view key or private key).

### Sign and Broadcast

The `execute` tool calls the deployed program through `leo execute --no-local` and requires a `privateKey`. It does not require PactPay contract sources or another project directory.

| Tool | Description |
|------|-------------|
| `execute` | Sign and broadcast a built transaction |

## End-to-End Workflow

A typical deposit → withdraw cycle using these tools:

```
1. build_fund_credits_escrow(amount: "1000u64")
   → returns builtTx

2. execute(builtTx, privateKey)
   → returns { transactionId: "at1..." }

3. aleo_transaction(txId: "at1...")
   → poll until confirmed; extract DepositVault ciphertext from outputs

4. decrypt_record(ciphertext, key)
   → returns DepositVault plaintext

5. build_deposit(vaultRecord: <plaintext>, allocations: [{receiver, amount}])
   → returns builtTx

6. execute(builtTx, privateKey)
   → creates PayrollNote records on-chain

7. aleo_transaction → decrypt_record
   → obtain PayrollNote plaintext

8. build_withdraw(noteRecord: <plaintext>, amount, payoutTo)
   → returns builtTx

9. execute(builtTx, privateKey)
   → pays out public credits/tokens to payout address
```

## Network Configuration

Public network and deployment settings live in `config/networks.json`. The `defaultNetwork` entry selects the RPC URL, program IDs, and default priority fee used consistently by network queries, transaction builders, and execution. Deployment transaction IDs and timestamps are recorded there for reference.

Do not put private keys or view keys in this file; keys are supplied only as tool inputs.

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
├── tools.ts        All 20 tool definitions and handlers
├── builders.ts     Pure transaction construction logic
├── records.ts      Private DepositVault and PayrollNote scanning
├── leo.ts          leo CLI wrapper (execute/decrypt/account)
├── aleo-client.ts  HTTP client for Aleo node read queries
└── common.ts       Validated network settings and shared utilities
config/
└── networks.json   Public network and contract deployment settings
```

## Known Limitations

- **Bounded record discovery**: Scans are intentionally paginated. Continue with `nextEndHeight` to search older blocks.
- **Leo required for signing**: Unlike the web frontend (which delegates to Shield), this server signs via `leo execute` — the `leo` binary must be installed and on PATH.
- **Configured for testnet**: Add another entry to `config/networks.json` and change `defaultNetwork` to target another deployment.

## License

MIT
