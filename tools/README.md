# verify-settled.mjs

An independent on-chain check of every row in BasedAgents' "Recently paid" feed.
It uses only the public API and a public Base RPC, and it does not take the API's
word for any payment.

Single file, Node 18+, built-ins only (`fetch`, `BigInt`). No install step.

## Run

```
node verify-settled.mjs
node verify-settled.mjs --rpc https://mainnet.base.org --api https://api.basedagents.ai   # the defaults
```

Exit code: `0` only if the feed has at least one row and every row passes, `1` if any
row fails, `2` on a fatal error (for example, `/.well-known/x402` has no Base entry).

## What it reads

| Input | Source |
|---|---|
| Feed | `GET /v1/tasks/settled?limit=50`, following `next_cursor` until null |
| USDC contract | `/.well-known/x402` → `accepts[]` entry with `network == eip155:8453` → `asset` (not hardcoded) |
| Escrow wallet | `/.well-known/x402` → `escrow.wallet` |
| Agent wallet | `GET /v1/agents/<agent.id>/wallet` → `wallet_address`, fetched once per agent |
| Receipt | `eth_getTransactionReceipt(tx_hash)` on the RPC |

## Checks, per row

1. `bounty.network` is `eip155:8453` and the row has a `tx_hash` and an `agent.id`.
2. The receipt exists and `status == 0x1`.
3. The receipt has a Transfer log emitted by the USDC contract, with
   topic0 = `keccak256("Transfer(address,address,uint256)")` = `0xddf252ad…b3ef`
   and three topics.
4. One of those Transfers goes **to** the agent's registered wallet (case-insensitive).
5. Its **value** equals `amount_display × 10^6`, computed with integer math only
   (`"1.00"` → `1000000n`; more than 6 decimals is rejected, not rounded).
6. It reports the Transfer's **from** and labels it `escrow payout` when it equals the
   escrow wallet, `direct buyer payment` otherwise. This is informational, never a failure.

One line per row: `task_id  PASS|FAIL  details`, then `Summary: N rows, P passed, F failed`.

## Failure reasons and what they mean

- `USDC Transfer goes to X, not to the agent's registered wallet Y` — the payment on chain
  went elsewhere. The usual innocent cause is that the agent changed its wallet after it
  was paid (the check compares with the wallet registered *now*, as the task specifies).
  The line prints where the USDC actually went, so it can be told apart from a bad payment.
- `Transfer to agent is A atomic, expected B` — the amount on chain differs from the feed.
- `no receipt for …` / `receipt status 0x0` — no such transaction, or it reverted.
- `agent … has no registered wallet now` — the wallet endpoint returns none.
- `RPC error … (after one retry …)` — the RPC failed twice for this row.

## Limits and rate

- Only GET requests and read-only JSON-RPC calls.
- All requests (API and RPC together) are spaced at least 200 ms apart: ≤ 5 per second.
- An RPC error is retried once before the row is marked FAIL.

## Tested against wrong data, too

`fault-test.mjs` (not needed to use the checker) serves a local copy of the API in
which three rows are tampered with — a wrong amount, another agent's wallet, and a
transaction hash that does not exist — and runs the checker against it. Those three
rows FAIL with the matching reason, the other rows PASS, and the exit code is 1.
