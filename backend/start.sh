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
RESTORE_PATH="$DATA_DIR/data.db.restore"
PB_BIN="/pb/pocketbase"
LITESTREAM_BIN="/pb/litestream"

log() { printf "[start] %s\n" "$*"; }

run_pb_plain() {
  log "WARNING: Booting plain PocketBase because ALLOW_NO_BACKUP=1 is set."
  exec /usr/bin/env GOMEMLIMIT=512MiB "$PB_BIN" serve \
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
  # Litestream renames its output before checking integrity. Cancellation
  # during that check can leave the output behind (v0.5.14 replica.go).
  # Restore to a separate candidate, then publish it only after success, so a
  # timeout/crash can never make the next boot trust an unvalidated data.db.
  # A leftover candidate belongs only to this interrupted restore attempt.
  rm -f "$RESTORE_PATH" "$RESTORE_PATH.tmp" "$RESTORE_PATH-wal" "$RESTORE_PATH-shm"
  log "No data.db on volume — attempting Litestream restore from R2 (300s budget)…"
  if timeout 300s "$LITESTREAM_BIN" restore -if-replica-exists -integrity-check quick \
       -config /pb/litestream.yml -o "$RESTORE_PATH" "$DB_PATH" && [ -s "$RESTORE_PATH" ]; then
    if ! mv "$RESTORE_PATH" "$DB_PATH"; then
      log "FATAL: Could not publish the validated restore candidate."
      exit 1
    fi
    log "Restore succeeded."
  elif [ "$ALLOW_FRESH_DB" = "1" ]; then
    rm -f "$RESTORE_PATH" "$RESTORE_PATH.tmp" "$RESTORE_PATH-wal" "$RESTORE_PATH-shm"
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

# Limit only PocketBase's Go-managed memory; Litestream keeps its own environment.
# This is a soft GC target, not a cap on the entire 1 GiB machine. Keep GOGC default.
# Litestream parses -exec as argv, so use env rather than a shell assignment.
# Litestream supervises PocketBase's process. Remote sync failures can retry
# while both processes remain alive; backup freshness needs separate monitoring.
log "Booting PocketBase under supervised Litestream replication."
PB_COMMAND="/usr/bin/env GOMEMLIMIT=512MiB $PB_BIN serve --http=0.0.0.0:8080 --dir=$DATA_DIR --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks --hooksWatch=false"
exec "$LITESTREAM_BIN" replicate -config /pb/litestream.yml -exec "$PB_COMMAND"
