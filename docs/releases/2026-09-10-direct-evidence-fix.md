# Direct Report Evidence Fix

## Task
- Objective: Resolve reports rejected with unknown evidence after direct-provider generation.
- Context: Connection and timeout fixes exposed a missing contract between direct summaries and reports.
- Evidence used: Browser error screenshot, direct client and validator code, failing regression tests.

## Result
- Outcome: Direct summaries now retain deterministic, verbatim evidence. Report collection fills missing evidence in selected legacy briefs and persists it for citation display.
- What worked: Tests exercise new summaries through report validation and citation resolution; legacy migration uses the real analysis repository with hash/revision checks.
- What failed: Previous tests supplied evidence manually and missed the actual summary output shape.
- Confidence: Automated coverage passes; a successful real-provider report and browser reload still require user acceptance.

## Analysis
- Error class: Validation Error.
- Root cause: The report consumer required evidence that the direct summary producer did not provide.
- Missing information: The browser's script-fetch error has no stack or timestamp in the supplied screenshot. It is not confirmed to be current or resolved.

## Next-Time Rules
- Test producer output through each consumer, including persisted older records.
- Derive evidence from original text, never from summaries or model-written quotes.
- Keep local-service mode unchanged and reject absent/stale source data rather than fabricating references.

## Durable Lesson
- Keep: End-to-end contract fixtures and original-text citation validation.
- Avoid: Treating unit-test success or model connectivity as complete report acceptance.
- Store: learning/findings.md, dated 2026-09-10.

## Closure
- New lesson: Persist migrated evidence so report references remain resolvable in the reader.
- Repeated lesson: Verify cross-module contracts, not only individual components.
- Browser check: Reload the extension and page, generate once, then expand a citation to inspect its original text. Existing sources do not need recapture unless their stored body is absent or inconsistent.
- Script check: All 14 manifest-referenced scripts exist and pass JavaScript parsing; the service-worker bundle has no runtime imports. This is not equivalent to a real browser startup check.
