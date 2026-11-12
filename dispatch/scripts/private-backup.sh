#!/usr/bin/env bash
# Private one-time backup + restore check. Does not delete dispatch data.
set -Eeuo pipefail
umask 077
: "${DISPATCH_DATABASE_URL:?Set private source database URL}"
: "${DISPATCH_RESTORE_DATABASE_URL:?Set separate disposable restore database URL}"
: "${DISPATCH_BACKUP_DIR:?Set durable private backup directory}"
command -v pg_dump >/dev/null
command -v pg_restore >/dev/null
command -v node >/dev/null
test "${DISPATCH_DATABASE_URL}" != "${DISPATCH_RESTORE_DATABASE_URL}"
mkdir -p "${DISPATCH_BACKUP_DIR}"
file="${DISPATCH_BACKUP_DIR}/dispatch-$(date -u +%Y%m%dT%H%M%SZ).dump"
echo "Creating private dispatch backup"
pg_dump --format=custom --no-owner --no-acl --file="$file" "$DISPATCH_DATABASE_URL"
test -s "$file"
pg_restore --list "$file" >/dev/null
echo "Backup archive verified. Restore target MUST be disposable and empty."
# No automatic restore: pg_restore may overwrite or conflict with existing data.
# Operator must independently verify the disposable target is empty before running:
# pg_restore --exit-on-error --no-owner --no-acl --dbname="$DISPATCH_RESTORE_DATABASE_URL" "$file"
# node dispatch/scripts/verify-restore.js
echo "Backup complete; restore NOT executed; cleanup NOT executed."
