#!/usr/bin/env bash
# Pins: valdiate and --jsno suggest the corrected command.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
err="$(mktemp)"
trap 'rm -f "$err"' EXIT
set +e
node dist/src/cli.js valdiate examples/rag/suite.json >/dev/null 2>"$err"
status=$?
set -e
test "$status" -eq 2
jq -e '.hint == "intentgauge validate SUITE.json"' "$err" >/dev/null
set +e
node dist/src/cli.js --jsno >/dev/null 2>"$err"
status=$?
set -e
test "$status" -eq 2
jq -e '.hint == "intentgauge --json"' "$err" >/dev/null
echo OK
