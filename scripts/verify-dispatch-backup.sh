#!/usr/bin/env bash
# Restore a Render PostgreSQL directory-format backup into a disposable local database.
# Usage: ./scripts/verify-dispatch-backup.sh /secure/path/backup.dir.gz
set -euo pipefail
backup="${1:?Pass the path to the Render .dir.gz backup}"
command -v pg_restore >/dev/null || { echo "pg_restore is required" >&2; exit 1; }
command -v initdb >/dev/null || { echo "initdb is required" >&2; exit 1; }
command -v pg_ctl >/dev/null || { echo "pg_ctl is required" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql is required" >&2; exit 1; }
work="$(mktemp -d)"
cleanup() { pg_ctl -D "$work/pgdata" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
mkdir "$work/archive"
tar -xzf "$backup" -C "$work/archive"
pg_restore --list "$work/archive" >/dev/null
initdb -D "$work/pgdata" -A trust -U postgres >/dev/null
pg_ctl -D "$work/pgdata" -o "-c listen_addresses='' -c unix_socket_directories=$work" -l "$work/postgres.log" start >/dev/null
export PGHOST="$work" PGUSER=postgres
createdb restore_verification
pg_restore --no-owner --no-acl -d restore_verification "$work/archive"
psql -d restore_verification -v ON_ERROR_STOP=1 -c "SELECT 'dispatch_trips' AS table_name, count(*) FROM public.dispatch_trips UNION ALL SELECT 'dispatch_drivers', count(*) FROM public.dispatch_drivers;"
echo "RESTORE_VERIFIED: isolated PostgreSQL restoration completed; production untouched."
