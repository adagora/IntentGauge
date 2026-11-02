#!/usr/bin/env bash
# Pins: version is JSON, bare help mentions the agent surfaces, and help has no color codes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
out="$(mktemp)"
err="$(mktemp)"
trap 'rm -f "$out" "$err"' EXIT
node dist/src/cli.js version >"$out" 2>"$err"
test ! -s "$err"
jq -e '.name == "intentgauge" and .version' "$out" >/dev/null
node dist/src/cli.js --version >"$out.2"
cmp -s "$out" "$out.2"
node dist/src/cli.js >"$out" 2>"$err"
test ! -s "$err"
grep -q 'capabilities --json' "$out"
grep -q -- '--robot-triage' "$out"
grep -q 'robot-docs guide' "$out"
if grep -q $'\033' "$out"; then
  echo 'REGRESSION: help contains an ANSI escape' >&2
  exit 1
fi
rm -f "$out.2"
echo OK
