# Deployment Guide

This document covers end-to-end deployment of smile4money contracts to Stellar testnet and mainnet.

## Verifying CI Build Artifacts

Every CI build on the `master` branch uploads the compiled WASM binaries as a downloadable artifact. This allows you to verify that a deployed contract matches a specific commit's source code.

### Downloading an artifact

1. Navigate to the [Actions tab](https://github.com/{{repo}}/actions) on GitHub.
2. Select the CI run for the commit you want to verify.
3. In the **Artifacts** section, download the `wasm-<commit-sha>` archive.
4. Extract the archive to get the `.wasm` files.

### Verifying a deployed contract

Compare the WASM hash from the artifact against the deployed contract:

```bash
# Download and extract the artifact for the target commit
unzip wasm-<sha>.zip -d wasm-artifact

# Compute the hash of the local artifact
sha256sum wasm-artifact/*.wasm

# On-chain: use stellar contract inspect to get the contract's WASM hash
stellar contract inspect \
  --id <CONTRACT_ID> \
  --network mainnet \
  --rpc-url https://soroban-mainnet.stellar.org \
  --network-passphrase "Public Global Stellar Network ; September 2015"
```

The WASM hash displayed by `stellar contract inspect` should match the `sha256sum` output for the corresponding artifact file, confirming the deployed bytecode matches the source at that commit.

## Prerequisites

- **Rust toolchain** (1.70+) with `wasm32-unknown-unknown` target:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- **Stellar CLI** — install from the [official docs](https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli)
- **Stellar deployer account** funded with XLM (testnet XLM is free via Friendbot; mainnet requires real XLM)
- **`git`** checkout of the repository at the commit to deploy

## Testnet Deployment

### 1. Create and fund a deployer identity

```bash
stellar keys generate deployer --network testnet
```

This creates a local keypair named `deployer` and registers it for the `testnet` network. To view the public address:

```bash
stellar keys address deployer
```

If the account has not been used before, it needs a minimum XLM balance. The deploy script funds it automatically via Friendbot, but you can also fund it manually:

```bash
curl -sf "https://friendbot.stellar.org?addr=$(stellar keys address deployer)"
```

**Expected output:**
```json
{"message": "Account created!", "hash": "..."}
```

### 2. Run the deploy script

```bash
./scripts/deploy_testnet.sh
```

The script performs these steps in order:

1. Verifies the `stellar` CLI is installed and the `deployer` identity exists.
2. Funds the deployer via Friendbot (no-op if already funded).
3. Builds both contracts (`escrow.wasm`, `oracle.wasm`) in release mode.
4. Deploys the escrow contract to testnet.
5. Deploys the oracle contract to testnet.
6. Initializes the oracle contract (admin = deployer address).
7. Initializes the escrow contract (oracle = oracle contract address, admin = deployer address).
8. Writes `CONTRACT_ESCROW` and `CONTRACT_ORACLE` to `.env`.

**Expected output:**
```
Deployer: GABCDEF123...
Funding deployer account via friendbot...
Building contracts...
Deploying escrow contract...
Escrow contract: CC123...
Deploying oracle contract...
Oracle contract: CC456...
Initializing oracle contract...
Initializing escrow contract...

Deployment complete.
  Escrow:  CC123...
  Oracle:  CC456...
Contract IDs written to .env
```

### 3. Verify the deployment

Check that contract IDs were written to `.env`:

```bash
grep -E "^(CONTRACT_ESCROW|CONTRACT_ORACLE)=" .env
```

Verify the contracts are live and responsive:

```bash
# Check escrow contract is queryable (should return match count 0)
stellar contract invoke \
  --id "$(grep CONTRACT_ESCROW .env | cut -d= -f2)" \
  --source deployer \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- get_match \
  --match_id 0

# Check oracle contract is queryable
stellar contract invoke \
  --id "$(grep CONTRACT_ORACLE .env | cut -d= -f2)" \
  --source deployer \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- has_result \
  --match_id 0
```

If the contracts are deployed correctly, `has_result` returns `false` and `get_match` returns `Error::MatchNotFound` (the contract is live and rejecting invalid queries properly).

### 4. Configure the off-chain oracle

After deployment, populate the remaining `.env` fields:

```env
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
CONTRACT_ESCROW=<contract-id-from-deploy>
CONTRACT_ORACLE=<contract-id-from-deploy>
LICHESS_API_TOKEN=<your-lichess-api-token>
CHESSDOTCOM_API_KEY=<your-chessdotcom-api-key>
VITE_STELLAR_NETWORK=testnet
VITE_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
```

These values are used by the off-chain oracle service and the frontend.

## Mainnet Deployment

Mainnet deployment follows the same steps but with additional precautions because transactions are irreversible and consume real XLM.

### Pre-deploy review checklist

- [ ] All CI jobs pass on the commit being deployed (test, clippy, fmt, build).
- [ ] Security audit (`cargo audit`) reports zero unresolved advisories.
- [ ] Contracts have been live on testnet for at least one full test cycle.
- [ ] A dedicated deployer key is used — never a personal or shared key.
- [ ] The deployer account is funded with sufficient XLM to cover deploy + init fees (approximately 10–20 XLM).
- [ ] The commit to deploy has been reviewed and approved by at least one other team member.
- [ ] A rollback plan exists (redeploying previous contract IDs).
- [ ] The `.env` file from the previous testnet deploy is backed up separately (not overwritten).

### 1. Create a mainnet deployer identity

```bash
stellar keys generate deployer --network mainnet
```

### 2. Fund the deployer account

Send real XLM to the deployer address:

```bash
stellar keys address deployer
# Send XLM to the output address from a funded Stellar account or exchange
```

The account needs enough for:
- Escrow contract deploy fee
- Oracle contract deploy fee
- Two initialization invocations
- Minimum account balance (~1 XLM)

10–20 XLM is a comfortable buffer.

### 3. Run the deploy script

```bash
./scripts/deploy_mainnet.sh
```

The script is identical to the testnet version except:
- Targets `mainnet` network and RPC endpoints.
- Does **not** call Friendbot (no Friendbot exists for mainnet).
- Prompts for confirmation before proceeding.
- Updates all `STELLAR_NETWORK` and `VITE_STELLAR_NETWORK` fields in `.env` to `mainnet`.

**Expected output:**
```
Deployer: GXYZ...
Network:  mainnet (PUBLIC — real XLM will be spent)

Continue with mainnet deployment? [y/N] y
Building contracts...
Deploying escrow contract...
Escrow contract: CC789...
Deploying oracle contract...
Oracle contract: CC012...
Initializing oracle contract...
Initializing escrow contract...

Mainnet deployment complete.
  Escrow:  CC789...
  Oracle:  CC012...
Contract IDs written to .env
```

### 4. Post-deploy verification

Run the same verification as testnet (step 3 above), but use mainnet RPC and passphrase:

```bash
MAINNET_RPC="https://soroban-mainnet.stellar.org"
MAINNET_PASSPHRASE="Public Global Stellar Network ; September 2015"

stellar contract invoke \
  --id "$CONTRACT_ESCROW" \
  --source deployer \
  --network mainnet \
  --rpc-url "$MAINNET_RPC" \
  --network-passphrase "$MAINNET_PASSPHRASE" \
  -- get_match \
  --match_id 0

stellar contract invoke \
  --id "$CONTRACT_ORACLE" \
  --source deployer \
  --network mainnet \
  --rpc-url "$MAINNET_RPC" \
  --network-passphrase "$MAINNET_PASSPHRASE" \
  -- has_result \
  --match_id 0
```

Additionally:

- [ ] Record contract IDs in a secure, durable location (e.g., a password manager, team wiki, or a GitHub release).
- [ ] Verify the admin and oracle addresses stored on-chain are correct with `stellar contract inspect`.
- [ ] Run a smoke test: create a test match, deposit stake, and cancel it to verify the full flow.
- [ ] Update the frontend configuration with the new mainnet contract IDs and network.

## Contract Account Minimum Balance & Deployment Buffer

### Rationale

Every Stellar account — including the underlying Stellar `AccountEntry` that backs a Soroban contract address — must hold a **minimum balance** derived from the network's *base reserve* to continue to exist on the ledger. As of Protocol 21 the base reserve is **0.5 XLM**, and a bare account requires 2 base reserves = **1 XLM** to remain active. Any operation that would drop an account below this threshold (e.g. a `PAYMENT` sent by the contract during a payout) is aborted at the protocol layer with `op_under_min_balance`.

If the escrow contract held *exactly* the stake amounts deposited by the players and nothing more, a winner-takes-all payout that sends `2 × stake` out of the contract would leave the account at **0 XLM**, below the 1 XLM minimum. The transfer would abort inside the `finalize_result` / `claim_timeout` / `cancel_match` call with the generic on-chain error `Error::TransferFailed` (code 15), but crucially **the state transition would never be applied** — the match would remain stuck in `PendingResult` / `Active` / `Pending` state and players' funds could not move.

### Required Buffer

To prevent this, the escrow contract address must be topped up with **1.5 XLM (15,000,000 stroops)** of the **native XLM token** immediately after deployment + initialization. This 1.5 XLM is broken down as:

| Component              | Amount    | Purpose                                                                |
|------------------------|-----------|------------------------------------------------------------------------|
| Base minimum balance   | 1.0 XLM   | 2 × base reserve — the legal minimum to keep the account on-ledger.   |
| Operational safety pad | 0.5 XLM   | Extra slack for rent, inclusion fees, and small rebalancing mistakes.  |
| **Total**              | **1.5 XLM** | Recommended one-time deployment buffer.                                |

> **Why native XLM even if the configured token is USDC?** The Stellar minimum-balance rule always applies in XLM regardless of which SAC token the contract is configured to escrow. USDC held in the contract does **not** count toward the XLM reserve requirement. You must therefore always fund the contract address with at least 1.5 XLM of native lumens *in addition to* the USDC stakes that players deposit.

### On-Chain Safety Guard

The escrow contract enforces the same 1.5 XLM figure in software via the `ensure_reserve_for_payout` helper (see `ESCROW_RESERVE_BUFFER_STROOPS` in `contracts/escrow/src/lib.rs`). Before it performs any transfer during `finalize_result`, `claim_timeout`, or `cancel_match`, it calls `token.balance(current_contract_address)` and returns the explicit error `Error::InsufficientReserve` (code 26) if `balance - payout < 15_000_000 stroops`. This surfaces a clean, actionable error instead of letting payouts silently fail part-way through.

### Funding the buffer (deploy scripts)

Both `scripts/deploy_testnet.sh` and `scripts/deploy_mainnet.sh` have been updated to perform the 1.5 XLM top-up automatically **after** the `initialize` call. You do not need to run the manual steps below for fresh deploys. They are documented here for reference / manual recovery.

### Funding the buffer (manual)

If you are re-using an existing contract, or if the automatic top-up was skipped, send 1.5 XLM from the deployer (or any funded admin account) directly to the contract's Stellar address:

```bash
# 1. First convert the contract ID -> its underlying Stellar G-address
ESCROW_CC="$(grep CONTRACT_ESCROW .env | cut -d= -f2)"
ESCROW_ADDR="$(stellar contract id address --id "$ESCROW_CC" | tail -1)"
echo "Escrow Stellar address: $ESCROW_ADDR"

# 2. Build + submit a native payment op for 1.5 XLM = 15,000,000 stroops
stellar tx build \
  --source deployer \
  --operation payment \
    --source-account deployer \
    --destination "$ESCROW_ADDR" \
    --asset native \
    --amount 15000000 \
  | stellar tx send --source deployer --network testnet
```

For mainnet, replace `--network testnet` with `--network mainnet` and the mainnet RPC / passphrase flags.

### Verifying buffer health

```bash
# Option A: stellar keys balance on the contract's G-address
stellar keys balance "$ESCROW_ADDR" --network testnet
# Expected output shows at least 1.5000000 XLM native balance in addition to any SAC tokens held.

# Option B: query the native XLM SAC balance of the contract via the zero-address token
# (native XLM SAC is conventionally at address = all-zero contract ID)
NATIVE_XLM_TOKEN="CCGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
stellar contract invoke \
  --id "$NATIVE_XLM_TOKEN" \
  --source deployer \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- balance \
  --id "$(stellar contract id address --id "$ESCROW_CC")"
```

### Symptoms of a depleted buffer

If you see the following, the reserve buffer is almost certainly gone:

- `finalize_result`, `claim_timeout`, or `cancel_match` return `Error::TransferFailed` (code 15) on stakes that should obviously be covered by the contract.
- Horizon / RPC reports the contract's account `balance` ≤ 1.0000000 XLM.
- Attempts to send funds **out** of the contract fail, while deposits **into** the contract still succeed.

The immediate recovery step is to re-fund the contract with another 1.5 XLM (see manual command above) and then re-submit the stuck payout transaction. No other state migration is needed because the contract never advanced the match state when the original transfer aborted.

### Oracle contract

The oracle contract currently never sends tokens itself, so it does not technically need an XLM buffer. However, best practice is to also send it **0.5 XLM** after deployment, to cover rent payments and any future oracle-initiated operations without another top-up.

## Troubleshooting

### `stellar: command not found`

The Stellar CLI is not installed or not in `PATH`.

**Fix:** Install from https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli

### `identity 'deployer' not found`

The deployer keypair has not been created yet.

**Fix:**
```bash
stellar keys generate deployer --network testnet
```

### `Account does not exist` or `insufficient funds`

The deployer account has no XLM balance.

**Fix (testnet):** The deploy script funds via Friendbot automatically. If it fails, run manually:
```bash
curl -sf "https://friendbot.stellar.org?addr=$(stellar keys address deployer)"
```

**Fix (mainnet):** Send real XLM to the deployer address from a funded account.

### `wasm file not found after build`

The WASM build failed or produced output in an unexpected location.

**Fix:** Run the build separately to see errors:
```bash
cargo build --target wasm32-unknown-unknown --release
```
Common causes:
- Missing `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`
- Rust toolchain too old: `rustup update`
- Compilation errors in contract code

### `Invoke failed: Error::AlreadyInitialized`

One of the contracts was already initialized. This happens if the deploy script was run twice without deploying new contracts.

**Fix:** Deploy fresh contracts (the script deploys new instances each run). If you want to re-use existing contracts, skip initialization and just update `.env` with the existing IDs.

### `Invoke failed: error decoding response: ...`

The contract invocation succeeded but the response format was unexpected. This usually means the contract is live and responding — check that the function name and arguments match the contract interface.

**Fix:** Verify you are using the correct function name and parameter types. See `docs/api-reference.md` for the full contract API.

### Timeout during deploy or invoke

Network congestion or RPC endpoint issues.

**Fix:** Retry the command. If the problem persists, verify the RPC endpoint is healthy:
```bash
curl -s <rpc-url> | head -20
```
You can also increase timeouts with the `--timeout` flag on `stellar` commands.
