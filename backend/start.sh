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
if [ ! -f "$DB_PATH" ]; then
  log "No data.db on volume — attempting Litestream restore from R2 (30s budget)…"
  if timeout 30s "$LITESTREAM_BIN" restore -if-replica-exists \
       -config /pb/litestream.yml "$DB_PATH"; then
    log "Restore succeeded."
  else
    log "No replica found (or restore failed) — starting with fresh DB."
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
