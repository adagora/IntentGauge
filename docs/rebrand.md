# IntentGauge name check

Date: 2026-11-02. Status: adopted for the tool. The owner chose the name IntentGauge and declined to buy `intentgauge.com`. This search is not legal clearance, and nothing was registered or published.

## What was checked

Exact string `intentgauge` / `IntentGauge`, on 2026-11-02.

| Place | Result |
|---|---|
| npm package `intentgauge` | Registry returned 404. `npm search intentgauge` returned no packages. |
| npm package `evallol` | Registry returned 404. This package has not been published. |
| GitHub repository name | Repository search for `intentgauge` in the name returned 0. User accounts `IntentGauge`, `intentgauge`, and `intent-gauge` returned 404. A broader search without the name limit returned 6 repositories. Their descriptions contain the separate words "gauge" and "intent". None is named IntentGauge. |
| `intentgauge.com` | Registered 2023-03-31 through GoDaddy, expires 2027-03-31, last changed 2026-08-27. Client delete, renew, transfer, and update are prohibited. Nameservers are `ns1.afternic.com` and `ns2.afternic.com`. `https://intentgauge.com/lander` redirects to GoDaddy's for-sale URL for this domain. The for-sale page itself returned 403 to this client. The redirect is enough to show a parking listing, not a running product. |
| `intentgauge.io`, `intentgauge.ai`, `intentgauge.org` | WHOIS said the domain was not found. |
| `intent-gauge.com` | WHOIS said no match. |
| `intentgauge.dev`, `intentgauge.app` | Inconclusive. WHOIS did not print a domain record or a not-found line, and Google's RDAP host did not resolve from this network. |

Trademark registers were not successfully queried. A POST to `https://tmsearch.uspto.gov/api-v1-0-0/tmsearch` returned 405. WIPO Brand Database returned a captcha page instead of search results. A web search for the exact string did not surface a USPTO, EUIPO, or WIPO registration. That absence is not a clearance opinion. Unregistered use, other classes, and national registers can still conflict.

## Nearby names

These are different strings. They still matter if the name is used in public.

- The R package `morseldash` documents a function named `intentGauge` (rdrr.io, 2019-10-30). It wraps a Shiny purchase-intent gauge. Same camelCase token, different product.
- The npm package `intentguard` (2.0.0 at the time of this check) measures whether built work matches a declared intent, and its README treats IntentGuard as a brand. The words are not the same. The job it describes sits close to this tool.
- Gauge, at gauge.org and `github.com/getgauge/gauge`, is an existing test-automation tool. The npm package `gauge` is a progress bar. InGauge, at getingauge.com, is a mental-health check-in product.

No exact software product named IntentGauge turned up. The material practical conflict is the `.com`: it is already registered and listed for sale. Buying it was not attempted.

A few nearby spellings were checked only so they would not be offered blindly. `holdfast` is an existing npm package. GitHub already has repositories named CaseLedger and pairgate. `rubricgate` and `intentdocket` had no npm package. Their domains and trademarks were not checked, so they are not replacement recommendations.

## Decision

The visible name, the npm package name, and the command are now IntentGauge / `intentgauge`. The domain was not bought. A public launch still needs a lawyer before anyone claims the name.

These identifiers stayed on purpose:

- `schemaVersion` is still 1.
- Reviewer files still use `evallol-review-plan-1`, `evallol-review-packet-1`, `evallol-review-labels-1`, and `evallol-human-review-1`, so a packet saved earlier still imports.
- The chatbot request still sends `source: "evallol"`. That string goes to the other service.
- Saved reports under `runs/` and the performance JSON under `artifacts/perf/` were not rewritten. New reports use the new name. Old HTML still says evalLOL.

## What the rename changed

README, docs, CLI help, dashboard titles, and new HTML reports now say IntentGauge. The package name and the command are `intentgauge`. Old files under `runs/` and the performance JSON were left as recorded.

| Identity | Value now | Why |
|---|---|---|
| npm package and command | `intentgauge` | The package was never published, so the rename does not break installers. |
| Suite, report, calibration | `schemaVersion: 1` | Parsers reject any other version. The name change does not bump it. |
| Reviewer files | `evallol-review-*-1` and `evallol-human-review-1` | Import checks this exact text. Old packets still open. |
| Chatbot request | `source: "evallol"` | The other service receives this field. |
| Comparison | suite hash, options, judge, evaluator revisions | Comparison ignores the product title. Old `report.json` files still compare. |

Frozen references in `test/fixtures/` and the digests in `artifacts/perf/` compare algorithm output, not the product title. Do not edit them to chase a rename.

## Before a public release

The repository root has no `LICENSE`, `CONTRIBUTING`, or `SECURITY` file. `auto-research-toolkit/` is an untracked separate tree and does not supply a license for this package. Nothing was added here, because the owner has to choose.

Until a license file exists, the honest status is that no reuse is granted. For a public SDK that other applications call, Apache-2.0 gives an explicit patent grant and fits the Apache-2.0 TypeScript dev dependency. MIT is shorter and is enough for a tool with no runtime dependencies. GPL-3.0 would place copyleft duties on applications that ship this code with their own, which fights the current adapter design. The choice is the owner's.

A public repository also needs a security contact and a contributing note that historical runs and frozen performance artifacts stay intact. Those files should wait for the same decision as the license.
