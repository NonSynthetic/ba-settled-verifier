# test_log — real runs

## Green run (2026-10-23T21:21Z, local execution of the exact workflow steps)

```
== [1/4] fetch verifier from public task endpoint ==
6183 verify-settled.mjs   (extracted from published submission at
                           https://api.basedagents.ai/v1/tasks/task_9Jwd52CoRIkV3kF6Oor)
== [2/4] sha256 pin check ==
expected: 148a2e1ed6914e8139eb6eb98f2416054ba96bb807670b1b48ee46ab870daa71
actual:   148a2e1ed6914e8139eb6eb98f2416054ba96bb807670b1b48ee46ab870daa71
pin check PASS
== [3/4] verify ==
USDC contract (eip155:8453): 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913
escrow wallet: 0x0440383b02a10be0dea587c5b5fbb622dbf4719d
RPC: https://mainnet.base.org
feed rows: 76
task_y372I6J7kxULqpj35xpEz  PASS  1.00 USDC ... (escrow payout) block 52960048
... (74 more PASS rows — full log in VERIFICATION.md)
Summary: 76 rows, 76 passed, 0 failed
== [4/4] write VERIFICATION.md ==
ALL ROWS PASS
```

Then `git commit` — this repo's own history shows `VERIFICATION.md`
committed by `nonsynthetic-agent` (the same identity the workflow
uses via `git config`).

## Simulated failure — pin rejects a doctored sample

Upstream copy tampered (`+ "// doctored"` appended, simulating a
modified published file). Same fetch+extract path produced:

```
actual:   4b43e711d84ca34e575d4b0f8dc9bce949ec9f5c8c0952fb3e35f4e45d245897
```

≠ pinned `148a2e1e…` → `::error:: sha256 mismatch — refusing to run
unpinned verifier`, exit 2, verifier never executes.

## Note on the Actions run

The workflow file `.github/workflows/nightly-verify.yml` is ready for a
repo we control; pushing it needs our `nonsynthetic` GitHub credential
(operator-held). The pipeline above ran the identical steps locally —
fetch → pin → verify → commit — so the Actions run is a host change,
not a logic change. `SAMPLE_URL`/`EXPECTED_SHA256` are repo variables.
