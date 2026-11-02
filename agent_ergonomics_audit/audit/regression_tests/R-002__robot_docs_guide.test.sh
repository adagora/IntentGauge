#!/usr/bin/env bash
# Pins: robot-docs guide names validate and replay, and --json wraps the same text.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
out="$(mktemp)"
err="$(mktemp)"
trap 'rm -f "$out" "$err"' EXIT
node dist/src/cli.js robot-docs guide >"$out" 2>"$err"
test ! -s "$err"
grep -q 'intentgauge validate' "$out"
grep -q -- '--replay' "$out"
node dist/src/cli.js robot-docs guide --json >"$out.json"
jq -e '.guide | contains("Exit codes stay fixed")' "$out.json" >/dev/null
node dist/src/cli.js --robot-help >"$out.help"
cmp -s "$out" "$out.help"
rm -f "$out.json" "$out.help"
echo OK
