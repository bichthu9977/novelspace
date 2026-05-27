#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/truyenfullvn/postgres}"
LOG_DIR="${LOG_DIR:-/var/log/truyenfullvn}"
DATABASE_URL="${DATABASE_URL:-}"
PGDATABASE="${PGDATABASE:-truyenfullvn}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"

LOG_FILE="$LOG_DIR/postgres-restore.log"

log() {
  printf '%s [%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$SCRIPT_NAME" "$*" | tee -a "$LOG_FILE"
}

fail() {
  log "ERROR: $*"
  exit 1
}

usage() {
  cat <<EOF
Usage:
  BACKUP_FILE=/path/to/backup.sql.gz $0
  $0 /path/to/backup.sql.gz

Required:
  BACKUP_FILE or first positional argument.

Config:
  DATABASE_URL     Full PostgreSQL connection URL. Preferred when available.
  PGHOST          Default: 127.0.0.1
  PGPORT          Default: 5432
  PGUSER          Default: postgres
  PGDATABASE      Default: truyenfullvn
  LOG_DIR         Default: /var/log/truyenfullvn
  BACKUP_DIR      Default: /var/backups/truyenfullvn/postgres
EOF
}

BACKUP_FILE="${1:-${BACKUP_FILE:-}}"

if [[ -z "$BACKUP_FILE" ]]; then
  usage
  exit 2
fi

mkdir -p "$LOG_DIR"

if [[ "$BACKUP_FILE" != /* ]]; then
  BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILE"
fi

[[ -f "$BACKUP_FILE" ]] || fail "Backup file not found: $BACKUP_FILE"
[[ -s "$BACKUP_FILE" ]] || fail "Backup file is empty: $BACKUP_FILE"

command -v psql >/dev/null 2>&1 || fail "psql is not installed."
command -v gzip >/dev/null 2>&1 || fail "gzip is not installed."

log "Preparing to restore backup: $BACKUP_FILE"
log "This will write SQL into the configured PostgreSQL database."

if [[ "${RESTORE_CONFIRM:-}" != "yes" ]]; then
  read -r -p "Type RESTORE to continue: " confirmation
  [[ "$confirmation" == "RESTORE" ]] || fail "Restore cancelled."
fi

if [[ -n "$DATABASE_URL" ]]; then
  gzip -dc "$BACKUP_FILE" | psql "$DATABASE_URL"
else
  gzip -dc "$BACKUP_FILE" | psql \
    --host="$PGHOST" \
    --port="$PGPORT" \
    --username="$PGUSER" \
    --dbname="$PGDATABASE"
fi

log "PostgreSQL restore finished successfully."
