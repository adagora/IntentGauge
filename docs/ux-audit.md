# UX Audit: IntentGauge project dashboard

Date: 2026-11-02. Scope: the current CityWheels project dashboard, its calibration workflow,
and the commands used to reach it. The original simulation cockpit is assessed only where
it competes with that entry point.

## Current disposition (2026-11-02 follow-up)

The original findings below describe the pre-remediation implementation. Their locations,
score and reproduction output are historical. The current source implements the functional
changes below; no new usability score is assigned without browser and user observation.

| Finding | Current implementation and evidence | Verification |
|---|---|---|
| C1: human-review dead end | `src/dashboard-review.ts:3` offers named rubrics, separate blank reviewer worksheets, two label imports, third-reviewer adjudication and development-dataset export. `src/dashboard-review.ts:29` rejects wrong packets, duplicate/incomplete rows and wrong reviewer identities. | Automated packet execution, worksheet label export → file import → adjudicated dataset export, source-text round-trip and rejection checks pass. Browser downloads and actual review sessions unverified. |
| I1: competing default | `src/dashboard.ts:43` renders the newest saved evaluation; `/runs` selects another, `/demo` explicitly opens the simulation. Missing retained inputs stay unavailable. README now documents the default. | Handler and renderer tests pass, including empty library and missing run. HTTP listener blocked. |
| I2: contradictory import state | `src/dashboard-project.ts:49` derives Overview from missing/reading/invalid/loaded state, separately stating that browser data is not linked to the run. | Valid import updates Overview; invalid input removes eligibility. |
| I3: stale threshold results | `src/dashboard-project.ts:78` recalculates on every edit; invalid edits clear eligibility. Visible results record their evaluated settings. | Changing 30 to 100 immediately shows a 70-case deficit; clearing the control removes the old conclusion. |
| I4: async file ordering | `src/dashboard-project.ts:76` uses selection tokens and reading/error state. Empty selection invalidates any pending read. Comparison and reviewer imports use the same ordering pattern. | Controlled reads verify that older calibration files cannot replace newer or cleared selections. |
| I5: baseline decision | `src/dashboard-project.ts:79` validates comparison compatibility and shows new failures, recovered trials, persistent failures and regressed checks with case links. CityWheels embeds the baseline in the injected candidate. | Comparison change counts, persistent failures, incompatibility clearing and actual injected regression verified. |
| I6: focus/history/announcements | `src/dashboard-project.ts:40` focuses the destination heading after user navigation and records hash state; popstate restores the view. Imports and counts use live status elements. Initial load does not move focus. | VM checks verify focus calls and restored view state. Actual keyboard, Back/Forward and screen-reader behavior unverified. |
| I7: eligibility recovery | `src/dashboard-project.ts:64` lists sample deficits, missing gold classes, unresolved IDs and actual versus required agreement. Expandable unresolved-label evidence includes reviewer identities/values and repair instructions. | Sample deficit, missing-class and unresolved-row cases verified. Kappa remains diagnostic. |
| S1: narrow-screen cards | `src/dashboard-project.ts:19` stacks summary cards below 420px. Grid styling is restricted to Overview cards so review/import forms retain their block layout. Long card/identity text wraps. | Source verified; 320/375/390px and zoom layout unverified. |
| S2: units and terminology | Agreement says 0–1; Human scoring defines intent and rubric at first use. Technical run identity remains disclosed separately. | Source verified. Comprehension untested. |
| S3: disclosure/search/navigation | Case expansion is remembered by case/repetition key in `src/dashboard-project.ts:57`; clear search and skip navigation are present. | Source verified; native disclosure and skip-link interaction need browser checks. |

The follow-up also corrected reviewer-packet escaping: literal `<` characters now survive
JSON embedding without allowing an answer containing `</script>` to terminate the script.
Packets explain that labels must be downloaded before closing or reloading. File-selection
clearing no longer leaves calibration stuck in Reading or keeps canceled reviewer labels.

### Verification and limits

