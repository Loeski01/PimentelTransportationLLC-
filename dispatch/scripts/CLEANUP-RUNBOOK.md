# Pimentel Driver — controlled test-data cleanup runbook

Status: NOT EXECUTED. Never run against the booking/payment database.

## Preconditions (all mandatory)
1. Confirm the exact Render service and database by ID, not just a display name.
2. Create a PostgreSQL backup with `pg_dump -Fc` using the private Render connection. Store it securely outside the running instance.
3. Restore that backup into a separate disposable PostgreSQL database using `pg_restore`. Verify table counts, administrator login on the restored copy, and that the restore process exits successfully. A successful dump alone is NOT enough.
4. Run `node dispatch/scripts/cleanup-preflight.js` from the Render private network; record the returned counts. Do not print customer data or credentials.
5. Confirm the IDs of ALL nine test trips and BOTH test drivers from the administrator's authenticated view. If any record might be real, stop.
6. Confirm there are no in-progress real trips and temporarily prevent new dispatch writes while cleaning.

## Transaction plan (review, do not execute as written)
Use a single PostgreSQL transaction and explicitly scoped IDs, never a blanket `TRUNCATE` or unqualified `DELETE`.
- Lock and recheck selected rows and foreign-key dependencies.
- Delete `dispatch_admin_notifications` referencing selected trip IDs or selected driver IDs.
- Delete `dispatch_trip_audit` referencing selected trip IDs.
- Delete only the confirmed nine `dispatch_trips`.
- Delete only the confirmed two `dispatch_drivers`, after verifying no remaining trips reference them.
- Check expected affected row counts exactly (9 trips, 2 drivers); on mismatch ROLLBACK.
- COMMIT only when all assertions pass.
- Never modify session secrets, administrator credentials, booking tables, payment tables, or production environment variables.

## Postconditions
- Confirm no test trip/driver IDs remain; audit/notifications for those trips are gone.
- Verify administrator login, driver registration/login, trip approval, manual assignment, driver statuses, 15-minute no-show policy, navigation, and admin notifications.
- Verify booking website and payments independently.
- Record rollback procedure using the verified backup; only declare ready for real clients after end-to-end acceptance tests.

## Current limitation
Render's external SQL connector cannot reach the database because the external IP allowlist is empty. The running staging service can connect privately. No available Render action here executes a one-off shell command or database backup/restore, so these steps require an authorized private execution environment. Do not weaken the IP allowlist.
