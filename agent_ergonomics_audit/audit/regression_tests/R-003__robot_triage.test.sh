#!/usr/bin/env bash
# Pins: --robot-triage returns quick_ref, recommendations, commands, and health with no clock timestamp.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
out="$(mktemp)"
err="$(mktemp)"
trap 'rm -f "$out" "$err"' EXIT
node dist/src/cli.js --robot-triage >"$out" 2>"$err"
test ! -s "$err"
jq -e '.quick_ref and .recommendations and (.commands | length >= 3) and .health and .data_hash' "$out" >/dev/null
if grep -Eq '[0-9]{4}-[0-9]{2}-[0-9]{2}T' "$out"; then
  echo 'REGRESSION: robot-triage leaked a timestamp' >&2
  exit 1
fi
node dist/src/cli.js --robot-triage --json >"$out.2"
cmp -s "$out" "$out.2"
rm -f "$out.2"
echo OK
