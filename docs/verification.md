# Verification record

The tool is verified with synthetic fixtures and automated behavioral tests. The cases are demonstration artifacts, not human-reviewed production gold data.

## Review rounds

1. **Goal and architecture:** framework-independent TypeScript contracts and configurable business assertions cover RAG and agents. Repeated tool names were incorrectly rejected in ordered sequences; fixed and regression-tested.
2. **Measurement:** unique-case confidence, missing cost coverage, asymmetric mistakes and per-intent calibration were reviewed. Positive-only calibration could accept an always-yes judge; fixed by requiring both gold classes and preserving judge/dataset revisions.
3. **Isolation and integration:** a judge could mutate answers before later checks; fixed with cloned inputs/observations. Production document-only sources have empty chunk IDs; fallback evidence IDs added. Truncated source previews are marked and insufficient quote evidence is an error.
4. **Acceptance:** added adapter-level multi-turn and repetition isolation tests, late-verification checks, failing intervention examples, custom evaluator revision identity and artifact comparison checks.

## Commands

`npm test` builds strict TypeScript and runs tests for deterministic metric formulas, suite rejection, target isolation, bounded concurrency, cancellation, judge failure handling, gates, statistics, intervention relations, calibration, comparison, HTML escaping, SSE parsing, adapter request/response contracts and CLI artifact/exit behavior.

`npm run demo` creates a readable RAG report. Agent and paired-intervention examples are also executed by the integration suite, along with deliberately failing candidate outputs.

## Environment limits

This execution environment blocks registry DNS and loopback server sockets. Development dependencies were copied from an existing local installation (`typescript 5.9.3`, `@types/node 20.19.43`, and `undici-types`); lock entries came from that installation's lockfile. A clean online `npm ci` was not exercised here.

HTTP request/response behavior is tested using mocked fetch transport and real RequestInit/Response objects. SSE parsing is tested with byte-by-byte UTF-8 and CRLF chunks. Live network connectivity, a real model judge, and a production chatbot run have not been verified. No production conversations or paid API calls were made.

## Observation dashboard

Dashboard tests check report discovery after a new saved run, partial-artifact handling,
omission of raw case inputs/answers, and browser-script calculations in an isolated JavaScript
context. These cover the article's initial error cost, precision/recall denominators, threshold
changes, simulated arrivals, and zero denominators. They do not constitute browser layout QA.
The local server could not be started in the restricted development environment (loopback
`listen EPERM`), and browser file navigation was blocked. Live HTTP polling and desktop/mobile
visual inspection remain to be verified in an unrestricted local environment.

The qualification-line controls are covered by offline JavaScript checks: an injected
assistance misroute increases classification loss by $25,000; replay/scrubbing does not
change counters; reset discards the previous case; recorded mode hides the moving marker
and keeps human approval unrecorded. The snapshot test also verifies projected per-case
check status while excluding free-text reasons. Industrial layout and motion still need
visual inspection in a browser; the environment limitations above remain applicable.

## Focused project views

The project report now opens with a concise Overview; Cases, Human scoring, Classification,
and Workflow are separate views. Offline tests verify navigation, safe rendering of case
text, truthful missing intent telemetry, no network polling, calibration-file calculations
using the CLI/SDK implementation, invalid-data clearing, perfect/chance/undefined kappa,
and empty human-scoring state before import. `npm run citywheels:check` was executed against
the actual offline agent: all 26 trials passed. Browser visual QA remains unverified under
the previously documented environment restrictions; three-second comprehension is a design
target, not a measured usability result.


## UX audit follow-up (2026-11-02)

`npm test`: 41 tests passed. Additional behavioral tests in `test/dashboard.test.ts` cover
calibration state synchronization, immediate threshold recalculation, invalid-state clearing,
file-read ordering/cancellation, missing-class and unresolved-case explanations, reviewer
packet text round-trips (including `</script>`), mismatched/duplicate review rejection,
third-reviewer adjudication, worksheet label export/import/adjudicated-export round-trips,
development-only export, stale-review invalidation, reviewer-read ordering/cancellation, comparisons,
focus calls/history state, and default/list/demo/full-report routing. Routes are exercised
through the handler without opening a socket. VM document stand-ins do not prove browser
rendering, downloads, actual focus behavior, or assistive-technology announcements.

