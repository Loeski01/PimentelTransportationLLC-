#!/usr/bin/env bash
set -Eeuo pipefail
# Restore ONLY to disposable test database. Never runs against production.
: "${DISPATCH_RESTORE_DATABASE_URL:?Missing test database URL}"
: "${BACKUP_ARCHIVE:?Missing private backup archive path}"
for c in psql pg_restore tar mktemp; do command -v "$c" >/dev/null || { echo "Missing $c"; exit 1; }; done
DB="$(psql "$DISPATCH_RESTORE_DATABASE_URL" -X -Atqc 'SELECT current_database()')"
[[ "$DB" == "pimentel_restore_test_20261112" ]] || { echo "STOP: unexpected destination database"; exit 2; }
[[ -f "$BACKUP_ARCHIVE" ]] || { echo "STOP: backup not available in private runner"; exit 3; }
N="$(psql "$DISPATCH_RESTORE_DATABASE_URL" -X -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
[[ "$N" == "0" ]] || { echo "STOP: test database is not empty"; exit 4; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
tar -tzf "$BACKUP_ARCHIVE" >/dev/null
tar -xzf "$BACKUP_ARCHIVE" -C "$WORK" --no-same-owner --no-same-permissions
DUMP="$(find "$WORK" -type f -name toc.dat -print -quit)"
[[ -n "$DUMP" ]] || { echo "STOP: missing PostgreSQL catalog"; exit 5; }
DUMP="${DUMP%/toc.dat}"
pg_restore --list "$DUMP" >/dev/null
pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --dbname="$DISPATCH_RESTORE_DATABASE_URL" "$DUMP"
psql "$DISPATCH_RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
echo "TEST_RESTORE_COMPLETED; compare expected table counts before enabling cleanup."
