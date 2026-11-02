# Handoff, pass 1

Branch: `master`. No new branch. Workspace: `agent_ergonomics_audit/` inside this repo.

Behavior commits:

- `7d64a2f` capabilities, robot-docs, `--robot-triage`, usage hints, typo recovery, `--json`, version
- `179c321` `dashboard --once` and `help --json`

`efd1bf0` is the earlier IntentGauge rename. It is not an ergonomics change.

## Contract an agent can rely on

- Stdout is data. Stderr is diagnostics.
- 0: gates passed or the command succeeded.
- 1: evaluation, regression, or calibration failed. The result is on stdout. Do not retry the same inputs.
- 2: configuration or usage error. If `hint` is present, copy it.
- `intentgauge capabilities --json` is the dictionary.
- `intentgauge --robot-triage` is the one-shot next step.
- `intentgauge dashboard RUNS_DIRECTORY --once` reads saved runs and exits.

## Deferred

- R-008: no `--dry-run` executor. `--replay` is the offline path. A dry run would be a new execution mode.
- Exit codes were not remapped onto the generic 1=usage, 2=safety dictionary. Tests and CityWheels depend on 1 meaning a failed gate.
- CASS mining was skipped. The `cass` helper is not installed.
- No second model scored the surfaces. `spread_max` is 0 for that reason.
- `flock` and `timeout` were missing on macOS. Preflight used temporary PATH shims. Nothing was installed with Homebrew.
- The listening dashboard was not browser-tested in this pass. `--once` was tested from the CLI.
- No license file was added. No domain was bought. Nothing was published.

## Next pass, only if someone asks

A whole-run profile is still the first roadmap item, and it is not part of this CLI surface. Do not start it from this handoff.
