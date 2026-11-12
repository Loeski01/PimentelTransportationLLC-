# Private Render execution checklist — Pimentel Driver

This is a preparation checklist, NOT evidence of a completed backup or cleanup.

## Scope
- Workspace: tea-dbec85m7bikc73fvfb7g
- Staging service: srv-dbhq0dui0phs73f11i60
- Isolated PostgreSQL: dpg-dbggc7ei0phs73du2q10-a (pimentel_dispatch_dev)
- Repository branch: feature/dispatch-cleanup-preflight-20261111
- Keep the public booking service srv-dbecuku7bikc7381p180 unchanged.

## Secure execution prerequisites
1. Use a private Render shell/job or another trusted runner with private network access to the dispatch database. Do not expose PostgreSQL externally or print database URLs.
2. Confirm the runner uses the isolated dispatch database, not booking/payments.
3. Install PostgreSQL client tools compatible with PostgreSQL 18; keep credentials in Render secrets.
4. Take a custom-format `pg_dump` backup and store it in a durable secure location, not ephemeral container storage.
5. Create a distinct temporary restore database; run `pg_restore --exit-on-error` and record successful exit.
6. Run `node dispatch/scripts/cleanup-preflight.js` against the original and `node dispatch/scripts/verify-restore.js` against original + restored database. Review matching schema/counts.
7. Independently verify that administrator login works on the restored environment without changing production credentials.
8. Obtain explicit IDs of all nine fictitious trips and two fictitious drivers from the authenticated admin panel; stop on any uncertainty.
9. Only then implement and review a narrowly scoped, transactional cleanup command with exact row-count assertions and rollback on mismatch.

## Stop conditions
- Restore fails, missing tables, counts mismatch, unknown record identity, active real trip, or wrong database.
- No proof of administrator access after restore.
- No trusted private runner available.

## Final acceptance
After cleanup: zero selected test IDs, admin still logs in, manual trip approval/assignment, driver PIN, milestones, 15-minute no-show, notifications, navigation and booking/payment separation all pass.

**No cleanup has been executed by this checklist.**
