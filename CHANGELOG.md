# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Smart Contract — Escrow
- `PendingResult` match state for dispute window support (#TBD)
- `claim_timeout` configuration for dispute window duration (#TBD)
- `override_result` admin function to correct fraudulent oracle submissions during dispute window (#TBD)
- `claim_payout` function for winners to claim funds after dispute window expires (#TBD)
- Stake amount limits (minimum and maximum) validation (#TBD)

#### Documentation
- Document `environments.toml` fields in `README.md` with descriptions and defaults (#115)
- Prerequisites section in `CONTRIBUTING.md` now specifies Rust 1.88.0 from `rust-toolchain.toml` (#1114)
- Oracle key compromise response runbook entry in `docs/runbook.md` (#1115)

### Changed
- Match state machine now includes `PendingResult` intermediate state between `Active` and `Completed`
- Winner payouts require explicit `claim_payout` call after dispute window expires
- `submit_result` transitions matches to `PendingResult` instead of immediately completing

## [0.2.0] - 2026-06-24

### Added

#### Smart Contract — Escrow
- `emergency_drain` for critical exploit recovery (#912)
- `Error::GameIdMismatch` (code 13): cross-match result injection guard
- `Error::DuplicateGameId` (code 14): duplicate game ID prevention
- Token address validation on `initialize` (#211)
- Game ID uniqueness enforcement across matches
- Self-match prevention (`player1 != player2`)
- `is_paused` helper extraction to reduce code duplication

#### Smart Contract — Oracle
- Game ID length validation (max 64 bytes)
- Initialization event emission `("oracle", "init")`

#### Frontend
- Claim/burn UI with full wallet state machine (connecting, connected, wrong-network, error, not-installed)
- Dark mode support via Tailwind `dark:` classes
- Copy-to-clipboard for wallet address and transaction hash
- ARIA live regions and keyboard focus management
- Transaction history view
- Balance display, Max button, and real-time refresh
- Confirmation overlay with inline modal design
- NetworkBadge component with colour-coded network display
- Responsive layout with mobile breakpoints

#### Tests
- Player1 win payout sends full pot to player1 (#208)
- Player2 win payout sends full pot to player2 (#36)
- Cancel active match and draw payout tests (#198, #199)
- `deposit` by non-player returns `Unauthorized` (#192)
- `is_funded` returns false after one deposit, true after both (#195)
- `submit_result` on `Pending` match returns `InvalidState` (#196)
- `submit_result` on `Completed` match returns `InvalidState` (#197)
- `submit_result` on `Cancelled` match returns `InvalidState` (#72, #100)
- Unauthorized oracle `submit_result` rejection
- Oracle `get_result` `ResultNotFound` error path
- Frontend form validation (#69)
- E2E transaction validation (#71)
- Input validation and security pre-checks (#70)
- Backend integration tests (#68)
- Test coverage for issues #21–30, #33–35, #55–58, #59–62, #89–90, #92–98

#### Infrastructure & CI
- GitHub Actions CI workflow with test, clippy, fmt, and WASM build
- Clippy job and CI status badge (#106, #120, #121)
- `deploy_testnet.sh` deployment script (#113)
- `deploy_mainnet.sh` deployment script (#112)
- Rust toolchain pinning (1.85.0 → 1.88.0)
- Cargo audit step for RUSTSEC advisory detection (#119)
- Cargo deny for dependency license and duplicate-crate checks
- WASM binary size gate (64 KB limit)

#### Documentation
- `docs/architecture.md` — system architecture overview (#108, #109, #110)
- `docs/oracle.md` — oracle design and operation (#108, #109, #110)
- `docs/security.md` — threat model and security mitigations (#111)
- `docs/roadmap.md` — project roadmap (#111)
- `docs/api-reference.md` — full contract API with examples (#111)
- `docs/infrastructure.md` — deployment and environment documentation (#114)
- `CONTRIBUTING.md` — contributor guide (#104)
- `ISSUES.md` — 125 tracked issues
- Module-level doc comments (`//!`) for escrow and oracle contracts

### Fixed

#### Smart Contract
- Prevent double initialization of escrow contract (re-initialization guard) (#1)
- Prevent double initialization of oracle contract (#2)
- Use `try_transfer` for refunds instead of `transfer` to surface errors cleanly
- Verify token transfer in `deposit` before updating state
- Remove duplicate `Display` impls conflicting with `#[contracterror]` macro (E0428)
- Remove broken intra-doc link to non-existent `Error::InvalidToken`
- Resolve compile errors in escrow `lib.rs`
- Resolve Clippy errors, redundant clones, and dead code
- Resolve rustfmt failures (trailing whitespace)
- Resolve test assertion bugs in e2e tests
- Resolve infrastructure compile errors and test mismatches (#118)
- Fix CI/CD branch triggers from `main`/`develop` to `master` (#117)

#### Frontend
- Wire `handleClaim` and `handleBurn` to actual Stellar SDK transaction submission
- Wire `disconnect`, `refreshBalance`, `balance`, and `wrongNetwork` in `App.tsx`
- Fix CSS import path and add missing wallet-info layout styles
- Fix confirm overlay display (inline block instead of fixed full-screen modal)
- Add `wrongNetwork` to `WalletStatus` type
- Fix PostCSS config ESM conflict and unblock claim-burn tests
- Resolve multiple wallet state typing and wiring inconsistencies

#### CI
- Resolve all Clippy, Format, and Test CI failures (multiple rounds)
- Bump toolchain to satisfy `darling`/`serde_with` dependency requirements
- Apply `cargo-audit` 0.22.0 migration

### Security
- Document full threat model covering oracle key compromise and admin key loss (#119)
- Add `pause` + `drain` emergency function for critical exploit recovery (#912)
- Add re-initialization guards to both escrow and oracle contracts
- Validate token address in `initialize` to prevent rogue token injection
- Enforce game ID uniqueness to prevent duplicate-match payout exploits
- Add `game_id` cross-match injection guard (`Error::GameIdMismatch`)
- Document integer overflow risk in `submit_result` payout calculation
- Document re-entrancy analysis confirming Soroban execution model prevents re-entrancy

### Changed
- `submit_result` now requires a `game_id` parameter that must match the stored match record
- Oracle contract now emits `("oracle", "init")` event on initialization
- Oracle contract validates `game_id` length (1–64 bytes) on submission
- `cancel_match` with both players deposited requires authorization from both parties
- Replace `panic!` in Oracle `initialize` with proper `Error::AlreadyInitialized`

## [0.1.0] - 2026-04-25

### Added
- Soroban escrow contract with XLM stake support
- Oracle contract for Lichess result verification
- Automatic winner payout and draw refund logic
- Match creation, deposit, cancellation, and completion flows
- Admin pause/unpause and oracle update controls
- Match state machine (`Pending` → `Active` → `Completed`/`Cancelled`)
- Read-only query functions: `get_match`, `is_funded`, `get_escrow_balance`
- Oracle query functions: `get_result`, `has_result`
- Oracle `transfer_admin` for key rotation
- CI workflow via GitHub Actions
- Basic project scaffolding and build scripts
