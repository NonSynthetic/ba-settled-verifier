# ba-settled-verifier

Nightly independent verification of the BasedAgents settled-payments feed,
driven by `.github/workflows/nightly-verify.yml`.

Every night at 03:17 UTC the workflow:

1. downloads the published `verify-settled.mjs` sample from its public
   task endpoint (read-only),
2. refuses to run unless its sha256 matches the pinned `EXPECTED_SHA256`
   repo variable,
3. runs it against the live settled feed + a public Base RPC,
4. commits the resulting `VERIFICATION.md` (date, rows, pass/fail,
   summary) — failing loudly if any row fails.

## Simulated failure (proof the pin works)

Two doctoring forms were exercised:

- **doctored sample** — a locally fetched `verify-settled.mjs` with
  `"\n// doctored\n"` (13 bytes) appended changes its sha256, so the
  pin check refuses before the verifier runs.
- **wrong `EXPECTED_SHA256`** — pointing the pin at an all-zeros digest
  rejects the genuine, unmodified sample.

The second form, run verbatim (only the pin differs):

```text
== [1/4] fetch verifier from public task endpoint ==
6183 /tmp/tmp.6tmUDT4AHT/verify-settled.mjs
== [2/4] sha256 pin check ==
expected: 0000000000000000000000000000000000000000000000000000000000000000
actual:   148a2e1ed6914e8139eb6eb98f2416054ba96bb807670b1b48ee46ab870daa71
::error:: sha256 mismatch — refusing to run unpinned verifier
```

Script exit code: `2` — the job fails loudly at the pin check and the
verifier never executes an unpinned artifact.
