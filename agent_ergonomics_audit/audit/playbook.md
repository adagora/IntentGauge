# Playbook, pass 1

IntentGauge is a five-command evaluation CLI plus the agent surfaces added in this pass. The evaluation formulas, schema version, and exit codes were left alone.

## What an agent should run

1. `intentgauge capabilities --json`
2. `intentgauge --robot-triage`
3. `intentgauge validate examples/rag/suite.json`
4. `intentgauge run examples/rag/suite.json --replay examples/rag/outputs.json`
5. `intentgauge compare BASELINE/report.json CANDIDATE/report.json`
6. `intentgauge dashboard RUNS_DIRECTORY --once`

Stdout is the data. Stderr is the diagnostic. Exit 1 means the gates failed and the JSON result is on stdout. Exit 2 means the invocation was wrong. Copy `hint`.

## What changed

- `capabilities` and `robot-docs guide` publish the contract in the tool.
- `--robot-triage` returns `quick_ref`, `recommendations`, `commands`, and `health` with no clock field.
- Usage errors name the next command. `valdiate` and `--jsno` name the closest spelling. `replay` used as a command points at `run --replay`.
- `--json` is accepted on the read commands. With no command it prints machine help.
- `version` and `--version` print the package version.
- `dashboard --once` prints the saved-run summary and exits. The listening server remains the default.

## What this pass refused

Exit 1 stays "evaluation, regression, or calibration failed". Remapping it to a generic usage code would break `test/integration.test.ts` and the CityWheels flow. A `--dry-run` that skips the target was not added. `--replay` is the offline path.
