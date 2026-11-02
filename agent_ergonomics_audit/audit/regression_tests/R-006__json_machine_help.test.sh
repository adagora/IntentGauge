#!/usr/bin/env bash
# Pins: --json with no command is machine help, and validate --json stays JSON on stdout.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
out="$(mktemp)"
err="$(mktemp)"
trap 'rm -f "$out" "$err"' EXIT
node dist/src/cli.js --json >"$out" 2>"$err"
test ! -s "$err"
jq -e '.tool == "intentgauge" and (.commands | index("validate")) and .exit_codes["1"]' "$out" >/dev/null
node dist/src/cli.js validate examples/rag/suite.json --json >"$out" 2>"$err"
test ! -s "$err"
jq -e '.valid == true and .name and .cases > 0' "$out" >/dev/null
echo OK
