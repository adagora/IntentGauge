# Uplift, pass 1

Compared with the CLI at `efd1bf0` (rename only, no robot surfaces). Post binary is `179c321`.

Median weighted-score delta: **313** points across 19 surfaces. No surface dropped.

The large deltas on `capabilities`, `robot-docs`, `version`, and `--robot-triage` start from 0 because those commands did not exist. `capabilities --json` on the old binary exited 2 with Node's unknown-option text (`audit/agent_simulations/pre_pass_1/capabilities.stderr`).

Surfaces that already existed moved because the error text changed, not because the gate math changed. `valdiate` used to print `Use --help.` It now prints `hint: intentgauge validate SUITE.json`.

`run` still writes a timestamped report id. That dimension was not treated as fixed.