- `npm test`: **41 passed, 0 failed**. `test/dashboard.test.ts` contains executable behavioral
  coverage for the core fixes, using Node VM document stand-ins and direct server handlers.
  The worksheet exporter itself is executed with real Blob serialization; the resulting label
  files feed the coordinator import handlers and adjudicated evidence exporter. Reversed and
  canceled reviewer reads cannot restore obsolete labels. This does not test browser downloads.
- `npm run citywheels`: **26 baseline cases passed**, deliberate regression detected. Artifacts:
  `runs/citywheels-2026-11-02T16-30-57-090Z/` and its `-injected-regression` sibling.
- Local serving was retried and returned `listen EPERM: operation not permitted 127.0.0.1:4317`.
  Browser file navigation was rejected because URL policy allows only HTTP(S). These controls
  were not bypassed. Browser downloads, file pickers, layout and assistive technology remain
  unverified; offline tests are evidence about control flow, not a usability study.

### Remaining manual acceptance checks

1. Open the current default dashboard in an environment permitting localhost serving. Confirm
   the newest run, run selector, full report and explicit simulation route.
2. Use only the keyboard: skip navigation, all five views, case disclosures, search/clear,
   reviewer setup and imports. Confirm visible focus, destination-heading focus, reload and
   Back/Forward without unexpected focus loss.
3. With a screen reader, confirm view changes, result counts, import success/errors and
   eligibility repair instructions are announced without excessive repetition.
4. At 320/375/390px and 200% zoom, inspect all views with long case/dataset/reviewer names.
   Confine wide evidence tables to their own scrollers; ensure forms and cards stay usable.
5. Download both reviewer packets, score and export them in a browser, import the files,
   resolve a disagreement with a third reviewer and download the reviewed dataset. Confirm
   the original text and dev scope survive. Exercise invalid files and fast reselection.
6. Ask a new reviewer after three seconds: “What passed, what remains unqualified, and what
   should I do next?” Record their answer before making any comprehension claim.

These checks remain open; the implementation evidence does not establish complete
accessibility conformance, protected holdout independence or production qualification.

On 2026-11-02 a later environment could bind `127.0.0.1:4317`. HTTP fetches confirmed the default run, the run library, the simulation route, and one full report. That covers only the routing half of check 1. Checks 2 through 6, and the visual half of check 1, were not run. Details are in `docs/verification.md`.

## Original audit (before remediation)

## Summary

**Provisional score: 5/10. Critical: 1. Important: 7. Suggestions: 3.**

The main result is substantially easier to read than the original cockpit. The principal
remaining problem is workflow completion: the interface recommends human scoring, then
requires users to arrive with a custom JSON dataset that the application cannot help them
create. Calibration also has contradictory and stale display states.

This is a source and offline-runtime audit, not a browser usability study. Local server
sockets and browser file navigation were blocked earlier in this session; those restrictions
were not bypassed. No visual, screen-reader, real-keyboard, mobile, zoom, or three-second
comprehension pass is claimed. Application code was not changed during the original audit; follow-up changes are tracked above.

## Quick check

| Area | Status | Evidence |
|---|---|---|
| Navigation | Important issues | Competing entry points; in-page views have no focus/history handling |
| Forms | Important issues | No guided dataset creation; stale parameter results; file-read race |
| Errors | Partially adequate | Visible role=alert, but failed eligibility has no actionable breakdown |
| Accessibility | Partial evidence | Native controls, explicit labels and good text contrast; focus and announcements need work |
| Mobile/responsive | Unverified risk | Navigation scrolls; three summary cards remain in three columns at narrow widths |

## Critical issue

### C1. The recommended next step ends at a developer-only importer

**Heuristics:** Recognition, real-world language, help and documentation.
**Location:** `src/dashboard-project.ts:21`, `src/dashboard-project.ts:43`.
**Confidence:** High. **Scope:** Completion of the intended human-scoring workflow.

The Overview says “Next: establish human scoring.” Its action opens a file picker requiring
an existing IntentGauge calibration JSON file. There is no rubric setup, reviewer worksheet,
schema download, sample structure, annotation queue, or route to collect two independent
labels and adjudicate them. A user starting from the app cannot complete the recommended
next step. The UI honestly describes some of these limits, but that does not supply a path.