`npm run citywheels`: 26 baseline trials passed; the deliberately corrupted candidate was
blocked by comparison. Fresh evidence is in
`runs/citywheels-2026-11-02T16-30-57-090Z/` and its `-injected-regression` sibling.
No live LLM calls occurred.

Browser verification was attempted again: binding `127.0.0.1:4317` returned `listen EPERM`;
opening a saved `file:` dashboard was rejected by browser URL policy. No workaround was
attempted. Desktop/mobile layout, real keyboard/focus and Back/Forward, screen-reader
announcements, browser downloads/file pickers, zoom and three-second comprehension remain
manual verification items. See `docs/ux-audit.md` for the finding-by-finding disposition.


## Calibration counter rewrite (2026-11-02)

`npm test`: 44 tests passed. The new calibration implementation is compared with a frozen
pre-rewrite reference using exhaustive labels/adjudication combinations, threshold boundaries,
300 deterministic randomized datasets, missing adjudications, degenerate kappa, unusual
external IDs, output order and validation failures. Existing dashboard embedding and CLI
calibration tests pass. All 12 profiling-scenario output digests match the original baseline.

Paired same-process calibration measurements and sampled allocation profiles are recorded in
`artifacts/perf/data-oriented-calibration/README.md`. The synthetic single-group 10,000-row
case improves from 62.45 to 4.15 ms median; the benefit is smaller when rows occupy many
groups. Sampled allocation churn falls about 99.5% in that skewed scenario. Neither result
establishes production/inference speedup or peak-memory savings. No cache was added.


## Relation indexing rewrite (2026-11-02)

`npm test`: 49 tests passed. Five relation-specific tests exercise shuffled/sparse repetitions,
last-duplicate source lookup, all duplicate targets, original traversal/check order, error
precedence, missing-pair exceptions and partial mutation, absent targets and empty inputs.
The indexed implementation matches a frozen pre-rewrite reference on 400 deterministic
randomized graphs. All 12 profiling-scenario output digests match the original baseline.

`npm run citywheels`: all 26 baseline cases passed; the injected regression was detected.
Fresh artifacts are in `runs/citywheels-2026-11-02T16-58-37-999Z/` and its injected-regression
sibling. This exercises the offline provider without live LLM calls.

`artifacts/perf/data-oriented-relations/README.md` retains two same-process paired benchmark
runs and CPU/allocation evidence. The latest dense-relation 5,000-trial synthetic workload
improves from 74.11 to 1.78 ms median; the 26-trial case improves 1.65×, while one pair is
essentially unchanged. These local-kernel results do not establish production/inference
speedups or reliable P99 behavior. No application cache was added.


## Completed measured engine rewrite (2026-11-02)

`npm run verify`: 53 tests passed. Four statistics tests compare full summaries, exact JSON
ordering, slices, cost coverage, gate results and the combined summary/gate path with a
frozen original implementation. They include 400 deterministic randomized datasets and
explicit bitset word boundaries, variable per-case slice membership, repeated IDs, duplicate
tags/checks, signed zero, missing prices/predictions/scores, exact p95 and stale supplied
summary slices. Together with the calibration and relation tests, 1,100 randomized datasets
or graphs are compared against the old algorithms. All 12 profiling output digests match
the original baseline. Raw final test output is retained in
`artifacts/perf/data-oriented-aggregation/verify.log`.

`npm run citywheels`: 26 baseline cases passed; the injected regression was detected. Fresh
reports are in `runs/citywheels-2026-11-02T17-17-49-425Z/` and its injected-regression sibling.
The fake provider exercises the real offline agent loop without live LLM calls.

All four ranked kernel targets are implemented. Paired measurements, CPU/allocation profiles,
source fingerprints and reproduction commands are in
`artifacts/perf/data-oriented-aggregation/README.md`. On the 20,000-trial synthetic workload,
summary plus gates improves 69.52 → 9.92 ms median (about 7×); the 26-trial combined path
improves about 2.9×. Sampled summary allocation churn falls about 86.8%. These measurements
do not establish production/inference speedups, peak-memory savings or reliable tail SLOs.
The broader evidence-store and production-feedback roadmap remains unimplemented, and the
UX audit's browser/manual acceptance checks remain unverified under the documented restrictions.
