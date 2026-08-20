# PactPay Aleo CLI

The CLI exposes the same PactPay operations as the MCP without requiring an MCP client. It uses the network and deployed contracts selected in `config/networks.json` and does not read contract sources from another project.

## Running the CLI

Build the JavaScript output first:

```bash
npm run build
```

The compiled MCP server and CLI are written to `dist/`. The package executables
also point to these compiled files.

From this repository:

```bash
npm run cli -- help
npm run cli -- height
```

To install the executable from a local checkout:

```bash
npm link
pactpay-aleo help
```

All successful structured results are printed as formatted JSON. Errors are written to stderr and return exit code `1`.

## Keys and safety

Commands that need a private key accept `--private-key`. To avoid placing a key in shell history, set it in the process environment instead:

```bash
export ALEO_PRIVATE_KEY='APrivateKey1...'
```

`decrypt-record` also accepts its view key from `ALEO_VIEW_KEY`.

The CLI does not load `.env` files. `execute` is print-only by default; it broadcasts only when `--broadcast` is explicitly present.

## Network query commands

### `height`

Return the latest block height.

```bash
pactpay-aleo height
```

### `latest-block`

Return the latest complete block.

```bash
pactpay-aleo latest-block
```

### `block`

Return a block by height or hash.

```bash
pactpay-aleo block --height-or-hash 18690000
```

### `transaction`

Return a transaction by ID.

```bash
pactpay-aleo transaction --tx-id at1...
```

### `program`

Return deployed Aleo program source.

```bash
pactpay-aleo program --program-id payroll_private_v2.aleo
```

### `mappings`

List a program's mappings.

```bash
pactpay-aleo mappings --program-id payroll_private_v2.aleo
```

### `mapping`

Read one mapping value.

```bash
pactpay-aleo mapping \
  --program-id payroll_private_v2.aleo \
  --mapping escrow_balances \
  --key "'credits'"
```

### `balance`

Read an address's public credits balance in microcredits.

```bash
pactpay-aleo balance --address aleo1...
```

### `arc-balance`

Read an address's public ARC balance. `--token-program` defaults to the configured mock-token program.

```bash
pactpay-aleo arc-balance --address aleo1...
pactpay-aleo arc-balance --address aleo1... --token-program mock_token.aleo
```

## Transaction builder commands

Builders do not sign or broadcast. Their JSON output can be passed to `execute`.

### `build-fund-credits`

Build a public-credits escrow funding transaction.

```bash
pactpay-aleo build-fund-credits --amount 1000u64
```

### `build-fund-arc`

Build an ARC escrow funding transaction. The token program is a Leo identifier literal.

```bash
pactpay-aleo build-fund-arc --token-program "'mock_token'" --amount 1000u64
```

### `build-mint-mock`

Build a mock ARC mint transaction.

```bash
pactpay-aleo build-mint-mock --receiver aleo1... --amount 1000u64
```

### `build-deposit`

Build a deposit that consumes a decrypted `DepositVault`. `--allocations` is a JSON array containing one to sixteen receiver/amount objects.

```bash
pactpay-aleo build-deposit \
  --vault-record '{ owner: aleo1....private, token_program: credits.private, amount: 1000u64.private, nonce: 1field.private, _nonce: 1group.public }' \
  --allocations '[{"receiver":"aleo1...","amount":"1000u64"}]'
```

For two or more allocations the builder uses the fixed-width `deposit_16` transition. Optional `--padding-receiver` selects the address used for zero-amount padding.

### `build-withdraw`

Build a withdrawal from a decrypted `PayrollNote`. The credits or ARC path is selected from `token_program` in the note.

```bash
pactpay-aleo build-withdraw \
  --note-record '{ owner: aleo1....private, token_program: credits.private, amount: 1000u64.private, note_secret: 1field.private, nonce: 2field.private, _nonce: 2group.public }' \
  --amount 250u64 \
  --payout-to aleo1...
```

## Private record scanning

Both scanners decrypt locally, return only unspent records owned by the private key, and restrict results to the configured payroll program.

### `scan-deposit-vaults`

```bash
pactpay-aleo scan-deposit-vaults --max-blocks 1000
```

### `scan-payroll-notes`

```bash
pactpay-aleo scan-payroll-notes --max-blocks 1000
```

Scanner options:

| Option | Meaning |
|---|---|
| `--private-key` | Account private key; alternatively use `ALEO_PRIVATE_KEY` |
| `--start-height` | First block in the inclusive range |
| `--end-height` | Last block in the inclusive range; defaults to latest |
| `--max-blocks` | Safety limit for the range; defaults to `1000`, maximum `10000` |