**Fix:** Offer two explicit paths: “Start human review” and “Import existing labels.” The
first should create a named rubric and review worksheet, then track first reviewer, second
reviewer and adjudication progress. Explain separately that scoring human workers and
measuring reviewer agreement are different tasks. Do not relabel inspected CityWheels cases
as a protected holdout.

## Important issues

### I1. The primary dashboard command still opens the old simulation cockpit

**Heuristic:** Consistency. **Location:** `package.json` (`scripts.dashboard`),
`src/dashboard.ts:35`, `integrations/citywheels/run.mjs:13`.
**Confidence:** High.

`npm run dashboard` serves `dashboardHtml`, the original cockpit. The simpler interface is
a different renderer saved only by the CityWheels integration. Users following the primary
command return to the noisy simulation even after receiving the redesigned project page.

**Fix:** Make one project/run selector the default entry point and use the focused renderer
for real reports. Put the original simulation behind an explicit “Demo laboratory” link.
Keep demo, saved-run and live-monitor modes visibly distinct.

### I2. The Overview contradicts a successful calibration import

**Heuristic:** Visibility and consistency. **Location:** `src/dashboard-project.ts:42`,
`src/dashboard-project.ts:52`.
**Confidence:** Reproduced offline.

After a valid calibration dataset loads, Human scoring shows results while the Overview
still says “Missing / No dataset connected.” That card is hardcoded and is never updated.
Run qualification remains legitimately unbound; the UI needs to express that distinction.

**Fix:** Separate “Dataset loaded in this browser” from “Calibration linked to this run.”
Derive the overview from that state, rather than from fixed copy. Preserve the distinction
between loading evidence and granting qualification.

### I3. Edited thresholds leave an obsolete eligibility result visible

**Heuristic:** Visibility and error prevention. **Location:** `src/dashboard-project.ts:21`,
`src/dashboard-project.ts:53`, `src/dashboard-project.ts:58`.
**Confidence:** Reproduced offline.

Load the supplied 30-row calibration fixture, then change minimum cases from 30 to 100.
The previous “Eligible under configured rules” result remains displayed until Recalculate
is pressed. The displayed parameters and conclusion now refer to different configurations.
The button permits an apply workflow, but there is no dirty/pending indication.

**Fix:** Recalculate on validated edits, or mark results “Out of date—apply changed
thresholds.” Always display the exact settings used for the visible result.

### I4. An older file read can overwrite the newly selected dataset

**Heuristic:** Error prevention. **Location:** `src/dashboard-project.ts:57`.
**Confidence:** Reproduced with controlled asynchronous file reads.

Select dataset A, then select B before A finishes reading. B renders, then the older A read
resolves and replaces B's results. The handler has no selection generation/request token.

**Fix:** Give each selection a monotonically increasing token. Commit results/errors only
when that token is still current. Show reading, selected filename and loaded dataset identity.

### I5. The report does not answer “Did this change improve or regress?”

**Heuristic:** Match to the release-review workflow.
**Location:** `integrations/citywheels/run.mjs:13`, `integrations/citywheels/run.mjs:20`,
`src/dashboard-project.ts:19`.
**Confidence:** High.

The integration writes a comparison JSON file, but neither project dashboard links it or
shows the baseline/candidate relationship. Each page reports its own status. A reviewer
must locate another artifact and interpret raw JSON to understand changes.

**Fix:** Add an optional comparison brief: baseline identity, candidate identity, new
failures, resolved failures and unchanged failures. Link affected cases directly. Require
compatible suite/evaluator revisions before showing a comparison; preserve standalone mode.

### I6. View changes do not manage focus, announcements or browser history

**Heuristics:** User control and accessibility.
**Location:** `src/dashboard-project.ts:36`, `src/dashboard-project.ts:37`,
`src/dashboard-project.ts:48`.
**Confidence:** High for missing handling; actual assistive-technology behavior unverified.

View switching only toggles hidden and aria-current. When an Overview action opens Cases
or Human scoring, the activated button becomes hidden without moving focus to the new
heading. Search-result counts and successful imports have no live announcement. Views
also have no URL state, so Back/Forward and reload do not preserve navigation.

**Fix:** After a user-triggered view change, focus the destination heading using tabindex=-1.
Use a polite live status for counts/import results. Put the selected view in the URL hash
and handle history. Keep the initial page load from stealing focus.

