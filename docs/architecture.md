# Architecture Overview

## System Components

smile4money is composed of two Soroban smart contracts and an off-chain oracle service.

```mermaid
flowchart TD
    P1[Player1]
    P2[Player2]
    FE[Frontend]
    EC[Escrow Contract<br/>Soroban]
    OC[Oracle Contract<br/>Soroban]
    OOS[Off-chain Oracle<br/>Service]
    LA[Lichess API]
    CA[Chess.com API]

    P1 -->|interacts| FE
    P2 -->|interacts| FE

    FE -->|create_match<br/>deposit<br/>cancel_match| EC

    OOS -->|GET /api/game/{id}| LA
    OOS -->|GET /pub/player/{user}/games| CA
    LA -->|game result| OOS
    CA -->|game result| OOS

    OOS -->|submit_result<br/>match_id, game_id, result| OC
    OOS -->|submit_result<br/>match_id, game_id, winner, caller| EC

    EC -->|payout<br/>stake_amount × 2| P1
    EC -->|payout<br/>stake_amount × 2| P2
```

## Match Lifecycle

```
create_match()
     │
     ▼
  Pending ──── deposit(player1) ──── deposit(player2) ──── Active
     │                                                        │
  cancel_match()                                    submit_result()
     │                                                        │
  Cancelled                                              Completed
```

State transitions are enforced on-chain. Deposits are rejected for any state other than `Pending`. Results are rejected for any state other than `Active`.

## Contract Storage

### Escrow Contract

| Key | Storage | Description |
|-----|---------|-------------|
| `DataKey::Oracle` | Instance | Trusted oracle address |
| `DataKey::Admin` | Instance | Admin address for pause/unpause |
| `DataKey::MatchCount` | Instance | Monotonic match ID counter |
| `DataKey::Paused` | Instance | Circuit-breaker flag |
| `DataKey::Match(id)` | Persistent | Full `Match` struct per match |

### Oracle Contract

| Key | Storage | Description |
|-----|---------|-------------|
| `DataKey::Admin` | Instance | Oracle service address |
| `DataKey::Result(id)` | Persistent | `ResultEntry` per match |

## Token Flow

All token transfers use the Stellar Asset Contract (SAC) interface via `soroban_sdk::token::Client`.

- On `deposit`: player → escrow contract address (`stake_amount`)
- On `submit_result` (win): escrow → winner (`stake_amount * 2`)
- On `submit_result` (draw): escrow → player1 (`stake_amount`), escrow → player2 (`stake_amount`)
- On `cancel_match`: escrow → each depositor (`stake_amount` each)

## Storage TTL

All persistent entries are written with a TTL of `518_400` ledgers (~30 days at 5 s/ledger). The TTL is refreshed on every state-changing write to prevent expiry during an active match.

## Sequence Diagrams

### Happy Path — Player 1 Wins

The diagram below shows the full flow from match creation through winner payout when Player 1
wins the game.

```mermaid
sequenceDiagram
    actor P1 as Player 1
    actor P2 as Player 2
    participant EC as Escrow Contract
    participant OC as Oracle Contract
    participant OOS as Off-chain Oracle Service
    participant Chess as Lichess / Chess.com API

    P1->>EC: create_match(player1, player2, stake, game_id, Lichess)
    EC-->>P1: match_id

    P1->>EC: deposit(match_id, player1)
    EC-->>P1: ok (1 of 2 deposits received)

    P2->>EC: deposit(match_id, player2)
    EC-->>P2: ok — match transitions to Active
    EC--)EC: emit ("match", "activated")

    Note over P1,P2: Players play the chess game on Lichess

    Chess-->>OOS: game result available (Player 1 wins)
    OOS->>OC: submit_result(match_id, game_id, Player1Wins)
    OC-->>OOS: ok
    OC--)OC: emit ("oracle", "result")

    OOS->>EC: submit_result(match_id, game_id, Player1, oracle_addr)
    EC->>EC: verify game_id match & Active state
    EC->>P1: transfer(stake × 2)
    EC-->>OOS: ok — match transitions to Completed
    EC--)EC: emit ("match", "completed")
```

### Draw Path — Stakes Refunded

This diagram shows the flow when the game ends in a draw. Both players receive their original
stake back.

```mermaid
sequenceDiagram
    actor P1 as Player 1
    actor P2 as Player 2
    participant EC as Escrow Contract
    participant OC as Oracle Contract
    participant OOS as Off-chain Oracle Service
    participant Chess as Lichess / Chess.com API

    P1->>EC: create_match(player1, player2, stake, game_id, Lichess)
    EC-->>P1: match_id

    P1->>EC: deposit(match_id, player1)
    EC-->>P1: ok

    P2->>EC: deposit(match_id, player2)
    EC-->>P2: ok — match transitions to Active

    Note over P1,P2: Players play the chess game on Lichess

    Chess-->>OOS: game result available (Draw)
    OOS->>OC: submit_result(match_id, game_id, Draw)
    OC-->>OOS: ok
    OC--)OC: emit ("oracle", "result")

    OOS->>EC: submit_result(match_id, game_id, Draw, oracle_addr)
    EC->>P1: transfer(stake)
    EC->>P2: transfer(stake)
    EC-->>OOS: ok — match transitions to Completed
    EC--)EC: emit ("match", "completed")
```

## Events

| Contract | Topics | Data |
|----------|--------|------|
| Escrow | `("match", "created")` | `(match_id, player1, player2, stake_amount, game_id)` |
| Escrow | `("match", "activated")` | `match_id` |
| Escrow | `("match", "deposit")` | `(match_id, player, stake_amount)` |
| Escrow | `("match", "completed")` | `(match_id, winner, payout_amount)` |
| Escrow | `("match", "cancelled")` | `(match_id, caller)` |
| Escrow | `("admin", "paused")` | `()` |
| Escrow | `("admin", "unpaused")` | `()` |
| Escrow | `("admin", "oracle")` | `new_oracle` |
| Escrow | `("admin", "adm_xfer")` | `(old_admin, new_admin)` |
| Oracle | `("oracle", "init")` | `admin` |
| Oracle | `("oracle", "result")` | `(match_id, result, timestamp)` |
| Oracle | `("oracle", "adm_xfer")` | `(old_admin, new_admin)` |