Each response contains `nextEndHeight`. To scan the preceding page, pass that value as the next `--end-height`. Scanning stops at the payroll deployment height recorded in `config/networks.json`.

## Local cryptography commands

These commands require `leo` on `PATH`, except `random-field`.

### `random-field`

Generate a random valid Leo field literal.

```bash
pactpay-aleo random-field
```

### `gen-account`

Generate a new Aleo account. Its output contains sensitive key material.

```bash
pactpay-aleo gen-account
```

### `decrypt-record`

Decrypt a record ciphertext with a view key or private key.

```bash
export ALEO_VIEW_KEY='AViewKey1...'
pactpay-aleo decrypt-record --ciphertext record1...
```

## Transaction execution

### `execute`

Sign a built transaction against its deployed program. The CLI uses Leo's `--no-local` mode and supports only the payroll and mock-token programs configured in `config/networks.json`.

Print a transaction without broadcasting:

```bash
TX="$(npm run --silent cli -- build-mint-mock \
    --receiver aleo*** \
    --amount 10000u64)" && \
  npm run --silent cli -- execute --built-tx "$TX" --broadcast --private-key ***
```

Broadcast explicitly:

```bash
pactpay-aleo execute --built-tx "$TX" --broadcast
```

`execute` takes the private key from `--private-key` or `ALEO_PRIVATE_KEY`. After broadcasting, query the returned transaction ID with `transaction` and scan or decrypt its output records.

Keep the builder's complete JSON in `--built-tx`, including any `imports` array.
The CLI passes those programs to Leo with `--with` so dynamic ARC calls can be
authorized.

## Command correspondence

| MCP tool | CLI command |
|---|---|
| `aleo_height` | `height` |
| `aleo_latest_block` | `latest-block` |
| `aleo_block` | `block` |
| `aleo_transaction` | `transaction` |
| `aleo_program` | `program` |
| `aleo_mappings` | `mappings` |
| `aleo_mapping` | `mapping` |
| `aleo_balance` | `balance` |
| `aleo_arc_balance` | `arc-balance` |
| `build_fund_credits_escrow` | `build-fund-credits` |
| `build_fund_arc_escrow` | `build-fund-arc` |
| `build_mint_mock_arc` | `build-mint-mock` |
| `build_deposit` | `build-deposit` |
| `build_withdraw` | `build-withdraw` |
| `scan_deposit_vaults` | `scan-deposit-vaults` |
| `scan_payroll_notes` | `scan-payroll-notes` |
| `random_field` | `random-field` |
| `gen_account` | `gen-account` |
| `decrypt_record` | `decrypt-record` |
| `execute` | `execute` |

## CLI Examples

### Mint mock

```bash
TX="$(npm run --silent cli -- build-mint-mock \
    --receiver aleo17c69phd8lzdt***hzscufqgswrnvvx \
    --amount 10000u64)" && \
npm run --silent cli -- execute --built-tx "$TX" --broadcast --private-key ***
```

### Deposit 

- Fund

```bash
TX="$(npm run --silent cli -- build-fund-arc --token-program "'mock_token'" --amount 1000u64)" && \
    npm run --silent cli -- execute --built-tx "$TX" --broadcast --private-key ***
```

- Deposit

```bash
VAULT="{ owner: aleo17c69phd8lzdtgswrnvvx.private, token_program: 'mock_token'.private, amount: 1000u64.private,
nonce: 591313830080088583142398286747346038657295field.private, _nonce:
8409274316297605973555166664084505group.public, _version: 1u8.public }"
ALLOCATIONS='[
{"receiver":"aleo1hjmcet50wnc***0u9vas8s897ptx","amount":"500u64"},
{"receiver":"aleo17c69phd8lzdtz***shhzscufqgswrnvvx","amount":"200u64"},
{"receiver":"aleo1yeue4t43y***2h3u0sgshc4mv6","amount":"300u64"}
]'
TX="$(npm run --silent cli -- build-deposit \
--vault-record "$VAULT" \
--allocations "$ALLOCATIONS")" && \
npm run --silent cli -- execute --built-tx "$TX" --broadcast --private-key ***
```

- Withdraw

```bash
RECORD="{ owner: aleo17c69phd8lzdt.private, token_program: 'mock_token'.private, amount: 200u64.private, note_secret: 340600004975639425521231008486834487field.private, nonce: 2915436604281376179873621259field.private, _nonce: 324803499270029349837223group.public, _version: 1u8.public }"
TX="$(npm run --silent cli -- build-withdraw \
  --note-record "$RECORD" \
  --amount 100u64 \
  --payout-to aleo17c69phd8lzdt***ufqgswrnvvx)" && \
npm run --silent cli -- execute --built-tx "$TX" --broadcast --private-key ***
```