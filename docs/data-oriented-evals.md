# Data-oriented evaluation engine: completed kernel rewrite and roadmap

Date: 2026-11-02. Status: all four measured kernel targets implemented and verified. Broader evidence storage
and production-feedback features remain proposals. The original measured baseline is preserved.
The measurement harness is `scripts/profile-evidence.mjs`. Raw evidence and output digests
are in `artifacts/perf/data-oriented-baseline/`.

## Implemented first step

Calibration now resolves external group keys to integer slots, accumulates statistics in a
flat numeric counter buffer, and appends each resolved evidence row once. The repeated
growing-array copies and Boolean projections are gone. The public output and validation
contracts remain unchanged. All 44 tests pass, including differential comparison against the
frozen old implementation on exhaustive labels and 300 randomized datasets.

A same-process paired benchmark measures 62.45 → 4.15 ms median (15.04×) for a synthetic
10,000-row single-group input; 32-group and 1,000-group inputs improve by 1.86× and 1.30×.
Sampled allocation churn in the skewed scenario falls about 99.5%; this is not a peak-memory
claim. See the [rewrite evidence](../artifacts/perf/data-oriented-calibration/README.md) for
raw results, reproduction and limitations. Relation indexing is also implemented below.

## Implemented second step

Relations now use integer case slots and flat typed-array row ranges. Original target
traversal order is preserved; separately sorted source ranges match shuffled and sparse
repetitions without a dense cases × repetitions matrix. Duplicate source keys still use the
last input row. All 49 tests pass, including 400 randomized relation-graph comparisons with
the frozen old implementation. A fresh CityWheels baseline passes all 26 cases and its
injected regression is detected.

In the latest paired synthetic benchmark, 5,000 shuffled trials / 2,500 relations improve
from 74.11 to 1.78 ms median (41.65×). The 26-trial case improves about 1.65×; one pair is
essentially unchanged. See the [relation evidence](../artifacts/perf/data-oriented-relations/README.md)
for both paired runs, profiles, output parity, reproduction and variance limits. Summary
aggregation and gate reuse are also implemented below.

## Completed aggregation and gate rewrite

Summary/check/slice statistics now use flat numeric counters, sparse numeric memberships and
reusable bitsets for unique-case support. Exact p95, unknown values, float accumulation order
and existing report fields are preserved. The runner finalizes metrics once, then evaluates
gates from those metrics; standalone gate calls still read their supplied current rows.

All 53 tests pass, including 400 randomized aggregation datasets compared against the frozen
old implementation. All 12 profiling-scenario output digests match the original baseline.
A fresh CityWheels run passes 26 cases and detects the injected regression. On the paired
20,000-trial synthetic workload, summary plus gates improves from 69.52 to 9.92 ms median
(7.01×); the 26-trial combined path improves about 2.9×. Sampled summary allocation churn
falls about 86.8%, which is not a peak-memory claim.

The [final engine verification report](../artifacts/perf/data-oriented-aggregation/README.md)
contains raw results, reproduction, source fingerprints, compatibility evidence and limits.
This completes the four ranked kernel targets. The larger product design below remains a
roadmap; no production feedback system, deployment authority or new evidence-store format
is claimed as implemented. The runner job-array candidate is unranked and deferred until a
whole-run profile establishes its priority.

## The larger objective

Make evalLOL an evidence engine for choosing a model revision for a particular business
intent, with comparable human performance, calibrated scoring, cost coverage and traceable
failure cases. A single overall accuracy number cannot answer that decision.

The design combines per-intent qualification, human baselines, independent judge calibration,
asymmetric mistake costs and distinct autonomy tiers. Evaluation remains separate from
policy enforcement and transaction execution. The design below is an evalLOL proposal
based on the current source. No `as_ask_db` production dataset or
trace was present in the supplied material or the inspected project docs/integration files.

The important product unit becomes a versioned decision row:

```text
intent × candidate revision × rubric revision × dataset version × proposed tier
    human performance + calibrated judge evidence + deterministic failures
    sample support + uncertainty + mistake costs + execution cost coverage
    → eligible / ineligible / insufficient evidence, with source case references
```

Keep review decisions separate from mechanical eligibility. A passing eval must never
silently mutate production permissions. Production feedback should supply new development
cases, error categories and changed policies. Exam holdouts need independent curation and
versioning; do not silently move feedback used for tuning into the final exam.

## What the source and measurements establish

These are warm, synthetic, in-memory workloads on Node 26.8.1 / Apple M1. Each scenario has
three warmups and 20 measured iterations. Fixture generation, digest verification and file
writes are excluded from latency timings. The latency field inside a fixture is synthetic;
it is not a measured target response time. CPU/memory counters include verification and
setup. No network, target, LLM, report serialization or browser was timed.

