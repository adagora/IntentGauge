#!/usr/bin/env bash
# Pins: dashboard --once prints JSON and exits, and help --json is JSON.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
out="$(mktemp)"
err="$(mktemp)"
dir="$(mktemp -d)"
trap 'rm -rf "$out" "$err" "$dir"' EXIT
node dist/src/cli.js dashboard "$dir" --once >"$out" 2>"$err"
test ! -s "$err"
jq -e '.reports | type == "array"' "$out" >/dev/null
node dist/src/cli.js help validate --json >"$out" 2>"$err"
test ! -s "$err"
jq -e '.command == "validate" and (.usage | contains("intentgauge validate"))' "$out" >/dev/null
echo OK
