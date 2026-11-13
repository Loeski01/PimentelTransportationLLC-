# Booking → Dispatch staging verification (2026-11-12)

## Environment verified
- Render workspace: My Workspace.
- Public booking service deploys from `main` with automatic deploy enabled. **Do not commit integration work to main during staging.**
- Staging dispatch service `pimentel-dispatch-oregon-staging` deploys from `feature/dispatch-security-review-20261029`; auto deploy disabled. The booking integration branch is separate and is not automatically deployed there.
- Booking staging SQL exists at `booking/migrations/001_booking_requests_staging.sql`, but is not evidence of an applied database migration.

## Required checks before deployment
1. Run all unit tests for booking mapping, transfer state, dispatch import, and service authentication. Capture exact command, output and commit SHA.
2. Verify service authentication rejects missing, malformed and incorrect credentials; do not log secrets.
3. Verify a valid booking imports as pending with no assigned driver; verify an invalid reference/date is rejected.
4. Verify repeat requests and simultaneous requests for the same reference produce exactly one dispatch trip, including after a simulated timeout/retry.
5. Verify transaction rollback leaves neither orphaned trip nor misleading transferred status.
6. Verify cancelled bookings cannot transfer and existing trips cannot be overwritten.
7. Verify only the administrator can approve and assign a driver.
8. Verify the booking inbox persists across service restarts and shows error/retry states.
9. Verify notification delivery, and ensure payment routes and existing live bookings are unchanged.
10. Run an end-to-end test with fictitious customer details on isolated staging database and staging services; document results before any production change.

## Deployment guardrails
- Do not point staging at production database or payment credentials.
- Do not enable public auto deploy of this branch.
- Do not merge into main or change public booking/payments until staging end-to-end test succeeds and the operator reviews the outcome.

## Status
Checklist prepared; these checks are **not** claimed as passed. Integration is not yet live.
