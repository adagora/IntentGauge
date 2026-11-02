# Canonical tasks

1. Read the contract: `intentgauge capabilities --json`. Exit 0. Stderr empty.
2. Ask what to run next: `intentgauge --robot-triage`. Exit 0. The object has `quick_ref`, `recommendations`, `commands`, and `health`.
3. Check a suite: `intentgauge validate examples/rag/suite.json`. Exit 0. JSON `valid: true`.
4. Score recorded outputs: `intentgauge run examples/rag/suite.json --replay examples/rag/outputs.json --out runs/NEW`. Exit 0 when the gates pass.
5. See a regression: the same command with `examples/rag/regressed.json` exits 1. The result stays on stdout.
6. Recover a typo: `intentgauge valdiate examples/rag/suite.json` exits 2. Copy `hint`.
7. Read saved runs without a server: `intentgauge dashboard RUNS_DIRECTORY --once`.
