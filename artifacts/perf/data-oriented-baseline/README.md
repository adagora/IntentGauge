# IntentGauge offline kernel baseline

Reproduce from the project root:

```sh
npm run build
node scripts/profile-evidence.mjs artifacts/perf/data-oriented-baseline
```

The command overwrites measurement artifacts in the selected directory. Choose a new output
directory to retain a baseline before comparing an implementation change. These are synthetic
workloads. No application engine code was modified, and no production target was invoked.

## Scenario and interpretation

Summary: 32 intents, 8 tags, 8 checks/trial, two repeats/case. Gates: 32 per-intent gates with
three metrics each; a precomputed summary is supplied. Calibration: all rows in one
intent/rubric, alternating true/false labels with perfect agreement, testing skew rather than
a representative production distribution. Relations: one repetition, half as many relations
as trials, all paired values unchanged. Relation fixture copies are outside baseline timing
but inside CPU/heap profiles. Return values are verified against an SHA-256 digest every
iteration outside the timed section. Inputs are identical across repeat measurements.

Three warmups and 20 timed iterations per scenario; independent CPU sampling uses 20 calls
and heap allocation sampling uses 10 calls. Timings are unprofiled. Fingerprint and source
hashes are in `fingerprint.json`; raw timings, CPU counters, RSS, heap fields and output hashes
are in `baseline.json`. Each `.cpuprofile` and `.heapprofile` is retained for inspection.
Process RSS/high-water is cumulative, not isolated per-kernel memory; sampled allocations
include collected objects and are estimates of churn, not resident memory. I/O, off-CPU,
contention, lock wait, bytes/sec and per-core utilization were not measured. In-process
kernel calls have no meaningful storage byte-throughput denominator. Swap/filesystem/power
state are uncontrolled. No git revision is available because this checkout has no `.git`.

Only 20 samples were taken. P99 and higher in JSON are the observed maximum, not credible
production tail estimates. Shared-host interference and GC affect timings; notably the
large gate scenario has high variance. Do not use these measurements to assert a small
percentage win or to set production SLOs. The evidence supports where to experiment next.

## Timing results

| Scenario | p50 ms | p95 ms | ops/sec (mean) | CV |
|---|---:|---:|---:|---:|
| summary-100 | 0.515 | 0.840 | 1723.5 | 0.347 |
| gates-100 | 0.114 | 0.147 | 8161.9 | 0.108 |
| summary-1000 | 4.112 | 4.385 | 239.6 | 0.027 |
| gates-1000 | 0.949 | 1.083 | 1015.4 | 0.066 |
| summary-10000 | 63.606 | 78.181 | 14.8 | 0.157 |
| gates-10000 | 14.497 | 47.052 | 48.0 | 0.740 |
| calibration-skew-100 | 0.060 | 0.066 | 14705.0 | 0.528 |
| calibration-skew-1000 | 1.140 | 1.442 | 810.1 | 0.141 |
| calibration-skew-10000 | 54.460 | 56.418 | 18.4 | 0.023 |
| relations-100 | 0.092 | 0.100 | 10734.7 | 0.037 |
| relations-1000 | 5.275 | 5.547 | 188.6 | 0.022 |
| relations-5000 | 63.113 | 66.789 | 15.7 | 0.028 |

## Scaling

Ratios describe whole-kernel timings with the fixture shapes above. They mix algorithm cost,
allocation, JIT and GC; they do not independently prove a complexity bound.

| Scenario growth | p50 ratio | p95 ratio |
|---|---:|---:|
| summary-1000 → summary-10000 | 15.47× | 17.83× |
| gates-1000 → gates-10000 | 15.28× | 43.43× |
| calibration-skew-1000 → calibration-skew-10000 | 47.79× | 39.11× |
| relations-1000 → relations-5000 | 11.96× | 12.04× |

## Ranked evidence and hypothesis ledger

Source and timing evidence should be interpreted together. Profile frame line numbers are
zero-based positions in compiled `dist/src/*.js`; source positions are in the proposal.
Inclusive frame times overlap and must not be summed.

| Rank | Hypothesis | Verdict and evidence |
|---|---|---|
| 1 | Skewed calibration spends work copying growing groups | Supported by `src/calibration.ts:47`, `calibration-skew-10000.cpuprofile`, `calibration-skew-10000.heapprofile`, and superlinear measured growth. Allocation estimates are aggregate for 10 calls; not retained bytes. |
| 2 | Relations repeatedly scan all trials | Supported by `src/relations.ts:23`, `relations-5000.cpuprofile` (filter callback), and the 1,000 → 5,000 trial scaling above. |
| 3 | Summary repeatedly scans checks and slices | Supported by `src/statistics.ts:48`, `summary-10000.cpuprofile` and `.heapprofile`; anonymous by-check callback and intent/tag slice frames appear in `hotspots.json`. |
| 4 | Gate work recomputes available statistics | Supported structurally by `src/statistics.ts:70`; `gates-10000.cpuprofile` samples checkGates/slice/filter. Magnitude has low timing confidence because of variance. |
| — | Map lookup itself is the dominant cost | Not established. Profiles and source implicate scanning/copying as higher-priority experiments. No direct Map-versus-array comparison was run. |
| — | Caching is required | Unsupported. No calculation memoization cache was found in these kernels; redesigning traversal is the proposed lever. |
| — | Packed handles / bitsets outperform separate fields | Unmeasured. Benchmark after removing algorithmic waste. |
| — | Serialization or live inference dominates the product | Unmeasured. This baseline cannot rank them. A full-run trace with representative targets is required. |

For each scenario, `hotspots.json` contains ranked inclusive frames and sampled microseconds;
`allocations.json` contains ranked allocation frames. Timing and allocation results make this
a provisional optimization hand-off, not a verified optimization. See
[`docs/data-oriented-evals.md`](../../../docs/data-oriented-evals.md) for the proposed layout,
compatibility constraints, production feedback design and acceptance gates.
