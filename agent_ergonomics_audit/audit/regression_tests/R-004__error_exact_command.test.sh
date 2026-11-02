#!/usr/bin/env bash
# Pins: a flag that does not apply names the command that accepts it.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
err="$(mktemp)"
trap 'rm -f "$err"' EXIT
set +e
node dist/src/cli.js validate examples/rag/suite.json --repetitions 2 >/dev/null 2>"$err"
status=$?
set -e
test "$status" -eq 2
jq -e '.hint == "intentgauge run SUITE.json --replay OUTPUTS.json --repetitions N"' "$err" >/dev/null
echo OK
