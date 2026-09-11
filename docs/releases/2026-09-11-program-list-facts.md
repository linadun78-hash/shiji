# Program-Owned List Facts

## Status

Implemented and rebuilt. Automated checks pass; real-browser acceptance is
PENDING. The previous prose-count repair failed browser acceptance and is replaced,
not reclassified as successful. No live provider request was made during this work.

## Changes

- Derive request-local sourceLists from verbatim numbered evidence. The captured
  Shenzhen sources produce separate nine-entry and eight-entry catalogs.
- Model uses standalone {{sourceList:L1}} tokens for aggregate descriptions.
  Program verifies exact material/evidence coverage and renders a complete neutral
  sentence with the computed count and original headings. No category/colon proof
  inferred from generated prose and no global whitelist for a number.
- Ordinary model prose still undergoes numeric/origin/citation validation.
  Unsupported tokens never reach a successful report; input objects stay unchanged.
- Normal generation uses one request. Matching count-format or list-token errors
  can trigger one corrective request, explicitly authorized by the user. The whole
  replacement is checked again; a second failure stops. Authentication, network,
  schema, citation and unsupported price/time/distance errors do not trigger it.
- The correction gate is a bounded heuristic, not semantic proof: a same-sized
  unrelated integer count can consume one correction, but cannot become supported
  by matching the catalog count. Other count values do not trigger correction.

Runtime: src/direct-report-validator.js, src/direct-ai-client.js and generated
src/background-bundle.js only. No credential, raw material, stored analysis,
successful report, local-backend or UI changes.

## Verification

- Full extension suite: 287 passed, zero failures.
- Focused direct generation/numeric/citation/list suite: 44 passed.
- All 14 manifest JavaScript files parse; bundle exactly matches its source modules
  and build assembly format.
- Bundle SHA-256: fa2c542ddb4c6eb87e6dfccb6d6b0f1242a071999858ba1a73e0c64c63f4a866.
- Both historical raw report fixtures still fail the new protocol as expected.
  Provider stubs return each raw failure followed by an explicitly synthetic
  protocol-compliant response. Source and bundle tests verify expansion and the
  two-call ceiling. These are not live corrected model outputs.
- Independent review identified malformed-token masking, schema checks and broad
  retry classification. Added RED regressions and fixed them. Recheck confirmed
  those fixes and identified missing preflight metadata type checks; that final
  case was also reproduced, fixed and included in the final passing full suite.

## Browser Acceptance

1. In edge://extensions reload the existing Shiji extension. Keep its current path
   and browser profile; do not remove/reinstall it or clear storage.
2. Refresh the Xiaohongshu page and reopen the drawer.
3. Generate with the existing two organized materials. No new summarization or
   connection test is needed. Wait for completion; a corrective request may make
   this run longer than one ordinary generation.
4. Confirm a report opens, has readable count sentences rather than placeholders,
   and its sources point to the corresponding original evidence.

The parser remains conservative about keycap sequences and ambiguous source
headings. This does not verify current travel information or every semantic claim.

## Rollback

Exact pre-change runtime and count-test files are preserved under
tmp/rollback-2026-09-11-program-list-facts. After checking for later edits, restore
only those three runtime files and the matching test file if reverting this change.
Then reload the extension and note page. No browser data rollback is required.
The backup represents the previous browser-failing implementation, not a known-good
generation release. Do not delete materials or rerun the older title cleanup.

## Review

- Objective: Stop treating generated prose syntax as authority for derived counts.
- Context: Repeated real-browser rejection of supported nine-entry descriptions.
- Evidence: Two captured final report fixtures, corresponding source evidence,
  protocol adaptation tests, negative checks and independent code review.
- Outcome: Implementation and offline verification complete; browser result unknown.
- What worked: Source-owned values, explicit references, whole-report retry gating.
- What failed: Initial recovery gate overlooked null schema and consumed prose
  after a malformed token. Tests now cover both and the preflight metadata variant.
- Error class: Validation Error.
- Root cause: Prose parsing and first-error decisions crossed trust/cost boundaries.
- Next-time rules: Separate computed facts from prose; never consume unknown prose
  as a token; validate the complete report before authorizing paid correction.
- Durable lesson: Recorded in learning/findings.md.
- Repeated lesson: Synthetic/provider-stub success is not browser acceptance.
