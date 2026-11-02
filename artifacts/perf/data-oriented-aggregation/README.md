# Completed measured engine rewrite: aggregation and gates

Date: 2026-11-02. All four ranked kernel targets are implemented: calibration,
relation indexing, summary aggregation and gate evaluation. This report records the last
two targets and final verification. The broader production-feedback/storage proposals in
`docs/data-oriented-evals.md` remain roadmap work, not claims made by this performance change.

## Implementation

`src/statistics.ts` now accumulates trial, intent, tag and check statistics in flat numeric
buffers. External names resolve to integer scope/check slots. Numeric linked trial indexes
and sparse trial/scope memberships reconcile unique-case support in a separate pass using
two reusable bitsets. Their size depends on scope count, not cases × scopes. A case must
pass every repetition in a particular slice to count as a Wilson-bound success.

Checks are visited once per trial, and duplicate imported tags do not count a trial twice.
Classification totals are accumulated without a repeated scan of the confusion matrix for
every label. The confusion matrix remains sparse. Costs and scores are accumulated in the
original input order to preserve floating-point output. Latencies are sorted exactly once
per slice using the existing nearest-rank p95 definition; no approximate quantile is used.

`src/runner.ts` calls `summarizeAndCheckGates`, which finalizes one batch and evaluates gates
from its scalar statistics and cost totals. The original `summarize`, `slice`, `mistakeCost`
and `checkGates` interfaces remain available. Standalone `checkGates` analyzes the supplied
current rows, even when the caller supplies stale summary slices; it uses that summary's
classification fields as before. Empty/single-row paths avoid unnecessary support indexing.
No cross-call cache, packed handle, runtime dependency or report-schema change was introduced.

## Correctness and integration

`npm run verify`: **53 tests pass, 0 failures**; full output is in `verify.log`. The suite
includes frozen pre-rewrite references for all three rewritten modules:

- 300 deterministic randomized calibration datasets, exhaustive labels/adjudication and
  threshold boundaries; existing browser-script embedding and CLI behavior remain covered.
- 400 deterministic randomized relation graphs, plus shuffled/sparse repetitions, duplicate
  sources/targets, order, partial mutation and missing-pair errors.
- 400 deterministic randomized aggregation datasets comparing every summary field, JSON
  property ordering, standalone slices/costs, standalone gates and the combined API.
  Explicit cases cover bit positions across word boundaries, per-slice unique support,
  duplicate tags/checks, empty slices, numeric/prototype-like names, unknown/zero costs and
  scores, signed zero, absent predictions, exact p95 and stale supplied summary slices.

Every output digest in the 12-scenario profiling harness matches the original baseline.
Frozen reference source checksums match the original source fingerprints; current benchmark
and profile fingerprints match the implemented source. The tests compare independent old
algorithms with the new representations, rather than asserting only internal buffer layout.

`npm run citywheels`: **26 baseline cases pass; injected regression detected**. Full command
output is in `citywheels.log`; retained reports and dashboards are in
`runs/citywheels-2026-11-02T17-17-49-425Z/` and its `-injected-regression` sibling. This runs
the actual offline agent loop with a fake provider. No live LLM was called.

## Paired timing results

Same-process comparisons use the frozen original statistics module, identical resident
inputs, alternating execution order, three warmup batches and 20 measured batches. Small
inputs are batched. Index/accumulator construction, sparse memberships and exact percentile
sorting are timed; fixture construction and complete output verification are outside the
timer. The combined phase measures the path now used by the runner, versus the original
summary followed by gate evaluation. Raw samples and dispersion are in `paired-statistics.json`.

| Workload | Phase | Trials | Before median ms | After median ms | Median speedup |
|---|---|---:|---:|---:|---:|
| one-row | summary | 1 | 0.002970 | 0.001806 | 1.64× |
| one-row | gates | 1 | 0.000544 | 0.000369 | 1.48× |
| one-row | combined | 1 | 0.002978 | 0.001933 | 1.54× |
| small-26 | summary | 26 | 0.031385 | 0.011246 | 2.79× |
| small-26 | gates | 26 | 0.006148 | 0.006157 | 1.00× |
| small-26 | combined | 26 | 0.036508 | 0.012554 | 2.91× |
| medium | summary | 2000 | 3.217084 | 0.735375 | 4.37× |
| medium | gates | 2000 | 0.602792 | 0.317125 | 1.90× |
| medium | combined | 2000 | 3.760083 | 0.755250 | 4.98× |
| large | summary | 20000 | 56.064750 | 9.910167 | 5.66× |
| large | gates | 20000 | 11.149458 | 4.262125 | 2.62× |
| large | combined | 20000 | 69.517542 | 9.917250 | 7.01× |
| many-intents | summary | 8000 | 27.854708 | 3.413542 | 8.16× |
| many-intents | gates | 8000 | 9.763958 | 1.117583 | 8.74× |
| many-intents | combined | 8000 | 38.077958 | 3.663042 | 10.40× |
| many-checks | summary | 4000 | 104.932125 | 4.587916 | 22.87× |
| many-checks | gates | 4000 | 3.036959 | 1.571833 | 1.93× |
| many-checks | combined | 4000 | 107.881083 | 4.548750 | 23.72× |

The primary 20,000-trial workload improves about 5.7× for summaries, 2.6× for standalone
gates and 7.0× for the combined path. With 64 checks per trial, combined processing improves
about 24×. The 26-trial combined path improves about 2.9×; its standalone gate median is
essentially unchanged (about 0.14% slower). No small-workload median regresses by 10% in this
run. These are workload-specific local-kernel results, not end-to-end production or live-model
speedups. Do not multiply the separate kernel speedups into an overall speedup.

Intermediate measurements are preserved in `../data-oriented-aggregation-initial/` and
`../data-oriented-aggregation-basecase/`. They identified a tiny standalone single-row gate
regression, which was removed by the final direct single-row path. Both that path and the
multi-row bitset path are checked against the original implementation. Final measurements
and fingerprints live in this directory; the intermediate directories are diagnostic records.

## Allocation evidence and limits

At a 65,536-byte allocation-sampling interval, ten calls on the 20,000-trial summary scenario
estimate 117,103,344 cumulative allocated bytes versus 888,357,984 in the original baseline,
about 86.8% less allocation churn. Samples include collected objects. This is not an exact
allocation count, peak-RSS measurement or claim of 86.8% lower application memory usage.
CPU profiles, allocation profiles, source fingerprints and the original 12 scenario timings
are retained alongside this report.

This is a shared Apple M1 developer host running Node 26.8.1. No forced GC, affinity, power
or kernel changes were used. GC and competing processes affect dispersion. Twenty samples
cannot establish reliable P99 tails; raw p95 and variation are available, but no production
latency SLO is established. Small sub-microsecond differences should be treated as noise.

## Reproduce

```sh
npm run verify
node scripts/benchmark-statistics.mjs artifacts/perf/my-statistics-run
node scripts/profile-evidence.mjs artifacts/perf/my-kernel-run
npm run citywheels
```

Use a new directory to preserve previous evidence. The historical before implementations
are test fixtures compiled by the normal build, not production dependencies. The original
baseline remains in `../data-oriented-baseline/`; prior calibration and relation reports
remain in their respective directories. No browser/assistive-technology verification is
implied by the offline engine checks; the UX audit's manual acceptance limits still apply.
