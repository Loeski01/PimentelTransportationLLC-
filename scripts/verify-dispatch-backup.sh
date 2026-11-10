#!/usr/bin/env bash
# Restore a Render directory-format archive into a disposable local PostgreSQL instance.
# Run as an unprivileged OS user on a machine with PostgreSQL server tools installed.
# Usage: bash scripts/verify-dispatch-backup.sh /secure/path/backup.dir.gz
set -euo pipefail
backup="${1:?Provide the path to the Render backup}"
[[ -f "$backup" ]] || { echo "Backup not found" >&2; exit 1; }
[[ "$(id -u)" -ne 0 ]] || { echo "Run as an unprivileged user (PostgreSQL refuses root)" >&2; exit 1; }
for cmd in tar pg_restore initdb pg_ctl psql createdb; do
  command -v "$cmd" >/dev/null || { echo "Missing $cmd" >&2; exit 1; }
done
work="$(mktemp -d)"
started=0
cleanup() {
  if [[ "$started" -eq 1 ]]; then pg_ctl -D "$work/pgdata" -m immediate stop >/dev/null 2>&1 || true; fi
  rm -rf "$work"
}
trap cleanup EXIT
mkdir "$work/extracted"
tar -xzf "$backup" -C "$work/extracted"
mapfile -d '' toc_files < <(find "$work/extracted" -type f -name toc.dat -print0)
[[ "${#toc_files[@]}" -eq 1 ]] || { echo "Expected exactly one PostgreSQL toc.dat" >&2; exit 1; }
archive_dir="$(dirname "${toc_files[0]}")"
pg_restore --list "$archive_dir" >/dev/null
initdb -D "$work/pgdata" -A trust -U postgres >/dev/null
pg_ctl -D "$work/pgdata" -o "-c listen_addresses='' -c unix_socket_directories=$work" -l "$work/postgres.log" start >/dev/null
started=1
export PGHOST="$work" PGUSER=postgres
createdb restore_verification
pg_restore --exit-on-error --no-owner --no-acl -d restore_verification "$archive_dir"
psql -d restore_verification -v ON_ERROR_STOP=1 -c "SELECT 'dispatch_trips' AS table_name, count(*) FROM public.dispatch_trips UNION ALL SELECT 'dispatch_drivers', count(*) FROM public.dispatch_drivers;"
echo "RESTORE_VERIFIED: isolated restoration completed; production untouched."
