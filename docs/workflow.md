# IntentGauge in the delivery workflow

IntentGauge owns measurement: fixed cases, observed outputs, checks, metrics, and an evaluation
verdict. A target adapter connects the application. JSON reports and exit codes connect
measurement to CI, experiment controllers, and release review.

```text
Business policy + representative cases
                    ↓
Reviewed gold labels + human performance baseline
                    ↓
Judge calibration on independently held-out labels
                    ↓
Candidate → IntentGauge → report + exit code
                    ↓
Authorized qualification review
                    ↓
Production policy controller → monitoring → new evaluation cases
```

These are distinct responsibilities, not all implemented services in this repository.
Human approvals, online monitoring, durable transaction orchestration, and enforcement of
production autonomy tiers belong to surrounding systems. An evaluation pass alone grants
no authority.

## Human scoring

`calibrate` consumes two Boolean reviewer labels per held-out case/rubric. A third reviewer
must adjudicate disagreements. It reports raw agreement and Cohen's kappa for human-human
and judge-gold comparisons, unresolved cases, false positives/negatives, and class support.
Eligibility uses minimum per-intent/rubric sample count, both resolved gold classes,
complete adjudication, and judge agreement at least as high as human agreement and the
configured floor. Kappa is diagnostic; it is not an additional eligibility threshold.
Undefined kappa remains null. Dataset fields cannot establish that review was blind,
independent, or held out from tuning. Eligibility is not automatically applied to a run.

The project dashboard's Human scoring view offers two separate paths. Start a human review
by naming a rubric and two reviewers, downloading independent HTML worksheets, importing
the completed label files, and resolving disagreements through a third reviewer. Export the
reviewed development dataset to retain the evidence. These inspected cases are marked dev;
they cannot be imported as judge-calibration holdout data and contain no invented judge labels.
Packets omit automated check verdicts and the other reviewer's labels. They do not authenticate
reviewers or prove blind review. Download labels before closing or reloading the packet.

Import existing calibration JSON to use the same validation and metrics as the CLI. Threshold
edits recalculate immediately. Class support, unresolved rows, and actual versus required
agreement explain failed eligibility. Imports stay local in browser memory and are not bound
to the evaluation run. Neither path measures actual human worker performance.

## Classification

A confusion matrix requires expected and observed predicted intents. Supplied expected
labels alone cannot establish classification performance. When an application emits no
predicted intent, the project dashboard presents an empty state instead of treating
missing predictions as evidence that its routing is wrong. Raw missing/error counts
remain available in the report. With predictions, the separate Classification view
shows the matrix, precision/recall, and mistake-cost coverage.

## CityWheels

`npm run citywheels:check` is the scriptable offline evaluation gate; `npm run citywheels`
also runs a deliberately corrupted candidate to demonstrate detection. Both save a clean
project dashboard, starting with Overview. Cases, Human scoring, Classification, and
Workflow are separate views. The original simulation cockpit remains an exploratory demo.

`npm run dashboard` opens the newest saved evaluation. Use Change run / refresh to select
another artifact, or Simulation laboratory for the original cockpit. Candidate pages can
show compatible baseline comparisons, including new, recovered and persistent failures.
