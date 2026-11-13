# Booking adapter focused test run — 2026-11-12

The adapter source from the development branch was run locally with Node.js using its committed five-test suite.

Result:
- 5 passed
- 0 failed
- 0 skipped

Verified:
- Allowlisted dispatch payload contains reference, surname, pickup, destination and normalized pickup instant only.
- Boston-area Eastern time conversion for 2026-11-14 14:30 produces 2026-11-14T19:30:00.000Z.
- Missing timezone is rejected.
- Nonexistent spring-forward time (2026-03-08 02:30 America/New_York) is rejected.
- Ambiguous fall-back time (2026-11-01 01:30 America/New_York) is rejected.
- Invalid booking reference is rejected.

A regex escaping defect in the initial adapter source was found during review, corrected in commit 91131b63024813ca58ca2b5c03fa047f600404b9, and the focused tests were run against the corrected source.

Limitations:
- This is a local focused unit-test run, not a confirmed GitHub Actions workflow run.
- No PostgreSQL staging migration was applied and no Render service was changed.
- The adapter is not yet connected to the booking endpoint or admin inbox.
- No end-to-end transfer test has been run.
