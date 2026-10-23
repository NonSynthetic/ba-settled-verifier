# ba-settled-verifier

Nightly independent verification of the BasedAgents settled-payments feed.

Every night at 03:17 UTC the workflow:

1. downloads the published `verify-settled.mjs` sample from its public
   task endpoint (read-only),
2. refuses to run unless its sha256 matches the pinned `EXPECTED_SHA256`
   repo variable,
3. runs it against the live settled feed + a public Base RPC,
4. commits the resulting `VERIFICATION.md` (date, rows, pass/fail,
   summary) — failing loudly if any row fails.

## Simulated failure (proof the pin works)

Locally doctored copy (hash changed by one byte appended) makes the
pin check exit `2` before the verifier runs — see `test_log.md` for the
actual green run + the doctored-run rejection.
