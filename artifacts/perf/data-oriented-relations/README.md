# Relation indexing verification

Date: 2026-11-02. Implemented in `src/relations.ts`.

The old implementation scans every trial for every relation and constructs compound JSON
keys for source lookup. The new implementation resolves external case IDs into integer
slots, groups trial indexes into contiguous typed-array ranges, and pairs matching
repetitions by binary search within a source range. Target ranges retain original input
order. Source ranges are sorted separately; duplicate source keys still resolve to the
last input row. No cache or public API was added.

Index construction uses O(trials + cases) storage. Sparse repetition values do not cause
allocation proportional to the largest repetition or cases × repetitions. Processing avoids
the old relations × trials scan: construction includes per-case repetition sorting, then
only matching target rows and source-range searches are visited. Relation order, check
ordering, error precedence and partial mutation before a missing-pair exception remain intact.

## Correctness and integration

- `npm test`: **49 passed**. Five relation-specific tests compare against the frozen old
  implementation, covering shuffled/sparse repetitions, duplicate sources/targets, partial
  errors, absent targets, empty inputs and 400 deterministic randomized graphs with varied
  values, relation types, tolerances, severities, initial statuses and missing evidence.
- All 12 profiling-scenario output digests match the original pre-optimization baseline.
- `npm run citywheels`: **26 baseline cases passed**, injected regression detected. Evidence
  is retained in `runs/citywheels-2026-11-02T16-58-37-999Z/` and its injected-regression sibling.
  This uses the actual offline agent loop with the fake provider; no live LLM was called.

## Reproduce

```sh
npm run build
node scripts/benchmark-relations.mjs artifacts/perf/data-oriented-relations
node scripts/profile-evidence.mjs artifacts/perf/data-oriented-relations
```

Choose a different output directory to preserve results. The paired benchmark includes
index construction and check emission, with preparation and full output verification outside
the timing window. Both implementations receive fresh check/status arrays on every call,
identical deterministically shuffled rows, three warmup batches and 20 measured batches,
alternating order in the same process. Full mutated outputs are compared outside the timer.
Raw samples, dispersion, source hashes, Node version and batch sizes are recorded in
`paired-relations.json`. Independent CPU/allocation profiles and source fingerprints are
retained in the other artifacts here. The baseline directory remains unchanged.

## Paired timing results

| Workload | Trials | Relations | Before median ms | After median ms | Median speedup |
|---|---:|---:|---:|---:|---:|
| one-pair | 2 | 1 | 0.001107 | 0.001129 | 0.98× |
| small-26 | 26 | 13 | 0.014127 | 0.008561 | 1.65× |
| trials-1000 | 1000 | 500 | 3.346083 | 0.336750 | 9.94× |
| trials-5000 | 5000 | 2500 | 74.114958 | 1.779667 | 41.65× |
| repeats-10 | 5000 | 250 | 10.509000 | 1.824125 | 5.76× |
| sparse-repeats | 3000 | 500 | 10.408959 | 1.094250 | 9.51× |
| one-relation | 5000 | 1 | 0.707708 | 0.290291 | 2.44× |
| no-relations | 5000 | 0 | 0.767875 | 0.000084 | No-op fast path |

The latest paired run shows about 42× improvement in the dense-relation 5,000-trial
scenario. The initial run showed about 47×; it is retained as `paired-relations-initial.json`.
Tiny batches were increased from 100 to 1,000 calls for one pair and 20 to 200 calls for
26 trials because their sub-millisecond batch timings had high variance. Both full paired
runs are retained; no implementation change occurred between them. The one-pair case is
essentially unchanged (about 2% slower median in the latest run); the 26-trial case improves
about 1.65×. Do not apply the dense-relation speedup to every evaluation workload.

The unpaired profiling harness uses its original ordered input, rather than the shuffled
paired workload. It records 1.61 ms median for 5,000 trials versus 63.11 ms in the original
baseline. These runs were captured at different times; the paired result is the primary
latency comparison. Allocation samples estimate 47,060,672 bytes across ten relation calls,
versus 58,267,336 in the original profile, including fixture preparation and collected
objects. This is noisy allocation-churn evidence, not a peak-memory guarantee.

These are shared-host synthetic local-kernel measurements. No affinity, power changes or
forced GC were used. GC and competing work affect dispersion, particularly after the
kernel becomes very short. Twenty samples do not establish reliable P99 tails. The no-op
fast path is close to timer resolution; its numerical speedup is not meaningful. No
production or live-model latency improvement is claimed.

## Remaining engine work

Calibration and relation indexing are implemented. Summary/check aggregation and gate
reuse remain the next ranked kernels: their current repeated scans are visible in the
retained profiles. Typed-column evidence storage, production feedback and qualification
records remain separate proposed work in `docs/data-oriented-evals.md`.