| Priority | Profiled baseline location | Evidence of wasted work | First change |
|---|---|---|---|
| 1 (implemented) | `test/fixtures/calibration-reference.ts:49` | A group is copied on every appended row: O(sum of squared group sizes). Single-group skew is deliberately tested. CPU and allocation profiles implicate calibration; the allocation sampler estimates substantial transient churn. | Accumulate label contingency counts per intent/rubric; append resolved evidence once. Do not repeatedly construct Boolean projection arrays. |
| 2 (implemented) | `test/fixtures/relations-reference.ts:25` | Every relation filters every result, O(relations × trials), before applying the relation. CPU profile attributes a large fraction of sampled time to that filter. | Compile source/target case IDs to row ranges or row indexes once per run; directly traverse matching repetitions. |
| 3 (implemented) | `test/fixtures/statistics-reference.ts:50` | Each check ID rescans all trial checks. Intent and tag slices also rescan trials. | Update numeric accumulators in one pass, using integer IDs; finalize each slice once. |
| 4 (implemented) | `test/fixtures/statistics-reference.ts:72` | Each gate filters and re-summarizes its trials. Mistake costs are recomputed inside the loop over gate metrics. | Finalized slice statistics and cost totals feed gate predicates directly. Retain empty-slice and unknown-value behavior. |
| Unranked | `src/runner.ts:36` | An object is allocated for every case/repetition job before execution. This was inspected but not profiled. | Candidate: derive case slot and repetition from a cursor; measure the complete runner before prioritizing it. |

The ranking weights allocation/scaling risk; the four kernels were profiled independently,
so their times must not be interpreted as fractions of production run time. See the
[baseline report](../artifacts/perf/data-oriented-baseline/README.md) for measured values,
scaling ratios, confidence limits and the hypothesis ledger.

## Representation designed around the operations

Keep readable JSON suites and SDK observations at the boundary. Validate them, then compile
an immutable run plan. Use string-to-ID dictionaries at ingestion, where external identity
must be resolved. Numeric kernels operate on flat arrays and row indexes thereafter.
An input dictionary is not a memoization cache.

A proposed internal layout, not an existing public API:

```text
Case table
  externalId[]; inputRef[]; intentId: Uint32Array
  tagOffsets: Uint32Array; tagIds: Uint32Array

Trial table (bounded chunks)
  caseSlot: Uint32Array; repetition: Uint16Array
  status: Uint8Array; latencyMs: Float64Array
  costValue: Float64Array; costPresent: bitset
  predictedIntentId: Uint32Array; predictionPresent: bitset
  checkOffsets: Uint32Array; evidenceRef: Uint32Array

Check table
  checkId: Uint32Array; status: Uint8Array; severity: Uint8Array
  score: Float64Array; scorePresent: bitset; reasonRef: Uint32Array

Evidence store
  inputs, answers, retrieved passages, tool traces, reasons
  addressed by chunk + row reference; loaded for inspection
```

The runtime is a hybrid: structures of arrays for scans, ordinary objects/strings for
variable-sized evidence and boundary APIs. Indexes refer to immutable slots, never to
addresses exposed by the JS heap. Preserve original external IDs in every exported report.

For runner-owned dense trials, `trialSlot = caseSlot * repetitions + repetition` can avoid
compound string keys. Imported reports cannot assume this order: validate their identities
and build an explicit slot mapping. A filtered suite needs its own local case-slot mapping.
Preserve traversal order for relations that consume effects of earlier relations.

Start with contiguous count arrays for slice/check aggregates. Use a dense confusion matrix
only when the intent cardinality fits a declared memory budget. At high cardinality, use
sorted `(actualId, predictedId)` pairs with row offsets. Arbitrarily large dense matrices
would replace a CPU problem with a memory problem. Group calibration rows by a compiled
intent/rubric ID and accumulate a 2×2 label contingency table, unresolved counts, class
support and false-positive/negative counts directly.

One pass can update overall, intent, check and each assigned tag. Expected work becomes
O(trials + checks + tag memberships), plus quantile work and evidence output. Preserve the
exact nearest-rank p95: collect latencies per slice, then sort or use a measured exact
selection algorithm. Do not substitute an approximate sketch without a separately versioned
metric contract. Independent sample support still counts unique cases whose every repeat
passed, not trial count.

## Which of the suggested techniques fit

