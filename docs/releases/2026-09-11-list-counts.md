# Evidence-Bound List Count Repair

## Latest Acceptance: Failed

An early browser acceptance still reported summary / `9个`. Prior offline
success below was not successful browser acceptance. The new request/response
and loaded-worker version had not yet been captured at that point; local bundle
hash still matched the delivered artifact.

A read-only probe confirmed wording sensitivity: replacing the captured summary's
colon enumeration with parentheses, without changing its members/count/citations,
reproduces the same rejection. This is a demonstrated design limitation, not proof
of this new response's contents. Do not stack more phrase-specific patches.
No additional runtime changes or rollback have been performed in this follow-up.

## Result

The captured Shenzhen request and report now pass unchanged through the direct
validator, direct client, and rebuilt background bundle. The repair counts a
complete numbered source list only after matching every enumerated report name
and checking the statement's citation coverage. It does not globally allow the
number nine or remove quantity checks.

Runtime files changed:
- src/direct-report-validator.js
- src/direct-ai-client.js
- src/background-bundle.js (generated)

No material, analysis, report, credential, storage schema, local backend contract,
or UI changes. No re-summarization or browser-data cleanup is needed.

## Verification

- 25 new count tests, including the captured input/output fixture.
- 36 focused numeric/list tests passed; 288 full extension tests passed.
- 14 manifest JavaScript files exist and parse; bundle rebuild is byte-identical.
- Bundle SHA-256: ea1a17266fcc1eec1f1c56bbb1e6e880177b396a85d7d66c554bc3137acc2d15.
- Independent review findings were reproduced and fixed. Recheck found no
  remaining findings in the changed scope.
- No live model call was made. Passing recorded output is not a substitute for
  fresh real-browser acceptance or factual verification of travel information.

## Browser Acceptance

1. Open edge://extensions and reload the existing unpacked Shiji extension.
2. Refresh the Xiaohongshu page and reopen Shiji.
3. Keep the existing two organized materials and generate one report. This calls
   the configured model; no additional analysis or connection test is needed.
4. Confirm a report opens, then inspect its sources. If generation fails, preserve
   that request payload and response body, excluding authorization headers.

## Boundaries

This scoped parser supports complete keycap-numbered lists with unambiguous
headings and explicitly enumerated member names. Other count syntaxes and
ambiguous heading/description line boundaries remain fail-closed. Derived counts
do not authorize unrelated categories, money, durations, or another material's
statements. It is not a general semantic fact checker.

## Rollback

Pre-edit copies of the three runtime files are under
tmp/rollback-2026-09-11-list-counts. Restore only these matching files after
checking for subsequent edits, then reload the extension and note page. No
browser storage rollback is necessary for this change. Do not remove materials,
clear extension storage, or rerun the older T1 cleanup helper.

## Review

### Task
- Objective: Fix the actual captured list-count false rejection.
- Context: Earlier title-based trial failed and was rolled back.
- Evidence used: Matching request/response rev-ui-5ca2c63c and production validator.

### Result
- Outcome: Exact offline replay and automated verification pass; browser check pending.
- What worked: Tests compare real report data unchanged and scope negative failures.
- What failed: Initial category prefixes and ordinal normalization were too broad;
  independent review caught them before delivery, and regression tests now guard them.
- Confidence: Verified for the captured data and covered boundaries, not every
  future model response or note layout.

### Analysis
- Error class: Validation Error.
- Root cause: Literal numeric-token matching cannot recognize a derived list count.
- Missing information: Fresh user browser acceptance of the rebuilt extension.

### Next-Time Rules
- Replay actual rejected input/output before changing evidence validation.
- Keep derived counts scoped to members, category and cited material.
- Test unit-like headings before normalizing source ordinal symbols.

### Durable Lesson
- Keep: Exact replay, narrow backups, adversarial numeric/citation tests.
- Avoid: Global numeric allowlists and normalization that invents source quantities.
- Store: learning/findings.md.

### Closure
- New lesson: Ordinal keycaps form a boundary that must not merge with unit-like names.
- Repeated lesson: Automated/offline success is not real-browser acceptance.
