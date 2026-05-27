#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/truyenfullvn/postgres}"
LOG_DIR="${LOG_DIR:-/var/log/truyenfullvn}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_PREFIX="${BACKUP_PREFIX:-truyenfullvn_postgres}"
DATABASE_URL="${DATABASE_URL:-}"
PGDATABASE="${PGDATABASE:-truyenfullvn}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
LOCK_FILE="${LOCK_FILE:-/tmp/truyenfullvn-postgres-backup.lock}"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

LOG_FILE="$LOG_DIR/postgres-backup.log"
BACKUP_FILE="$BACKUP_DIR/${BACKUP_PREFIX}_${TIMESTAMP}.sql.gz"

log() {
  printf '%s [%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$SCRIPT_NAME" "$*" | tee -a "$LOG_FILE"
}

fail() {
  log "ERROR: $*"
  exit 1
}

cleanup_lock() {
  rm -f "$LOCK_FILE"
}

trap cleanup_lock EXIT
trap 'fail "Backup failed at line $LINENO."' ERR

command -v pg_dump >/dev/null 2>&1 || fail "pg_dump is not installed."
command -v gzip >/dev/null 2>&1 || fail "gzip is not installed."
command -v find >/dev/null 2>&1 || fail "find is not installed."

if [[ -e "$LOCK_FILE" ]]; then
  fail "Another backup appears to be running: $LOCK_FILE"
fi

printf '%s\n' "$$" > "$LOCK_FILE"

log "Starting PostgreSQL backup."
log "Backup target: $BACKUP_FILE"

if [[ -n "$DATABASE_URL" ]]; then
  pg_dump --no-owner --no-acl "$DATABASE_URL" | gzip -9 > "$BACKUP_FILE"
else
  pg_dump \
    --no-owner \
    --no-acl \
    --host="$PGHOST" \
    --port="$PGPORT" \
    --username="$PGUSER" \
    --dbname="$PGDATABASE" | gzip -9 > "$BACKUP_FILE"
fi

if [[ ! -s "$BACKUP_FILE" ]]; then
  rm -f "$BACKUP_FILE"
  fail "Backup file is empty."
fi

chmod 600 "$BACKUP_FILE"
log "Backup complete: $(du -h "$BACKUP_FILE" | awk '{print $1}')"

if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [[ "$RETENTION_DAYS" -gt 0 ]]; then
  deleted_count="$(
    find "$BACKUP_DIR" -type f -name "${BACKUP_PREFIX}_*.sql.gz" -mtime +"$RETENTION_DAYS" -print -delete | wc -l
  )"
  log "Retention cleanup complete. Deleted $deleted_count old backup(s)."
else
  log "Retention cleanup skipped because RETENTION_DAYS is invalid: $RETENTION_DAYS"
fi

log "PostgreSQL backup finished successfully."
