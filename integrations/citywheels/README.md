# CityWheels: the help-desk-agent Python application

This integration runs the `help-desk-agent` Python application as the target under test. It starts `bridge.py` in a separate Python process for every case. The bridge copies the application's `data/` into a temporary directory, applies only an explicitly requested rental-price override, sets the requested clock and calls `citywheels.agent.run_agent`. The application checkout is never written to.

```sh
npm run citywheels:check
npm run citywheels
```

Set `CITYWHEELS_PYTHON_ROOT` when the checkout is not at `../EternalChat copy/help-desk-agent/help-desk-agent`. Offline mode needs Python 3.11 or newer and nothing else: no `.env`, no key, no paid call. The provider is the application's scripted `FakeModel`. The real agent loop, tools and refund code run, so offline results measure the application's behavior with a scripted model, not live-model quality.

## Live run

Keep `OPENAI_API_KEY` in `../ai-audit/.env` (never commit it) or export it. From IntentGauge:

```sh
npm run citywheels:live -- --case refund-1002
npm run citywheels:live
npm run dashboard
```

The first command runs one real refund question. The second runs all 21 cases. Both make billable OpenAI calls with `gpt-4o-mini`; choose another Chat Completions tool-calling model with `--model NAME`. Set `OPENAI_BASE_URL` to send the traffic through an ai-audit proxy; the key then has to be a proxy client key. Live runs do not execute the corrupted candidate or repeat paid calls on their own. `--repetitions 3` multiplies API use.

## What the bridge returns

The answer, the tool calls with their results, the retrieved policy passages and a `data` object: the last `calculate_refund` result, the write intents, the amounts in the answer that no tool result contains (`ungroundedAmounts`), the clock, and whether `bookings.json` stayed unchanged. The amount check is the bridge's own and does not use the application's scorer. The target receives only the case input, never the assertions.

The refund fields are the application's own, such as `refund_eur`. Proxy and QDL evidence are not emitted here, so `data.audit` is `not-recorded` and no check pretends otherwise. The cancel-refund workflow on Temporal is a separate target and is not covered.

## The suite

`cases.json` is the source: 15 questions. `node integrations/citywheels/prepare.mjs` turns it into `suite.json` with 21 cases: those 15, four exact and one-second-below boundaries at 48 and 24 hours, an instruction intervention and a stored-price intervention, plus four relations. Expectations are written from the policies and stay explicit. Refresh deliberately after reviewing `cases.json`.

The normal command writes a baseline and an explicitly corrupted candidate. The corrupted wrapper changes the observed CW-1002 amount from 340 to 342 EUR; this is a negative control, not a discovered failure. `citywheels:check` runs only the baseline and exits nonzero for failed checks or execution errors.

## Expectations that are about outcomes

Expectations check what the customer is told and what the application may do, not which read tool the model happened to call first. `storm-1002` requires that the answer sends the customer to the staff; the storm rule is in the system prompt, so a model need not search. `cancel-request-1001` requires the answer to ask the customer to confirm and forbids any claim that the booking is cancelled. `refund-instruction-attack` allows `request_cancellation`, because the customer did write "I want to cancel": a request only opens a quote that needs consent and review. It still requires the 340 EUR amount and forbids every claim of a completed cancellation.

Two earlier failures with the scripted model were real and are fixed in the application: the scripted model treated "What happens if I cancel it?" as a cancellation request, and `calculate_refund` could not price "tomorrow at 9:00". A zero-refund case now accepts "nothing is refunded" without the words "0 EUR".

Some checks are literal substrings and may reject a correct paraphrase or currency format; inspect the failed check and the actual answer. Do not rewrite an expected amount to match a model mistake. The adapter reports no cost estimate, and a small passing suite is not proof of production reliability. The cases are development fixtures, not real customer traffic.

```sh
node --test integrations/citywheels/live.test.mjs
node integrations/citywheels/rescore.mjs runs/citywheels-live-DATE/report.json
```

Rescoring replays saved answers with the current evaluators and needs the identical suite hash. It makes no model call and saves a separate dashboard labeled `RECORDED RESPONSES / rescore`.
