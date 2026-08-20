# PactPay Aleo MCP Usage

This guide describes how to run PactPay Aleo as a Model Context Protocol (MCP)
server and call its tools from an MCP client. The server uses stdio transport and
is self-contained: it does not read contract sources, `.env` files, or sibling
project directories.

For direct terminal usage instead of an MCP client, see [CLI.md](CLI.md).

## Install and build

Requirements:

- Node.js 22 or newer
- `leo` on `PATH` for `gen_account`, `decrypt_record`, and `execute`

From this repository:

```bash
npm install
npm run build
```

The MCP entry point is `dist/index.js`. Starting it directly opens the stdio MCP
transport, so it normally waits for an MCP client rather than presenting an
interactive prompt:

```bash
npm start
```

## Connect an MCP client

Use an absolute path to the compiled entry point. A typical MCP client
configuration is:

```json
{
  "mcpServers": {
    "pactpay-aleo": {
      "command": "node",
      "args": [
        "/absolute/path/to/pactpay-aleo-mcp/dist/index.js"
      ]
    }
  }
}
```

With Claude Code, the equivalent registration is:

```bash
claude mcp add pactpay-aleo -- node /absolute/path/to/pactpay-aleo-mcp/dist/index.js
```

Restart or reconnect the MCP client after changing the configuration. You can
then ask it, for example, to “use PactPay Aleo to get the latest testnet block
height” or explicitly select the `aleo_height` tool.

The server writes protocol messages to stdout and status information to stderr.
Do not wrap it with a command that writes banners or other text to stdout.

## Network and contract settings

The server reads public settings only from `config/networks.json` inside this
repository. `defaultNetwork` selects the RPC URL, deployed program IDs,
deployment height, and priority fee.

The included defaults are:

| Setting | Value |
|---|---|
| Network | `testnet` |
| RPC URL | `https://api.explorer.provable.com/v1` |
| Payroll program | `payroll_private_v2.aleo` |
| Mock token program | `mock_token.aleo` |
| Priority fee | `0` |

The MCP server does not load `.env` files. Private and view keys are supplied as
individual tool arguments; never store them in `config/networks.json`.

## Tool results and errors

Every tool returns MCP text content. Structured results are JSON-formatted inside
that text. A failed operation returns the error message with `isError: true`.

Transaction builder tools return this reusable shape:

```json
{
  "program": "payroll_private_v2.aleo",
  "transition": "fund_credits_escrow",
  "args": ["1000u64", "123field"],
  "imports": []
}
```

Pass that complete object as `execute.builtTx`; do not manually reorder its
arguments or remove `imports`. Execution loads those external programs with
Leo's `--with` option for dynamic calls.

## Read-only network tools

These tools call the configured Aleo RPC endpoint and require neither a key nor
`leo`.

| Tool | Arguments | Purpose |
|---|---|---|
| `aleo_height` | none | Get the latest block height |
| `aleo_latest_block` | none | Get the latest full block |
| `aleo_block` | `heightOrHash: string` | Get a block by height or hash |
| `aleo_transaction` | `txId: string` | Get a transaction and its outputs |
| `aleo_program` | `programId: string` | Get deployed Aleo program source |
| `aleo_mappings` | `programId: string` | List a program's mappings |
| `aleo_mapping` | `programId`, `mapping`, `key` | Read one mapping value |
| `aleo_balance` | `address: string` | Read public credits balance in microcredits |
| `aleo_arc_balance` | `address`, optional `tokenProgram` | Read a public ARC balance |

Example tool input for `aleo_balance`:

```json
{
  "address": "aleo1..."
}
```

Example tool input for `aleo_mapping`:

```json
{
  "programId": "credits.aleo",
  "mapping": "account",
  "key": "aleo1..."
}
```

## Transaction builder tools

Builders are pure local operations. They require no key and do not submit a
transaction. Amounts are Leo integer literals such as `1000u64`.

### `build_fund_credits_escrow`

Build a transaction that moves public credits into payroll escrow and creates a
private `DepositVault`.

```json
{
  "amount": "1000u64"
}
```

### `build_fund_arc_escrow`

Build the equivalent funding operation for an ARC program. `tokenProgram` is a
Leo identifier literal, including its single quotes.

```json
{
  "tokenProgram": "'mock_token'",
  "amount": "1000u64"
}
```

### `build_mint_mock_arc`

Build a demo-token mint using the configured mock-token program.

