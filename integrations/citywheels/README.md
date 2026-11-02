# CityWheels project evaluation

Run this from the IntentGauge repository:

```sh
npm run citywheels
```

The command executes the separate Python application, writes a fresh baseline report,
a standalone project dashboard, a deliberately corrupted candidate, and a comparison.
It prints all paths. Open the baseline `dashboard.html`. Its Overview shows the result and next action.
The Cases view contains customer questions, actual answers, and check results.
Human scoring and Classification have separate views; Workflow explains integration.
`report.html` includes the full normalized tool trace.

The default checkout is:
`/Users/gora/AI_Project/EternalChat copy/help-desk-agent/help-desk-agent`.
Override it with `CITYWHEELS_ROOT`; override Python with `CITYWHEELS_PYTHON`.

## What is executed

`bridge.py` imports and calls the application's `run_agent` and `FakeModel` directly.
The real loop runs `search_policies`, `get_booking`, and `calculate_refund` as requested.
It does not read `.env`, instantiate hosted providers, or make paid model calls.
Python bytecode writes are disabled. Each case gets a temporary data copy; the original
checkout stays unchanged. The stored-price intervention edits only its temporary copy.
The adapter passes no reference assertions to the agent.

`target.mjs` hashes the adapter, bridge, application Python sources, and policy/booking
files into the target revision. It records actual tool outputs and policy passages;
it does not invent predicted intents, citations, target costs, or semantic scores.
A source-booking comparison and a fixture comparison detect writes during each call.

## Coverage and limitations

The 20 imported questions retain the project's expectations. Six added cases cover:
exactly 48 hours, one second below 48 hours, exactly 24 hours, one second below 24 hours,
a hostile refund instruction, and a changed stored rental price. Numeric oracles are fixed
from the documented policy and booking fields, not computed by the tested refund function.
The original `holdout` labels are preserved as metadata, but these questions have been
inspected and are not a protected independent holdout.

A passing offline fake-provider run establishes this code path's behavior. It does not
establish OpenAI/Gemini answer quality, general prompt-injection resistance, authorization,
or correctness on representative real customer conversations. String checks are literal,
not semantic judgments. No business mistake-cost matrix has been invented.

The deliberate regression changes the baseline CW-1002 refund from 340 to 342 EUR in a
wrapper's returned answer and observation. Its report is explicitly labeled injected;
it is a negative control, not a discovered application defect.

No intent classifier is emitted by the application, so classification precision/recall and
the confusion matrix are unavailable. The dashboard shows that limitation explicitly.

To refresh the suite after deliberately changing project scenarios:

```sh
node integrations/citywheels/prepare.mjs
```

Review oracle changes before accepting new scores. Never update expectations merely to
match an incorrect new output.

## Use as a workflow gate

```sh
npm run citywheels:check
```

This runs only the baseline candidate, saves fresh evidence, and exits 0 when its fixed
suite passes or 1 when it fails. It does not run the deliberate-regression demonstration.
An execution/configuration error also exits nonzero. A CI job or research controller can
invoke this command and retain its output artifacts. Set `CITYWHEELS_ROOT` when the checkout
lives elsewhere. No CI workflow or production deployment was installed into CityWheels.

The project dashboard starts with Overview and separates Cases, Human scoring,
Classification, and Workflow. Human scoring accepts a local calibration JSON file in the
format consumed by `intentgauge calibrate`; it reuses the SDK's validation, agreement, Cohen's
kappa, and per-intent/rubric eligibility code. Imported labels are not persisted or bound
to this evaluation run. No human scores are prefilled. Calibration measures reviewer/judge
agreement; a baseline for actual human workers must be collected separately.


Human scoring also offers **Start a human review**: define a rubric, download two separate
reviewer worksheets, import their completed labels and adjudicate disagreements before
exporting development review evidence. Download labels before closing or reloading; there
is no automatic persistence or reviewer authentication. The inspected CityWheels cases
remain development examples rather than a protected calibration holdout.

The injected candidate's dashboard embeds the baseline comparison, with links to new,
recovered and persistent failures. `npm run dashboard` serves the newest saved run and a
run selector; the older simulation is available through Simulation laboratory.
