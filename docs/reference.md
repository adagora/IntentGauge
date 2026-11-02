# Suite reference

`schemaVersion:1`, `name`, `version`, and nonempty `cases` are required. Every case requires unique `id`, JSON `input`, `intent`, explicit `split` (`dev`, `test`, `holdout`), and nonempty `assertions`. Optional `tags` enable report slices. Names beginning `__` are reserved for missing/error classification labels.

Targets receive `{id,input}`. Put actor context, conversation inputs and tool fixtures in `input`, never reference answers. Unknown fields at suite/case/assertion/gate level are rejected. `node dist/src/cli.js validate suite.json` validates without executing a target.

## Assertions

Every assertion has `id`, `type`, optional `severity:critical`, and optional `threshold` in `[0,1]` (default 1). For binary checks leave threshold at 1. JSON pointers start with `/`, index arrays with `/0`, and escape `/` as `~1` and `~` as `~0`.

| Type | Configuration / meaning |
|---|---|
| `equals` | `value`, optional `path` (default answer); structural JSON equality |
| `contains`, `notContains` | string `value`, optional `path`; literal case-sensitive substring |
| `range` | numeric `min` and/or `max`, `path`; inclusive bounds |
| `intent` | expected string `value` versus normalized output intent |
| `abstention` | boolean `value` versus output abstained; this checks the reported flag, not answer semantics |
| `retrievalRecall` | nonempty relevant-ID `value` array, optional positive integer `k`; relevant hits / all labeled relevant IDs |
| `retrievalPrecision` | same fields; relevant hits / actual number returned up to k |
| `mrr` | reciprocal rank of first relevant result, or zero |
| `ndcg` | binary relevance DCG / ideal DCG at k; unreturned ideal positions still count |
| `citations` | requires nonempty citations resolving to retrieved IDs; `requireQuotes` defaults true; supplied quotes must occur literally |
| `toolAllowlist` | `value` list of allowed tool names; empty allows no calls; missing trace fails |
| `toolSequence` | `value` ordered subsequence of calls, with repeated names allowed; combine with allowlist for extra-call restrictions |
| `judge` | nonempty `rubric`; score and reason from configured judge |

Retrieved IDs must be unique. An omitted field is missing evidence, while `toolCalls:[]` explicitly records that no tools ran. Text checks support Unicode but do not apply language-specific normalization. Paths can inspect structured application data, source metadata, tool arguments/results, or all recorded chatbot turns.

## Gates

Each gate applies to all results or one `intent`. Every configured threshold must pass. Empty scopes and unknown measurements fail; a misspelled or unsupported metric is a configuration error.

| Gate | Meaning |
|---|---|
| `minCases` | Unique cases, not repeated trials |
| `minPassRate` | Passing trials / all trials |
| `minPassRateLowerBound` | Wilson 95% lower bound over unique cases passing every trial |
| `minPrecision`, `minRecall` | Classification metrics; require explicit intent |
| `maxCriticalFailures` | Non-passing critical checks; critical failures always block regardless of this ceiling |
| `maxErrorRate` | Cases with target/evaluator errors / trials; execution errors always block |
| `maxP95LatencyMs` | Nearest-rank p95 target execution latency |
| `maxMeanCost` | Mean target cost; missing cost on any selected trial makes mean unknown |
| `maxMeanMistakeCost` | Mean classification mistake cost; unpriced mistakes make mean unknown |

`mistakeCosts` is `{actualIntent: {predictedIntent: nonnegativeAmount}}`, with required `currency`. Error/missing predictions are `__error__` / `__missing__`. Correct predictions cost zero. Gate thresholds, cost rows, and suite versions must be owned and reviewed by the business using the tool.

## Paired interventions

`relations` contains `{id,source,target,path,type,severity?,tolerance?}`. Types: `unchanged`, `changed`, `nonIncreasing`, `nonDecreasing`. Tolerance is an absolute nonnegative numeric tolerance; directional comparisons require numbers. Other equality comparisons use structural JSON equality. Source/target cases must exist and differ. Select both sides when filtering splits; a dangling relation is rejected.

## Artifacts and comparison

Run output includes SHA-256 of the selected suite, target/judge/evaluator revisions, run options, observations, assertion reasons, per-check mean score with coverage, slices, confusion matrix and gates. Per-check means average scored results only; always inspect score coverage and errors alongside means.

Comparison requires identical suite hashes, run options, judge revisions and custom evaluator revisions, with identical case/repetition coverage. It reports case and individual-check regressions. Any previously passing check becoming non-passing fails comparison, even if its case already failed another check. No significance claim or causal claim is made from a small paired sample.

Target adapters and custom code are trusted. Timeout races abort cooperative I/O; use an external worker process if you need hard termination of arbitrary plugins. Reports are JSON evidence, not signed attestations. Target cost does not include judge cost. Replayed timing measures replay execution, not historical production latency.
