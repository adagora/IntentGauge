# evalLOL design and scope

evalLOL is a local TypeScript evaluation SDK and CLI for RAG pipelines and agents. It executes real functions or HTTP endpoints, or evaluates recorded observations. All integrations share the same observation contract. This permits a Rust service, a Python agent, or a TypeScript RAG pipeline without coupling the core to a framework.

## Grounding

evalLOL evaluates per intent using human-reviewed gold sets, independent judge calibration, cost-weighted classification, and evidence for autonomy decisions. Its reports do not alter a production policy or confer approval. A transaction orchestrator and approval service belong to the system under test.

Local chatbot inspection found exact table-cell checks, document authority, ACL rules, abstention, and multi-turn state to be necessary. Its current implementation, rather than its older README request example, determines the SSE adapter contract. See [chatbot integration](chatbot.md).

## Contracts and rationale

1. Suite → cases → assertions is JSON and explicitly versioned. Strict validation rejects unknown top-level configuration fields so misspelled gates cannot silently pass.
2. A target receives only case ID and input. Reference assertions and relevance labels are withheld to prevent accidental leakage into inference.
3. Observation exposes ranked evidence, citations, tool calls, optional intent, answer, abstention, target cost, and arbitrary structured business data. Missing data is distinct from empty data and from zero.
4. Assertions are deterministic where possible. Literal citation provenance cannot establish semantic entailment; a calibrated judge or human annotation is required for that claim.
5. Plugins provide application-specific evaluators and arbitrary model providers. A normalized HTTP judge contract avoids hard-coded model versions, SDK dependencies, or pricing guesses.
6. Bounded workers and per-call abort deadlines keep independent cases isolated. No automatic retries: an agent's write may already have taken effect. Cooperative cancellation is mandatory for live plugins; arbitrary code that ignores its signal cannot be forcibly terminated in-process.
7. Repeat trials remain visible. The confidence lower bound counts unique cases that passed every repeat; repetitions never inflate independent sample size. It is a Wilson interval, conditional on representative independent cases, not a certification of production reliability.
8. Unknown classification predictions are included in the confusion matrix. Missing/error predictions have explicit sentinel labels. Unspecified mistake costs produce unknown mean cost and fail cost gates.
9. Critical failures and execution errors always block a run. Normal failures can be tolerated only through explicit gates. Skipped checks do not pass.
10. Paired interventions compare the same repetition across two cases. Invariance tests detect sensitivity to irrelevant or adversarial changes; change tests detect failure to respond to meaningful context. Both require case-specific oracles to avoid a constant-output system passing an invariance suite.
11. Reports retain outputs, check reasons, hashes, target/judge revisions, gate results, and per-intent/tag slices. Reports are local, exclusive-write, private-permission artifacts. They are not encrypted, automatically redacted, or tamper-proof archives.
12. Calibration requires two distinct reviewers, third-party adjudication of disagreements, a held-out split, sufficient cases per intent/rubric, and judge agreement at least as high as both the human agreement and a configurable floor. Identity and blind review are organizational responsibilities; file fields cannot prove them.

## Dependency graph and acceptance evidence

| Work | Depends on | Acceptance |
|---|---|---|
| Contracts / strict validation | source research | Invalid suites and malformed observations rejected |
| Deterministic evaluators | contracts | Golden numeric retrieval, citation, tool and business-rule tests |
| Target and judge adapters | contracts | Local HTTP and chunked SSE integration tests; no live services needed |
| Runner | evaluators / adapters | Gold data withheld, deadlines, bounded concurrency, error accounting |
| Statistical reporting / gates | runner results | Exact confusion matrix, missing costs, Wilson bound, critical gates |
| Paired intervention checks | runner / assertions | Vulnerable output fails despite its individual checks passing |
| Gold calibration | validation | Disagreement, adjudication, degenerate kappa and undersampling tests |
| CLI and artifact reports | runner / statistics | Exit codes, JSON/HTML persistence, comparison compatibility |
| Examples / integration docs | full workflow | Passing RAG/agent/robustness demos and failing regression demos |

## Boundaries

The included data is synthetic demonstration data, not an independently human-reviewed production gold set. No production chatbot calls are needed for development. Real target quality, judge quality, ACL enforcement, corpus extraction, cost estimates, and business risk require representative user-owned evidence. No live deployment, credentials, third-party SaaS, database, or model API is required to run the examples.

Human labeling interfaces, distributed workers, online monitoring, deployment approval management, and statistical causal attribution across production traffic are future extensions rather than claims made by this local evaluation tool.


## Data-oriented evolution

The measured proposal in [data-oriented-evals.md](data-oriented-evals.md) describes an
integer-indexed, columnar execution plan and a broader evidence model for human baselines,
per-intent qualification and production feedback. The offline profiling harness and raw CPU,
allocation and timing artifacts accompany it. Calibration and summary/check aggregation now use flat numeric counters; relations use
integer-indexed row ranges, and unique-case support uses reusable bitsets. The runner reuses
finalized metrics for gates. All four measured targets are verified against frozen previous
implementations and benchmarked. The larger storage/production-feedback extensions remain
proposed;
current JSON/SDK contracts are preserved.
