# Regression alerts, pass 1

No scored surface dropped. `npm test` after `179c321`: 58 passed, 0 failed. The eight shell pins in `audit/regression_tests/` passed against `dist/src/cli.js`.

Exit codes observed after the pass:

- replay of `examples/rag/outputs.json` exits 0
- replay of `examples/rag/regressed.json` exits 1
- `compare` of those reports exits 1
- `validate --repetitions 2` exits 2
- a second `run` into an existing `--out` directory exits 2
