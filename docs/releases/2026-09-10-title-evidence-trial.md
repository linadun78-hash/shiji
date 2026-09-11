# Title Evidence Repair Trial

## Status

Real-browser acceptance failed: the user's next screenshot reports an unsupported
`9个` in theme 2. The user-authorized conditional rollback has been executed for
all seven code/test files, with SHA-256 values matching the pre-trial copies.
The added test was archived under `tmp/rollback-2026-09-10-title-evidence/failed-trial/`.
The restored baseline passes 263 tests. No new product repair was added.

Browser-data cleanup is now verified by the user's console screenshot:
`rollback_verified { removed: 2, backupKey: 'xhsTitleEvidenceRollbackV1' }`.
Code and analysis data have been restored; the analysis backup is retained.
The user should refresh the note page to discard in-memory trial state. The
assistant did not directly operate browser storage; report generation is still
unresolved, and rollback is not a fix for the original generation problem.

## Trial Changes (Reverted)

- Original title is appended as T1 with `sourceField: 'title'`; existing body IDs
  and quote text remain unchanged. Duplicate, stale or forged T1 is rejected.
- Existing successful direct-mode briefs gain the title during report collection,
  with the existing content-hash/revision guard. Repeated collection is idempotent.
- Complete keycap digit sequences are normalized only during numeric comparison.
  Different amounts, units, unknown references and uncited facts remain rejected.
- The report prompt requires T1 when using a title-derived quantity, including
  in the summary. Title evidence does not establish a route order or schedule.
- Switching back to local mode removes only tagged T1 from the outgoing request
  copy, not stored evidence. This preserves the previous backend contract.

## Verification

- Baseline: 263 tests passed.
- Red phase: 11 expected failures for title preparation, persistence, numeric
  comparison and generated bundle; these passed after implementation.
- Independent review: one introduced local/direct/local compatibility issue;
  reproduced with two further failing tests and fixed before delivery.
- Final: `npm test` reports 277 passed, 0 failed.
- All 14 manifest-referenced scripts exist and parse.
- `npm run build:background` completed; repeated build was byte-identical.
- Bundle SHA-256: `7B4BB274E400F8A3179B0F243DC034CDA43DBB03AE912253EA64DB4AC63412A1`.
- Offline rollback simulation used the actual pre-trial client and confirmed
  that removing only tagged T1 restores the original fixture's body evidence.
- No live model request, credential access or browser storage change was made
  during implementation. Automated fixtures do not prove real model quality.

## Rollback Verification

- Before restoration, the trial bundle matched the recorded SHA-256 and all
  source/test differences matched this trial. No overlapping user edits found.
- Preserved the failed trial files in the `failed-trial` subdirectory before
  restoring the seven verified originals. Nothing was permanently deleted.
- Restored bundle SHA-256: `F413BDDB7CD2A1A1332B99101DF2467BD7A8D1EF374EDB8E1A23E3B9623B023B`.
- `npm test`: 263 passed, 0 failed after restoration.
- Prepared `tmp/rollback-2026-09-10-title-evidence/cleanup-browser-evidence.js`
  for the extension background console after reload and with AI work idle.
  It backs up analysis state under `xhsTitleEvidenceRollbackV1`, removes only
  tagged T1, checks for changed state, and verifies the result. It does not read
  credentials or modify materials/reports. Backup errors stop cleanup.
- The helper's three offline tests pass: selective removal/preservation and
  repeat safety, busy/backup refusal, and concurrent-change refusal. Chrome
  storage has no atomic compare-and-set, so AI must remain idle throughout.
 - The acceptance console result confirms two tagged T1 entries were removed and
   read-back verification succeeded.
- Code and stored-analysis rollback are verified. Final note-page refresh is a
  user-side step; do not repeat cleanup or remove the retained backup.

## Review

### Task
- Objective: Honor the agreed rollback after an unsuccessful real trial.
- Evidence: Latest theme-2 error screenshot, exact pre-trial backups and code diff.

### Result
- Outcome: Code rollback verified locally; browser cleanup verified by the user's console output.
- What worked: Narrow reversible file restoration and baseline test verification.
- What failed: A deterministic title-citation fixture did not predict the real
  model's per-theme references; 277 tests did not constitute browser acceptance.
- Confidence: Verified for code restoration and the cleanup script's successful
  read-back result; successful report generation is not established.

### Analysis
- Error class: Validation Error.
- Root cause: The failed theme's referenced evidence did not pass numeric
  validation. Whether it omitted T1, cited a different material, or failed for
  another output-specific reason is not established without the actual response.
- Missing information: The exact failed theme text and citation mapping.

### Next-Time Rules
- Complete rollback before another repair.
- Capture and replay an actual failing model response with its request/evidence.
- Separate evidence availability from each statement's citation selection;
  neither a prompt change nor a successful synthetic fixture proves both work.

### Durable Lesson
- Keep: Reversible experiments and real-output replay.
- Avoid: Further relaxation of numeric validation based only on error labels.
- Store: `learning/findings.md`, 2026-09-10 title-evidence trial entry.

### Closure
- New lesson: Retain the actual failed response, not only the storage snapshot,
  when debugging model-created per-statement citation mappings.
- Repeated lesson: Automated test success is not real-provider acceptance.

## Browser Acceptance

1. Reload the existing unpacked Shiji extension in `edge://extensions`.
2. Refresh the Xiaohongshu page and reopen Shiji.
3. Keep the same two materials and request a report once. Re-summarization is
   unnecessary for this trial because title enrichment occurs before generation.
4. A successful report should be readable, with title-derived claims citing the
   actual title and body claims resolving to their original excerpts.
5. If generation still fails, preserve its error screenshot and stop retries.
   Roll back the trial before investigating another design.

## Rollback Scope

Pre-trial copies are in `tmp/rollback-2026-09-10-title-evidence/`, relative to the
extension project. Restore only the matching files after checking for any later
user edits:

- `src/direct-ai-client.js`
- `src/direct-report-validator.js`
- `src/background.js`
- `src/background-bundle.js`
- `tests/direct-evidence-flow.test.js`
- `tests/brief-compatibility.test.js`
- `tests/background-evidence-migration.test.js`

Move the newly added `tests/title-evidence.test.js` into the trial backup directory
to retain it without running new expectations against the old implementation.
Retain this release record and the design/plan as investigation history.

Browser cleanup is also needed if a trial report or summary request persisted
T1. While all AI work is idle, back up `xhsAnalysisState`, then remove only entries
whose `id === 'T1' && sourceField === 'title'` from its records' brief evidence.
Preserve body evidence, summary fields, statuses and all other storage keys.
Recheck that analysis state did not change before writing. Never use
`chrome.storage.local.clear()` or remove the extension: those would destroy data
outside this trial. Do not read or change provider settings to perform rollback.

Reload the restored extension and note page. Existing source material and
credentials remain intact. Stored reports are retained, although trial-only T1
references are unavailable in the old reader. Do not claim rollback is complete
until both code and any persisted trial evidence have been checked.
