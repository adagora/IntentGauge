# Chatbot integration

Source inspected at `/Users/gora/AI_Project/chatbot/Front_Server`. The implementation was inspected read-only; no production calls, database access, credential reads, or changes were made.

## Relevant business rules

| Source | Evaluation implications |
|---|---|
| `src/custom/jevGolden.ts`, `src/utils/priceGrid.ts` | Validate product/variant, row, column, value and currency together; reject incorrect alternatives |
| `src/custom/retrievalEval.ts` | Distinguish candidate ranking from the context actually supplied to generation |
| `src/jev/verifyCitations.ts` | Source, numeric, table-cell and condition consistency need separate checks |
| `src/services/knowledgeAccess.ts` | Restricted evidence must be checked against the requesting actor's access |
| `src/services/documentCatalog.ts` | Version/source authority; document-level responses can have empty chunk IDs |
| `src/utils/followupIntent.ts` | Product inheritance, topic corrections and multi-turn currency changes |
| `src/jev/serviceFocus.ts` | No unsupported warranties, bookings, submissions or invented contacts |
| `src/endpoints/post/POSTChat.ts` | Persisted conversations and SSE; verification can arrive after final |

## Live adapter

```sh
node dist/src/cli.js run chatbot-suite.json \
  --chatbot http://localhost:3006/api/chat \
  --revision 'model_prompt_index_policy-revisions' \
  --token-env CHATBOT_ACCESS_TOKEN --concurrency 1
```

This is an explicit live execution: POST writes conversations and may incur inference charges. Prefer a staging instance with a dedicated evaluation user. The adapter leaves conversations intact; it does not delete server data or manipulate its database. It does not bypass application caching, so control cache conditions in your staging setup when comparing latency or repeated outputs.

Case input is `{"question":"..."}` or `{"turns":["first question","follow-up"]}`. Optional `jev:boolean` is forwarded. Each repetition begins a fresh conversation; later turns reuse only that repetition's returned conversation ID. The production endpoint does not accept the README's older `history[]` contract.

The adapter consumes through EOF, preserves `verification` after `final`, and fails on SSE errors, malformed final data, or missing conversation IDs for multi-turn cases. Top-level observation describes the last turn. All turn observations are also in `/data/turns` for JSON-pointer assertions.

The token environment variable is sent as the **exact** authorization header; the existing endpoint uses a raw OIDC access token. Generic `--http` uses `Bearer <token>` instead. Tokens are not stored in target metadata.

## Evidence mapping and limits

- `answer` → `answer`; `foundInDocuments` → inverse `abstained`.
- Source `chunkId` → evidence ID. Document-only sources without a chunk ID receive a deterministic hash of selected document metadata.
- `snippet` → evidence text with `metadata.textCoverage = "preview"`.
- `cited` sources → citations, retaining quote, page, cell, version and content hash.
- `primarySource`, `model`, late `verification` → `data`; raw debug prompt/system instruction and conversation IDs are excluded from report observations.
- No full cost is inferred from missing billing data. HTTP observations omit cost; use an explicit trusted billing export to populate it.
- The endpoint does not normally return a normalized intent or tool trace. Assertions needing those fields require instrumentation or a custom adapter.

Source snippets are truncated in this endpoint. A quote outside the preview cannot be disproved or verified from that preview, so literal provenance returns an evaluation error requesting full text. To evaluate full citation provenance, export the actual retrieved chunks into a replay file or supply a custom adapter. Semantic claim support still needs a judge/human rubric.

Do not derive an authoritative gold value solely from the same ingest output the evaluated system uses. The existing gold script focuses on one price-list corpus and is not independent evidence of PDF extraction accuracy or all production intents. Sample and independently annotate the production scenarios that matter to you.
