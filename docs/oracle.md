# Oracle Design

## Overview

The oracle is the bridge between off-chain chess platforms (Lichess, Chess.com) and the on-chain escrow contract. It is the only address authorised to call `submit_result` on the escrow contract.

## Components

### Oracle Contract (`contracts/oracle`)

An on-chain Soroban contract that:

- Stores verified results keyed by `match_id`
- Accepts result submissions only from the registered admin (the oracle service key)
- Prevents duplicate submissions for the same `match_id`
- Emits an on-chain event for every accepted result

### Off-chain Oracle Service

A backend process that:

1. Monitors the escrow contract for `("match", "activated")` events
2. Extracts `game_id` and `platform` from the match record
3. Polls the appropriate chess platform API until the game is finished
4. Submits the result to the Oracle Contract using the admin key
5. Calls `submit_result` on the Escrow Contract to trigger payout

## Result Submission Flow

```
Chess platform API
       │  game finished
       ▼
Oracle Service
  1. fetch game result
  2. map to MatchResult enum
  3. oracle_contract.submit_result(match_id, game_id, result)
  4. escrow_contract.submit_result(match_id, winner, oracle_address)
       │
       ▼
Escrow Contract
  - verifies caller == stored oracle address
  - verifies match state == Active
  - executes token payout
  - sets state = Completed
  - emits ("match", "completed") event
```

## Result Types

| Oracle `MatchResult` | Escrow `Winner` | Payout |
|----------------------|-----------------|--------|
| `Player1Wins` | `Player1` | Full pot to player1 |
| `Player2Wins` | `Player2` | Full pot to player2 |
| `Draw` | `Draw` | `stake_amount` returned to each player |

## Supported Platforms

| Platform | Enum Variant | API |
|----------|-------------|-----|
| Lichess | `Platform::Lichess` | `https://lichess.org/api/game/{id}` |
| Chess.com | `Platform::ChessDotCom` | `https://api.chess.com/pub/game/{id}` |

## Oracle Contract API

```
initialize(admin: Address)
submit_result(match_id: u64, game_id: String, result: MatchResult) -> Result<(), Error>
get_result(match_id: u64) -> Result<ResultEntry, Error>
has_result(match_id: u64) -> bool
```

### Errors

| Error | Code | Meaning |
|-------|------|---------|
| `Unauthorized` | 1 | Caller is not the admin |
| `AlreadySubmitted` | 2 | Result already exists for this match |
| `ResultNotFound` | 3 | No result stored for this match |
| `AlreadyInitialized` | 4 | Contract has already been initialized |

## Security Properties

- The oracle admin key is the only address that can submit results; any other caller is rejected with `Error::Unauthorized`.
- Once a result is submitted it is immutable — `AlreadySubmitted` prevents overwriting.
- The escrow contract independently verifies the caller against its stored oracle address before executing any payout.
- The oracle contract and escrow contract are separate deployments; a compromised oracle contract does not grant direct access to escrow funds.

## Polling Interval and Job Scheduling

### Polling interval

The off-chain oracle service polls the chess platform API once every **30 seconds** per active
match. On each poll it checks whether the game has reached a terminal state (win, loss, or draw).
Once a terminal result is detected the service immediately submits the result on-chain and
stops polling for that match.

```
while game not finished:
    sleep 30 s
    result = chess_api.get_game(game_id)
    if result.status in [win, draw, aborted]:
        break

oracle_contract.submit_result(...)
escrow_contract.submit_result(...)
```

### Retry policy

Transient failures (network timeouts, API rate-limit 429 responses, Soroban RPC errors) are
retried with **exponential backoff**:

| Attempt | Delay before retry |
|---------|-------------------|
| 1st retry | 5 s |
| 2nd retry | 10 s |
| 3rd retry | 20 s |
| 4th retry | 40 s |
| 5th+ retry | 60 s (capped) |

After **10 consecutive failures** for the same match, the job is placed into a dead-letter queue
and an alert is raised. The match remains `Active` on-chain; players retain the ability to call
`claim_timeout` once the timeout window elapses (see below).

Duplicate-submission errors (`Error::AlreadySubmitted` from the oracle contract,
`Error::InvalidState` from the escrow contract) are treated as successful and cause the job to
stop immediately — they indicate a race where a result was already recorded.

### Relationship to `TIMEOUT_LEDGERS`

`TIMEOUT_LEDGERS` is set to **120 960 ledgers** (≈ 7 days at 5 s/ledger). This constant
represents the on-chain safety net: if the oracle never submits a result within that window,
either player can call `claim_timeout` to recover their stake.

The polling service is designed to resolve matches **well within** this window:

- Polling every 30 s means a finished game is detected within 30 s of completion.
- Chess games on Lichess and Chess.com have enforced time controls; no standard game exceeds a
  few hours.
- The 7-day window is a guard against **oracle service downtime**, not against slow games. If
  the oracle service is offline for the full 7-day window, `claim_timeout` provides a trustless
  escape hatch without relying on the operator to intervene.

Configure the polling interval via `.env` (default: 30 s):

```env
ORACLE_POLL_INTERVAL_SECS=30
ORACLE_MAX_RETRIES=10
```

## Configuration

Set the oracle admin key in `.env`:

```env
ORACLE_ADMIN_SECRET=<stellar-secret-key>
```

The oracle address is registered in the escrow contract at deploy time:

```bash
stellar contract invoke --id $CONTRACT_ESCROW \
  -- initialize \
  --oracle $ORACLE_ADDRESS \
  --admin $ADMIN_ADDRESS
```
