# Calibration rewrite verification

Date: 2026-11-02. Implemented in `src/calibration.ts`.

The rewrite replaces copied growing row groups and repeated Boolean-array projections with
a flat numeric counter buffer. String intent/rubric keys resolve to integer group slots.
Each resolved evidence row is appended once. Validation, result shape, group/evidence order,
class support, agreement, kappa, eligibility and unresolved-label semantics are preserved.
The public `agreement(boolean[], boolean[])` API is unchanged. No cache was introduced.

## Correctness

`npm test`: 44 tests pass. `test/calibration.test.ts` compares the new implementation with
the frozen previous implementation in `test/fixtures/calibration-reference.ts`: exhaustive
human/judge/adjudication combinations, threshold boundaries and 300 deterministic randomized
datasets cover skew, rare and interleaved groups, unusual IDs, degenerate kappa and unresolved
labels. Input data and judge identity are preserved. Validation failures match the reference.
Existing dashboard-script and CLI calibration tests pass without new embedding dependencies.

Every output digest in `baseline.json` matches the corresponding original baseline digest.
This includes all 12 scenarios, though only the calibration kernel changed. The original
baseline remains in `../data-oriented-baseline/`.

## Same-process latency comparison

```sh
npm run build
node scripts/benchmark-calibration.mjs artifacts/perf/data-oriented-calibration
```

`paired-calibration.json` records raw timings and dispersion. Both implementations run in
the same process, alternate execution order, receive identical inputs and warm up before
20 measured batches. Small inputs are batched to reduce timer overhead; reported times are
per call. Large cases are one call per sample. No forced GC, affinity or power changes.
Shared-host noise remains, and these are synthetic local-kernel measurements rather than
production or inference latency claims.

| Workload | Before median ms | After median ms | Median speedup |
|---|---:|---:|---:|
| 1 row / 1 group | 0.00145 | 0.00098 | 1.48× |
| 26 rows / 1 group | 0.01783 | 0.01345 | 1.33× |
| 1,000 rows / 1 group | 1.51888 | 0.57833 | 2.63× |
| 10,000 rows / 1 group | 62.45037 | 4.15192 | 15.04× |
| 10,000 rows / 32 groups | 7.42196 | 3.99938 | 1.86× |
| 10,000 rows / 1,000 groups | 5.16838 | 3.97171 | 1.30× |

The large benefit is concentrated in skewed groups, as predicted by removal of quadratic
group copying. Do not generalize the 15× result to every dataset or total evaluation time.
Tiny timings have limited confidence; they show no observed small-input median regression.

## Allocation profile

```sh
node scripts/profile-evidence.mjs artifacts/perf/data-oriented-calibration
```

The original and new allocation profiles use the same 65,536-byte sampling interval and
10 calls on the same 10,000-row, single-group scenario, including collected objects.
Estimated cumulative allocation falls from 10,117,963,280 to 51,008,016 bytes (about 99.5%).
These are statistical estimates of allocation churn across ten calls, not exact allocation
counts, retained heap size, peak RSS or a 99.5% reduction in application memory usage.

CPU profiles, heap profiles, scenario timings and source fingerprints are retained here.
The original fingerprint has the old calibration source hash; the new one has the rewritten
source hash. Other profiled source hashes are identical. The profile harness repeats all
scenarios to preserve the same measurement procedure; unrelated timing fluctuations are not
claimed as improvements.

## Scope and next measured change

This completes the first algorithmic step from `docs/data-oriented-evals.md`. It does not
convert the complete engine to typed columns or introduce packed indexes, caches or a new
storage format. The next ranked change is relation endpoint indexing, with differential
coverage for shuffled trials, matching repetitions and relation-order effects before timing.
