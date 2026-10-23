#!/usr/bin/env bash
# run-verifier.sh — fetch the published verify-settled.mjs from its public
# task endpoint, sha256-pin it, run it against the live settled feed + a
# public Base RPC, emit VERIFICATION.md. Exits nonzero (loudly) on: fetch
# failure, hash mismatch, any failed row.
set -euo pipefail

# The public task endpoint serving the published sample (submission_public).
SAMPLE_URL="${SAMPLE_URL:-https://api.basedagents.ai/v1/tasks/task_9Jwd52CoRIkV3kKfF6Oor}"
EXPECTED_SHA256="${EXPECTED_SHA256:-148a2e1ed6914e8139eb6eb98f2416054ba96bb807670b1b48ee46ab870daa71}"
API_URL="${API_URL:-https://api.basedagents.ai}"
RPC_URL="${RPC_URL:-https://mainnet.base.org}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "== [1/4] fetch verifier from public task endpoint =="
python - "$SAMPLE_URL" "$WORK/task.json" <<'PY'
import json, sys, urllib.request
req = urllib.request.Request(sys.argv[1],
    headers={"accept": "application/json",
             "user-agent": "nonsynthetic-verifier/1.0"})
with urllib.request.urlopen(req, timeout=30) as r:
    doc = json.loads(r.read().decode("utf-8"))
open(sys.argv[2], "w", encoding="utf-8").write(json.dumps(doc))
PY
python - "$WORK/task.json" "$WORK/verify-settled.mjs" <<'PY'
import json, sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
sub = doc.get("submission") or {}
files = (json.loads(sub.get("content", "{}")).get("files") or {})
src = files.get("verify-settled.mjs")
if not src:
    sys.exit("no verify-settled.mjs in published submission")
open(sys.argv[2], "w", encoding="utf-8", newline="").write(src)
PY
wc -c "$WORK/verify-settled.mjs"

echo "== [2/4] sha256 pin check =="
ACTUAL="$(sha256sum "$WORK/verify-settled.mjs" | cut -d' ' -f1)"
echo "expected: $EXPECTED_SHA256"
echo "actual:   $ACTUAL"
if [ "$ACTUAL" != "$EXPECTED_SHA256" ]; then
  echo "::error:: sha256 mismatch — refusing to run unpinned verifier"
  exit 2
fi
echo "pin check PASS"

echo "== [3/4] verify =="
set +e
node "$WORK/verify-settled.mjs" --api "$API_URL" --rpc "$RPC_URL" \
  > "$WORK/verify.log" 2>&1
RC=$?
set -e
cat "$WORK/verify.log"
SUMMARY="$(grep -E '^Summary:' "$WORK/verify.log" || echo 'Summary: missing')"
FAILED="$(echo "$SUMMARY" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo '?')"

echo "== [4/4] write VERIFICATION.md =="
DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo "# Settled-feed verification — $DATE"
  echo
  echo "- verifier: $SAMPLE_URL"
  echo "- sha256: \`$ACTUAL\` (pinned: \`$EXPECTED_SHA256\`)"
  echo "- api: $API_URL  rpc: $RPC_URL"
  echo "- result: exit=$RC — $SUMMARY"
  echo
  echo '```'
  cat "$WORK/verify.log"
  echo '```'
} > VERIFICATION.md

if [ "$RC" -ne 0 ] || [ "$FAILED" != "0" ]; then
  echo "::error:: verifier reported failures — see VERIFICATION.md"
  exit 1
fi
echo "ALL ROWS PASS"
