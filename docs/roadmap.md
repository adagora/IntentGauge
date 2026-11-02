# Open roadmap

Date: 2026-11-02. These six items are proposals. The measured kernel rewrite is finished and is recorded in [data-oriented-evals.md](data-oriented-evals.md). Nothing below is an implemented service. A passing run, a loaded calibration file, or the simulation page titled "The qualification foundry" does not grant production authority.

Current source facts that every item has to preserve:

- Suites, reports, and calibration files use `schemaVersion: 1`. Comparison uses the suite hash, run options, judge revision, and evaluator revisions (`src/reports.ts`).
- Reviewer agreement is computed in `src/calibration.ts`. The dashboard's human-scoring path exports development rows and says they are not a holdout (`src/dashboard-review.ts`). There is no record of how long a person took, whether they succeeded at the task, or who is allowed to approve a tier.
- The runner builds one object per case and repetition before execution (`src/runner.ts`). That allocation was inspected and left unranked.
- Reports are whole JSON and HTML files discovered by scanning a directory (`src/dashboard.ts`). There is no manifest, content-addressed chunk, or partial-publish protocol.
- The project workflow copy already says human approval, production routing, and online monitoring belong to other systems (`docs/workflow.md`).

## Order

1. Whole-run profile. Do this before designing a runner job array or a chunked store.
2. Browser and accessibility acceptance. Independent of the profile. Required before any claim that the dashboard workflow is usable.
3. Durable evidence store. Only after the profile shows report size or I/O in the cost of a run, or a concrete reader need that whole JSON files cannot meet.
4. Human task baselines. Needs its own record type. Reviewer labels do not count.
5. Production feedback intake. Needs somewhere stable to attach an investigation and a regression case, so it follows the evidence store.
6. Qualification workflow. Needs the baseline and calibration records to exist as separate evidence, and a human decision record the software cannot write by itself.

Items 2 and 1 can proceed in parallel. Items 4, 5, and 6 stay written as contracts until their dependencies have evidence.

## 1. Whole-run profile

Depends on the existing harness style in `scripts/profile-evidence.mjs` and on a finished `run()` that already reuses finalized metrics for gates.

Acceptance:

- One profile covers a full `run()` of the offline CityWheels suite and one larger synthetic suite. Time includes target execution, checks, relations, summary, gates, and JSON/HTML serialization. Fixture construction stays outside the timed section, matching the current harness note.
- The report lists inclusive time for frames under `src/`, with the same fingerprint fields the kernel reports already store: Node version, CPU, source hashes, warmup count, and sample count.
- The runner job-array candidate stays unranked unless the profile gives its share of the run as a number. A design for packed job indexes or chunked storage does not start in that change.
- Output digests of the four finished kernels still match the frozen references. No cache is added.

## 2. Browser and accessibility acceptance

Depends on a machine that can bind `127.0.0.1` and drive a real browser. An HTTP fetch is not this item. The 2026-11-02 fetch results are in [verification.md](verification.md). The checklist is in [ux-audit.md](ux-audit.md).

Acceptance:

- A person completes the six manual checks in `docs/ux-audit.md` against `npm run dashboard`, including keyboard, Back/Forward, a screen reader, 320/375/390px, 200% zoom, and the reviewer download/import/adjudication round trip.
- The notes name the browser, viewport, and assistive technology, and quote what the screen reader announced for a view change and an import error.
- The three-second question is answered by someone who did not build the page. Their words are recorded before any comprehension claim.
- Failures become product bugs. They do not get closed by another source-only test.

## 3. Durable evidence store

Depends on item 1, or on a measured reader problem that whole `report.json` files cannot solve. The column sketch in `docs/data-oriented-evals.md` is a proposal, not a format to implement on contact.

Acceptance:

- A finished run publishes a small manifest after its evidence chunks exist. A reader that sees only part of the directory does not treat the run as complete.
- Existing `report.json` files still import and compare. `schemaVersion` stays 1 until a documented migration accepts both versions.
- Historical files under `runs/` and `artifacts/perf/` remain byte-compatible. New writes use a new directory layout rather than rewriting old reports.
- Chunk size, overflow behavior, and the address of a case/repetition are specified with tests before a dashboard reader uses them.
- Threshold edits still evaluate the metrics stored for that run. They do not revive an older pass/fail decision.

## 4. Human task baselines

Depends on a stored case identity from the current reports. It does not depend on the chunk format, but the baseline record has to be addressable once that format exists. It must stay distinct from `evallol-human-review-1` rows.

Acceptance:

- A baseline file records the task, the intent, the person or role being measured, the outcome, the clock interval, and the case id. Reviewer-label agreement is a different file and a different metric.
- A comparison states the matching key. At minimum that key is intent, case identity, and revision. Unmatched rows stay unmatched and are excluded from the delta, with a count of how many were excluded.
- The report shows the human outcome and the model outcome side by side. It does not average them into one accuracy number.
- Dashboard copy that currently says a human baseline is still needed remains accurate until a real baseline file is loaded. Loading reviewer labels must not flip that sentence.

## 5. Production feedback intake

Depends on item 3 for stable case addresses, and on item 4 when the feedback is about human-handled work. No production traffic is connected in this repository today.

Acceptance, written before any importer:

- Each record has an owner, a sampling rule, a privacy rule for retained prompts and answers, and a statement of which traffic distribution it represents. A hand-built regression suite is marked as such and is not reweighted as if it were production.
- A record can point at an investigation and at a regression case. Closing the investigation is a separate edit from creating the case.
- Rows used to tune a judge or a prompt cannot be copied into a holdout split by the importer. The holdout flag is an input from the curator.
- The tool does not open a network connection to a customer system as part of the default `npm test` or `npm run citywheels` path.

## 6. Qualification workflow

Depends on items 4 and the existing calibration result. The calibration result already has an `eligible` boolean. That boolean is a measurement under configured thresholds. It is not an approval.

Acceptance:

- An approval record stores the person, the intent, the candidate revision, the rubric revision, the dataset version, the proposed tier, the evidence ids they reviewed, and the decision. The software has no code path that fills the decision in from `report.passed` or `calibration.eligible`.
- The dashboard can show "eligible under the configured rule" and "no approval recorded" at the same time. The simulation control that keeps human approval unrecorded stays unrecorded.
- Export of an approval is an explicit action by a named person. Reload does not invent one.
- Nothing in this repository changes a production policy, token, or route when an approval is saved.

## What stays deferred

The runner job-array candidate and the chunked column layout stay deferred until item 1, and item 3's acceptance, say they are worth building. No memoization cache is part of either design. The kernel numbers already measured, including the 7.01× summary-plus-gates median on the 20,000-trial synthetic workload, are not a reason to start the unranked work.
