#!/bin/sh
# Wrapper that boots PocketBase, optionally under Litestream replication.
#
# Litestream lives at /pb/litestream (not on PATH). PocketBase lives at
# /pb/pocketbase. Always use absolute paths.
#
# We deliberately do not use `set -e`; restore failures need the explicit
# fail-closed handling below. Once replication starts, Litestream supervises
# PocketBase so a real replication-process failure restarts the container.
#
# This script is POSIX shell — Alpine's /bin/sh is busybox ash, so no
# bash-specific features (no `wait -n`, no arrays).

DATA_DIR="/pb/pb_data"
DB_PATH="$DATA_DIR/data.db"
PB_BIN="/pb/pocketbase"
LITESTREAM_BIN="/pb/litestream"

log() { printf "[start] %s\n" "$*"; }

run_pb_plain() {
  log "WARNING: Booting plain PocketBase because ALLOW_NO_BACKUP=1 is set."
  exec "$PB_BIN" serve \
    --http=0.0.0.0:8080 \
    --dir="$DATA_DIR" \
    --migrationsDir=/pb/pb_migrations \
    --hooksDir=/pb/pb_hooks \
    --hooksWatch=false
}

# Sanity check on the Litestream binary itself.
if [ ! -x "$LITESTREAM_BIN" ]; then
  log "FATAL: Litestream is missing or not executable at $LITESTREAM_BIN."
  if [ "$ALLOW_NO_BACKUP" = "1" ]; then
    run_pb_plain
  fi
  exit 1
fi

# Production must never serve while silently unprotected. Check every required
# R2 setting by name without printing values. ALLOW_NO_BACKUP=1 remains a
# deliberate local/emergency escape hatch and should never be left set on Fly.
MISSING_LITESTREAM=""
[ -z "$LITESTREAM_ACCESS_KEY_ID" ] && MISSING_LITESTREAM="$MISSING_LITESTREAM LITESTREAM_ACCESS_KEY_ID"
[ -z "$LITESTREAM_SECRET_ACCESS_KEY" ] && MISSING_LITESTREAM="$MISSING_LITESTREAM LITESTREAM_SECRET_ACCESS_KEY"
[ -z "$LITESTREAM_BUCKET" ] && MISSING_LITESTREAM="$MISSING_LITESTREAM LITESTREAM_BUCKET"
[ -z "$LITESTREAM_ENDPOINT" ] && MISSING_LITESTREAM="$MISSING_LITESTREAM LITESTREAM_ENDPOINT"
if [ -n "$MISSING_LITESTREAM" ]; then
  log "FATAL: Required backup settings are missing:$MISSING_LITESTREAM"
  if [ "$ALLOW_NO_BACKUP" = "1" ]; then
    run_pb_plain
  fi
  exit 1
fi

# If the DB doesn't exist on the volume but a backup may exist in R2,
# attempt a restore. `timeout 300s` ensures we never hang the container
# indefinitely while still leaving room for a full-size database download —
# this path only runs during disaster recovery, when the DB is largest.
#
# SAFETY (G51): if no data.db exists after the restore attempt (restore
# failed, timed out, or found no replica) we REFUSE to boot. Booting
# PocketBase here would create a brand-new EMPTY database, and Litestream
# would immediately replicate it to R2 as the NEWEST backup generation —
# burying the real backup. Exiting non-zero lets Fly health checks flag
# the machine instead.
#
# Escape hatch: set ALLOW_FRESH_DB=1 to permit booting with a fresh empty
# database. This is ONLY for a deliberate first boot of a brand-new
# environment that has no backup to restore (e.g.
# `fly secrets set ALLOW_FRESH_DB=1`, boot once, then unset it).
if [ ! -f "$DB_PATH" ]; then
  log "No data.db on volume — attempting Litestream restore from R2 (300s budget)…"
  if timeout 300s "$LITESTREAM_BIN" restore -if-replica-exists -integrity-check quick \
       -config /pb/litestream.yml "$DB_PATH" && [ -f "$DB_PATH" ]; then
    log "Restore succeeded."
  elif [ "$ALLOW_FRESH_DB" = "1" ]; then
    log "WARNING: restore failed or no replica found, but ALLOW_FRESH_DB=1 is set."
    log "WARNING: Starting with a fresh EMPTY DB — Litestream will replicate it to R2 as the newest generation."
  else
    log "FATAL ============================================================"
    log "FATAL Litestream restore FAILED (or no replica found) and no"
    log "FATAL data.db exists on the volume. Refusing to boot PocketBase:"
    log "FATAL doing so would create an EMPTY database and Litestream would"
    log "FATAL replicate it to R2 as the NEWEST backup generation, burying"
    log "FATAL the real backup."
    log "FATAL"
    log "FATAL If this is a deliberate first boot of a brand-new environment"
    log "FATAL with no backup to restore, set ALLOW_FRESH_DB=1 and redeploy."
    log "FATAL Otherwise check R2 credentials/bucket and see"
    log "FATAL docs/runbooks/db-restore.md."
    log "FATAL ============================================================"
    exit 1
  fi
fi

# Litestream supervises PocketBase. If either process fails the container exits,
# allowing Fly to restart it instead of serving without continuous backups.
log "Booting PocketBase under supervised Litestream replication."
PB_COMMAND="$PB_BIN serve --http=0.0.0.0:8080 --dir=$DATA_DIR --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks --hooksWatch=false"
exec "$LITESTREAM_BIN" replicate -config /pb/litestream.yml -exec "$PB_COMMAND"
