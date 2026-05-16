#!/bin/sh
set -e

# Wrapper script that boots PocketBase under Litestream when R2 replication
# is configured, and falls back to plain PB if not. This keeps local dev /
# fresh-environment bring-up working without forcing every operator to wire
# Cloudflare R2 first.

DATA_DIR="/pb/pb_data"
DB_PATH="$DATA_DIR/data.db"

run_pb() {
  exec /pb/pocketbase serve \
    --http=0.0.0.0:8080 \
    --dir="$DATA_DIR" \
    --migrationsDir=/pb/pb_migrations \
    --hooksDir=/pb/pb_hooks
}

# If R2 creds are missing, bypass Litestream entirely.
if [ -z "$LITESTREAM_ACCESS_KEY_ID" ] || [ -z "$LITESTREAM_BUCKET" ]; then
  echo "[start] LITESTREAM_* secrets not set — running PocketBase without replication."
  run_pb
fi

# If the DB doesn't exist on the volume but a backup exists in R2, restore
# it before booting. This is the warm-standby / disaster-recovery path.
if [ ! -f "$DB_PATH" ]; then
  echo "[start] No data.db on volume — attempting Litestream restore from R2…"
  litestream restore -if-replica-exists -config /pb/litestream.yml "$DB_PATH" || \
    echo "[start] No replica found in R2 — starting with fresh DB."
fi

echo "[start] Booting PocketBase under Litestream replication."
exec litestream replicate -config /pb/litestream.yml -exec "/pb/pocketbase serve \
  --http=0.0.0.0:8080 \
  --dir=$DATA_DIR \
  --migrationsDir=/pb/pb_migrations \
  --hooksDir=/pb/pb_hooks"
