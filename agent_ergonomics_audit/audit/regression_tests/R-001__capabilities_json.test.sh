#!/usr/bin/env bash
# Pins: capabilities --json includes the exit-code dictionary and command list.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
out="$(mktemp)"
err="$(mktemp)"
trap 'rm -f "$out" "$err"' EXIT
node dist/src/cli.js capabilities --json >"$out" 2>"$err"
test ! -s "$err"
jq -e '.tool_name == "intentgauge" and .exit_codes["0"] and .exit_codes["1"] and .exit_codes["2"] and .commands.validate and .commands.run and .mega_command == "intentgauge --robot-triage"' "$out" >/dev/null
node dist/src/cli.js capabilities >"$out.2"
cmp -s "$out" "$out.2"
rm -f "$out.2"
echo OK