### I7. Failed calibration eligibility lacks a repair checklist

**Heuristic:** Error recovery. **Location:** `src/dashboard-project.ts:55`,
`src/calibration.ts:59`, `src/calibration.ts:62`.
**Confidence:** High.

The interface shows “Not eligible” and a wide numeric table. It does not name failed
requirements or expose the positive/negative class support already returned by calibrate.
A dataset missing one gold class can show excellent agreement and undefined kappa without
a concise explanation of why eligibility failed. Unresolved disagreements are counted but
not linked to the affected rows.

**Fix:** List specific blockers per intent/rubric: insufficient cases, missing class,
unresolved case IDs, or agreement below the required floor/human baseline. Display actual
versus required values. Continue treating kappa as diagnostic unless an explicit policy
adds a kappa threshold.

## Suggestions

1. **Narrow-screen summary:** At <=420px, stack cards or use a compact label/value list.
   The current CSS keeps three columns and large monospaced values. Verify 320/375/390px,
   200% zoom and long dataset names in a browser before claiming a responsive pass.
2. **Plain-language units:** Label minimum agreement “0–1” or accept percentages. Explain
   rubric and intent at their first actionable use. Put technical identifiers behind details.
3. **Useful disclosure state:** Search rebuilds every case details element on each input,
   losing which case the user opened. Preserve expansion by case/repetition key and provide
   a clear-search control. Add a skip link for repeated navigation.

## Accessibility evidence

Computed contrast ratios using the declared CSS colors:

| Pair | Ratio |
|---|---:|
| Main text / panel | 12.55:1 |
| Muted text / panel | 7.06:1 |
| Amber / panel | 9.49:1 |
| Pass text / panel | 9.55:1 |
| Failure text / panel | 8.59:1 |
| Input border / input background | 3.66:1 |
| General border / panel | 1.71:1 |

The low general border contrast is not by itself a proven accessibility violation: many
borders are decorative, while text labels and focus outlines identify controls. Browser
inspection must establish which boundaries are needed to recognize interactive elements.
Native buttons, input labels, text status labels and role=alert are positive foundations.
No contrast-only or source-only audit establishes complete accessibility conformance.

## Nielsen heuristic assessment

Provisional source-based ratings, each out of 10. These are judgments, not measured user outcomes.

| Heuristic | Rating | Main concern |
|---|---:|---|
| Visibility | 5 | Loaded and edited calibration states are not consistently represented |
| Real-world language | 6 | The result is plain; the next task assumes evaluation terminology |
| User control | 4 | No navigation history, review creation, or retained disclosure state |
| Consistency | 4 | Old default cockpit versus new artifact; contradictory dataset state |
| Error prevention | 5 | Good input validation; async race and stale conclusions |
| Recognition | 4 | A new reviewer must know and author the JSON contract |
| Flexibility/efficiency | 5 | Search and scriptable checks exist; comparisons remain separate |
| Minimal design | 7 | Focused Overview is an improvement; mobile density unverified |
| Error recovery | 5 | Error text exists; eligibility repair instructions are incomplete |
| Help/documentation | 6 | Workflow explanation exists; task-level onboarding is missing |

## Recommended order

1. Unify the default entry point with the focused project view.
2. Provide an achievable human-review onboarding path.
3. Correct calibration state, stale thresholds and async selection ordering.
4. Surface candidate/baseline changes and actionable eligibility blockers.
5. Verify keyboard, screen-reader, mobile and three-second comprehension with actual users.

The three-second question to test is: “What passed, what remains unqualified, and what
should I do next?” Passing code tests alone cannot establish that users answer it correctly.

## Reproduction evidence

The offline probes loaded the exported dashboard script in Node's VM with minimal DOM
stand-ins. Observed output:

```text
Valid calibration loaded: true
Overview still says Missing: true
After increasing min-cases to 100 without recalculating, results still say Eligible: true
Newer file rendered before slow file returns: true
Older file overwrote newer selection: true
```

These probes demonstrate state/control-flow behavior, not DOM layout, focus, browser file
picker behavior or rendering performance. No paid model calls or production actions occurred.
