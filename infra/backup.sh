#!/usr/bin/env sh
# Nightly PostgreSQL backup to off-server object storage, run from the host's crontab:
#   15 3 * * * BACKUP_REMOTE=r2:gatepass-backups /home/ubuntu/gatepass/infra/backup.sh >> /var/log/gatepass/backup.log 2>&1
# Alloy ships /var/log/gatepass/backup.log to Loki, and an alert fires when no
# "backup ok" line arrives for 26 hours. Restore steps are in infra/runbook.md.
set -eu

cd "$(dirname "$0")/.."
REMOTE="${BACKUP_REMOTE:?set BACKUP_REMOTE to an rclone remote and path, for example r2:gatepass-backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
COMPOSE="docker compose -f ${BACKUP_COMPOSE_FILE:-compose.prod.yaml}"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
fail() {
  echo "$(now) backup failed: $*"
  exit 1
}

name="gatepass-$(date -u +%Y%m%dT%H%M%SZ).dump"
file="$(mktemp)"
trap 'rm -f "$file"' EXIT

# Custom format is compressed and lets pg_restore pick tables or run in parallel.
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file" || fail "pg_dump exited $?"
bytes="$(wc -c < "$file" | tr -d ' ')"
[ "$bytes" -gt 1024 ] || fail "dump is only $bytes bytes"

rclone copyto "$file" "$REMOTE/$name" || fail "upload exited $?"
rclone delete "$REMOTE" --min-age "${KEEP_DAYS}d" || echo "$(now) backup warning: pruning old dumps failed"

echo "$(now) backup ok file=$name bytes=$bytes"