| Technique | Application here | Constraint |
|---|---|---|
| Flat arrays instead of hash tables | Numeric accumulators, compiled trial/relation references, check memberships. | Keep boundary dictionaries for arbitrary string identities. Removing those without replacing identity resolution would change semantics. |
| Integer indexes instead of pointers | Case/trial/check/evidence references within immutable chunks. | Range-check at ingestion and publication; distinguish chunk-local from durable IDs. |
| Pack common data into upper index bits | Defer until profiling shows a benefit over separate status/flag arrays. | A 24-bit row plus 8-bit flags limits a chunk to 16,777,216 rows. JS bitwise operators use 32-bit values; unsigned decoding and overflow checks are mandatory. Persist explicit fields, not undocumented packed handles. |
| Structure of arrays | Status, latency, cost, classification and check-score scans. | Do not split bulky text into numeric columns just to call the design columnar. Measure small-suite overhead too. |
| Inline/stack lists | Pre-sized typed buffers or bounded per-worker scratch can replace per-job/list churn. | TypeScript has no guaranteed stack-allocated SmallVec equivalent; do not claim that JS arrays or typed arrays live on the stack. |
| Bitsets | Known/present flags and all-repetitions-passed membership. | Status has multiple values, so use an enum, not a Boolean. Missing, unresolved, skipped and zero must stay distinct. |
| No caches | Compute aggregates from the current evidence batch once, then emit them with that artifact. | No calculation memoization cache was identified in the evaluation kernels. Retained evidence, compiled plans and UI disclosure state have different responsibilities. No calculation cache was introduced; each analysis builds fresh accumulators. |

Use a proposed bounded chunk size (for example, 65,536 trials) for a prototype, then measure
its throughput/memory tradeoff. Reject or split inputs before count/offset overflow. Choose
an explicit accumulator width; a Uint32 counter cannot represent more than 2^32−1 events.
Keep existing numeric cost semantics in a compatibility rewrite. Any later migration to
fixed-point money needs versioned currency/scale and overflow rules rather than silent
rounding in a faster storage format.

## Evidence storage and production feedback

The dashboard currently discovers runs by parsing retained reports. A future writer should
publish small per-run manifests containing identity, revision compatibility and finalized
aggregates; full evidence lives in separately addressed chunks. Publish completion metadata
last so readers cannot mistake a partial run for a finished one. Keep historical JSON report
import/export while introducing this storage format. Manifests are retained run outputs;
threshold changes evaluate those exact metrics rather than returning an old decision.
This is an unmeasured I/O design proposal, not a demonstrated current bottleneck.

Add distinct, linked records for observed human task outcomes, reviewer labels, adjudicated
gold, judge predictions and model outcomes. Reviewer agreement is not human task performance.
A label's Boolean value is cheap; its provenance is essential: source case, sampling method,
split, rubric, scorer identity, adjudication and timestamps must survive the compact format.

Production analysis should be able to ask which intent caused the most measured harm,
which error cells are unpriced, which rare intents lack evidence, and which revision reduced
cost without worsening critical outcomes. Separate measured task cost from classification
mistake estimates. Compare matched cases, windows and revisions; shadow/assist/transact
outcomes have different selection and human-intervention effects. Traffic reweighting needs
an explicit production distribution and uncertainty; a hand-picked regression suite is not
that distribution. A feedback record needs a route to an owned investigation and a linked
regression case, so the workflow can close the business loop.

## Implementation sequence and gates

1. Freeze correctness evidence before changing representation. Compare old/new summaries,
   calibration slices, gates and relation effects on the same fixtures and randomized inputs.
   Include arbitrary IDs, shuffled imports, repeated cases, missing costs/predictions/scores,
   degenerate kappa, unresolved adjudication, sparse checks and conflicting relation chains.
   Current baseline digests establish repeatability, not independent semantic correctness.
2. Change aggregation/calibration algorithms first. Remove copied growing groups and repeated
   scans. Measure this separately from the typed-array conversion so benefits have attribution.
3. Compile relation endpoints and runner trial indexes. Preserve order, cancellation, plugin
   isolation, coverage validation and the public JSON/SDK behavior.
4. Prototype the hot numeric columns, presence bitsets and bounded chunks; benchmark against
   the simpler accumulator version. Keep them only if whole-operation results justify them.
5. Add durable evidence chunks, manifests and human-baseline/feedback records. Treat artifact
   compatibility and dashboard behavior as explicit migration requirements.

Proposed prototype targets, not adopted production SLOs: unchanged evaluation decisions;
at least 2× median improvement on the measured large kernels; at least 50% less sampled
allocation for skewed calibration; no more than 10% regression on representative small
suites once noise is controlled. Re-run with isolated memory measurement and real
`as_ask_db`/production workload shapes before making production performance claims.
No live-model speedup is established by faster local aggregation.

The initial profiling phase produced the measured hand-off above; all four ranked kernels are now implemented and verified. There is no basis yet to force bit-packed
handles, stack-allocation claims, a native-language port, or an entire production orchestrator
into the rewrite. The blocked browser acceptance work in `ux-audit.md` remains separate.
