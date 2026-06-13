#!/bin/sh
# Wrapper that boots PocketBase, optionally under Litestream replication.
#
# Litestream lives at /pb/litestream (not on PATH). PocketBase lives at
# /pb/pocketbase. Always use absolute paths.
#
# We deliberately do NOT use `set -e`. A non-fatal Litestream warning should
# never take down PocketBase, so we handle errors explicitly with `|| true`
# and `timeout` so the wrapper can never hang the container.
#
# This script is POSIX shell — Alpine's /bin/sh is busybox ash, so no
# bash-specific features (no `wait -n`, no arrays).

DATA_DIR="/pb/pb_data"
DB_PATH="$DATA_DIR/data.db"
PB_BIN="/pb/pocketbase"
LITESTREAM_BIN="/pb/litestream"

log() { printf "[start] %s\n" "$*"; }

run_pb_plain() {
  log "Booting plain PocketBase (no replication)."
  exec "$PB_BIN" serve \
    --http=0.0.0.0:8080 \
    --dir="$DATA_DIR" \
    --migrationsDir=/pb/pb_migrations \
    --hooksDir=/pb/pb_hooks
}

# Sanity check on the Litestream binary itself.
if [ ! -x "$LITESTREAM_BIN" ]; then
  log "Litestream binary missing or not executable at $LITESTREAM_BIN — falling back to plain PocketBase."
  run_pb_plain
fi

# If R2 creds are missing, bypass Litestream entirely.
if [ -z "$LITESTREAM_ACCESS_KEY_ID" ] || [ -z "$LITESTREAM_BUCKET" ]; then
  log "LITESTREAM_* secrets not set — running PocketBase without replication."
  run_pb_plain
fi

# If the DB doesn't exist on the volume but a backup may exist in R2,
# attempt a restore. `timeout 30s` ensures we never hang the container.
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
  log "No data.db on volume — attempting Litestream restore from R2 (30s budget)…"
  if timeout 30s "$LITESTREAM_BIN" restore -if-replica-exists \
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

# Start Litestream as a child; PB in the foreground. If PB exits, kill
# Litestream so Fly notices the machine is down and restarts the whole
# container (rather than running a zombie Litestream against no DB).
log "Booting PocketBase under Litestream replication."

"$LITESTREAM_BIN" replicate -config /pb/litestream.yml &
LS_PID=$!
log "Litestream started (pid=$LS_PID)."

# Clean up Litestream on SIGINT/SIGTERM.
trap 'log "Signal received, stopping Litestream."; kill $LS_PID 2>/dev/null; exit' INT TERM

# PB in the foreground — when it exits, kill Litestream and propagate code.
"$PB_BIN" serve \
  --http=0.0.0.0:8080 \
  --dir="$DATA_DIR" \
  --migrationsDir=/pb/pb_migrations \
  --hooksDir=/pb/pb_hooks
PB_EXIT=$?
log "PocketBase exited (code=$PB_EXIT). Stopping Litestream."
kill $LS_PID 2>/dev/null
exit "$PB_EXIT"