```json
{
  "receiver": "aleo1...",
  "amount": "10000u64"
}
```

### `build_deposit`

Consume a decrypted `DepositVault` and build a payroll deposit for 1–16
receivers. With multiple receivers, the builder selects the fixed-width batch
transition and pads unused slots automatically.

```json
{
  "vaultRecord": "{ owner: aleo1...private, token_program: 'credits'private, amount: 1000u64private, nonce: ... }",
  "allocations": [
    { "receiver": "aleo1...", "amount": "600u64" },
    { "receiver": "aleo1...", "amount": "400u64" }
  ]
}
```

An optional `paddingReceiver` can replace the zero address used for empty batch
slots.

### `build_withdraw`

Consume a decrypted `PayrollNote` and build a public payout. The builder reads
the note's token program and selects the credits or ARC transition.

```json
{
  "noteRecord": "{ owner: aleo1...private, token_program: 'credits'private, amount: 600u64private, note_secret: ... }",
  "amount": "100u64",
  "payoutTo": "aleo1..."
}
```

## Record scanning tools

`scan_deposit_vaults` and `scan_payroll_notes` discover records owned by an Aleo
private key, decrypt candidates locally, calculate serial numbers, and omit
records that have already been spent.

Both accept:

| Argument | Required | Description |
|---|:---:|---|
| `privateKey` | yes | Aleo private key used locally for ownership and spent checks |
| `startHeight` | no | First block in the inclusive range |
| `endHeight` | no | Last block; defaults to the latest height |
| `maxBlocks` | no | Safety limit, default `1000`, maximum `10000` |

Example:

```json
{
  "privateKey": "APrivateKey1...",
  "maxBlocks": 1000
}
```

A scan result contains `records`, `count`, the scanned range, and
`nextEndHeight`. To page backward, call the same scanner again with
`endHeight` set to the previous result's `nextEndHeight`. Scanning stops at the
configured payroll deployment height.

Use:

- `scan_deposit_vaults` before `build_deposit`
- `scan_payroll_notes` before `build_withdraw`

## Local cryptography tools

| Tool | Arguments | Purpose |
|---|---|---|
| `random_field` | none | Generate a random Leo field without `leo` |
| `gen_account` | none | Generate an Aleo account using `leo` |
| `decrypt_record` | `ciphertext`, `key` | Decrypt `record1...` using a view or private key |

Example `decrypt_record` input:

```json
{
  "ciphertext": "record1...",
  "key": "AViewKey1..."
}
```

Prefer a view key when only decryption is needed. The decrypted plaintext can be
passed to `build_deposit` or `build_withdraw`.

## Execute a built transaction

`execute` calls `leo execute --no-local` for one of the two configured programs.
It accepts:

| Argument | Required | Description |
|---|:---:|---|
| `builtTx` | yes | The complete object returned by a builder tool |
| `privateKey` | yes | Aleo private key used to sign |
| `broadcast` | no | `true` by default; use `false` to print without broadcasting |

Example:

```json
{
  "builtTx": {
    "program": "mock_token.aleo",
    "transition": "mint_public",
    "args": ["aleo1...", "10000u64"]
  },
  "privateKey": "APrivateKey1...",
  "broadcast": false
}
```

Unlike the standalone CLI, the MCP tool broadcasts when `broadcast` is omitted.
Use `false` while reviewing a transaction and `true` only when submission is
intended. After broadcast, poll the returned `transactionId` with
`aleo_transaction`.

## Typical payroll workflow

1. Call `build_fund_credits_escrow` or `build_fund_arc_escrow`.
2. Review the returned object and call `execute`.
3. After confirmation, call `scan_deposit_vaults` to get the decrypted vault.
4. Pass the vault to `build_deposit` with 1–16 allocations.
5. Review and execute the deposit.
6. The receiver calls `scan_payroll_notes` with their private key.
7. Pass a note to `build_withdraw`, then review and execute the withdrawal.
8. Use `aleo_balance` or `aleo_arc_balance` to verify the public payout.

## Security notes

- MCP tool arguments are visible to the MCP client invoking them. Use a trusted,
  local client when supplying private keys.
- The server redacts a scanner private key from scanner error messages.
- The `leo` wrapper redacts key values from reported command lines.
- Keys are not written to the repository or network settings by this server.
- `source ../pactpay-aleo/.env` affects only the caller's shell. The MCP server
  does not read that file, and MCP tools still require explicit key arguments.
