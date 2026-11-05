# CityWheels through ai-audit and Quinelings

This integration executes the JavaScript agent in the sibling ai-audit checkout. The Python help-desk bridge is no longer used.

Build ai-audit first, then run from IntentGauge:

```sh
npm --prefix ../ai-audit run build
npm run citywheels
npm run citywheels:check
```

Set `CITYWHEELS_ROOT` to the ai-audit checkout when it is not a sibling directory. Offline mode needs no Python, `.env`, API key or paid provider. The provider boundary is a scripted fake model; the real agent loop, tools, proxy restrictions and Quinelings refund rule execute. Offline results measure integration behavior, not live-model quality or general injection resistance.

## Full workflow with a real model

Keep `OPENAI_API_KEY` in the sibling ai-audit `.env` (never commit it), or export it in your shell. From IntentGauge:

```sh
npm run citywheels:live -- --case refund-1002
npm run citywheels:live
npm run dashboard
```

The first command runs one real refund question. The second runs all 21 cases. Both make billable OpenAI calls using the existing example default, `gpt-4o-mini`. Select a different compatible Chat Completions tool-calling model with `--model NAME`. The implementation follows [OpenAI's function-calling loop](https://developers.openai.com/api/docs/guides/function-calling).

The live command explicitly loads `../ai-audit/.env` when it exists. For another key-file location, build IntentGauge then use `node --env-file=/path/to/.env integrations/citywheels/run.mjs --live`. `CITYWHEELS_ROOT` changes the application location, not that key-file path. Missing credentials fail before any cases execute.

Open the dashboard URL printed by `npm run dashboard`, then select the newest `citywheels-live-...` run. Inspect customer questions, actual model answers, tool results, QDL decisions and individual checks. A failing check makes the command exit 1, but its report and dashboard are still saved. Live runs do not execute the deliberately corrupted candidate or silently repeat paid calls. Use `--repetitions 3` explicitly for repeated runs; it multiplies API use. The suite and relation checks are identical across provider modes, while provider/model enter the target identity. Single-case smoke tests have a filtered suite and do not run cross-case relations.

These are development fixtures, not real customer traffic. Some checks are literal substrings and may reject a correct paraphrase or currency format; inspect the failed check and actual answer. Do not rewrite expected refund amounts to match a model mistake. The adapter reports no estimated API cost. Passing this small suite is not proof of production reliability.

Refund amount checks accept equivalent notation such as `340 EUR`, `EUR 340`, and `€340.`. The original answer remains unchanged in the report. Test the integration checks without API calls:

```sh
node --test integrations/citywheels/live.test.mjs
```

If an evaluator bug is fixed, rescore saved answers without paying for another model run:

```sh
node integrations/citywheels/rescore.mjs runs/citywheels-live-DATE/report.json
```

This requires an identical suite hash so the expected outcomes cannot silently change. It saves a separate dashboard labeled `RECORDED RESPONSES / rescore`, plus source-report identity. Original reports remain unchanged. Its timing measures replay; each observation retains `originalLatencyMs` from the source run. This is not a new live application run.

Each evaluation calls `examples/citywheels/scripts/citywheels-intentgauge.mjs` in a separate Node process. It copies booking/policy data into a temporary directory, applies only an explicitly requested rental-price override, and uses the requested fixed clock. It starts a real in-process ai-audit proxy with a fake upstream in offline mode or OpenAI in live mode, runs the actual agent, and returns its answer, actual tool calls/results, retrieved policy passages, refund and audit record IDs/hashes. It verifies the chain and checks that booking data remained unchanged. Case inputs, copied fixtures, observations and audit logs are retained in the ai-audit checkout under `live/evaluations/`. Each completed baseline case also receives `evaluation-link.json` pointing back to this report. Run `node scripts/evaluations.mjs` from ai-audit to list evidence, or use its `--console CASE_DIRECTORY` option to inspect the real log.

The target receives only case input, never assertions. The target revision hashes the adapter, worker, built ai-audit code, example agent/data/rule and bundled SDK archive. Rebuild ai-audit after source changes. No synthetic intent predictions, citations or cost estimates are emitted.

The suite has 21 development cases: 15 existing ai-audit CityWheels questions, four exact/one-second-below refund boundaries, an instruction intervention and a stored-price intervention. It replaces the old Python-specific suite; booking-change and other Python-only scenarios are not covered by this target. Expectations remain explicit and must be reviewed. Refresh deliberately with:

```sh
node integrations/citywheels/prepare.mjs
```

The normal command writes baseline and explicitly injected-regression dashboards. The injected wrapper changes the observed CW-1002 amount from 340 to 342 EUR; this is a negative control, not an actual discovered application failure. `citywheels:check` runs only the baseline and exits nonzero for failed checks or execution errors. Both commands save real evaluation reports usable by `npm run dashboard`.

Compared with the previous integration, the returned refund fields are the ai-audit tool's actual fields, such as `total_refund_eur`. We do not pretend its output is the Python agent's schema. The source holdout labels are not carried over: all these inspected cases are development tests.

## Both help-desk implementations

The Python application remains a comparison target. From ai-audit, run `node examples/citywheels/scripts/compare-helpdesks.mjs` to execute both agents on shared business checks and retain both reports plus side-by-side answers in ai-audit. Offline mode uses distinct scripted providers and cannot rank live-model reliability. A repeated live comparison is available from ai-audit: `node --env-file=.env scripts/compare-helpdesks.mjs --live --model gpt-4o-mini --repetitions 3`. This is billable and executes 126 customer questions. Both applications receive the same requested model and fixtures; prompts and tools remain their own. Business outcomes and ai-audit control checks have separate reports, and every repetition is retained. Storm escalation accepts either policy retrieval or refund-tool routing when the customer is directed to staff. See `docs/helpdesk-experiment-blueprint.md` in ai-audit for the architecture and remaining stages.
