# Runbook — Set up Cloudflare R2 backups for PocketBase

**Goal.** Continuously replicate `/pb/pb_data/data.db` to a Cloudflare R2 bucket so a Fly volume loss doesn't lose the database. Recovery point objective: ~10 seconds (Litestream WAL streaming interval).

**Cost.** R2 storage is $0.015/GB/month with zero egress fees. A PocketBase DB at this scale will run well under $1/month.

---

## One-time setup (15 minutes)

### 1. Create an R2 bucket

```
Cloudflare dashboard → R2 → Create bucket
  Name:          ltv-desking-pro-backups
  Location hint: Automatic (or pick North America)
```

Optional but recommended:

- Enable Object versioning
- Set lifecycle rule: delete non-current versions after 90 days

### 2. Create an R2 API token

```
Cloudflare dashboard → R2 → Manage R2 API Tokens → Create API Token
  Token name:      ltv-desking-pro-litestream
  Permissions:     Object Read & Write
  Specify bucket:  ltv-desking-pro-backups   (don't grant Apply to all buckets)
  TTL:             Forever (or set a rotation reminder for 12 months)
```

Cloudflare shows the **Access Key ID** and **Secret Access Key** once. Copy both into 1Password immediately.

Create a second, bucket-scoped **Object Read only** token named
`ltv-desking-pro-restore-drill`. Store it separately as
`R2_RESTORE_ACCESS_KEY_ID` / `R2_RESTORE_SECRET_ACCESS_KEY`. Restore drills must
never receive the production read/write token.

### 3. Get the S3 endpoint URL

It's `https://<accountid>.r2.cloudflarestorage.com`. Find your account ID at the top right of the Cloudflare R2 dashboard.

### 4. Set Fly secrets

```bash
: "${R2_ACCOUNT_ID:?set the Cloudflare account ID}"
: "${R2_WRITE_ACCESS_KEY_ID:?set the R2 read/write access key ID}"
: "${R2_WRITE_SECRET_ACCESS_KEY:?set the R2 read/write secret key}"
fly secrets set -a ltv-desking-pro-api \
  LITESTREAM_BUCKET=ltv-desking-pro-backups \
  LITESTREAM_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  LITESTREAM_ACCESS_KEY_ID="$R2_WRITE_ACCESS_KEY_ID" \
  LITESTREAM_SECRET_ACCESS_KEY="$R2_WRITE_SECRET_ACCESS_KEY"
```

The Fly machine restarts automatically when secrets change.

### 5. Confirm replication is live

```bash
fly logs -a ltv-desking-pro-api | grep -i litestream
```

You should see lines like:

```
[start] Booting PocketBase under supervised Litestream replication.
level=INFO msg="replicating to" path=/pb/pb_data/data.db ...
level=INFO msg="snapshot written" ... size=...
```

If a required setting is missing, `start.sh` exits with a `FATAL` message and
Fly keeps the machine unhealthy instead of serving an unprotected database.

---

## Quarterly restore drill

The drill is isolated from Fly production and uses a read-only R2 token. It
restores to a temporary local directory, never starts PocketBase or Litestream
replication, and opens SQLite in read-only/query-only mode.

Prerequisites: Litestream `0.5.14`, `sqlite3`, and the read-only token from step 2. Export the four `R2_RESTORE_*` values from 1Password, then run:

```bash
set -euo pipefail
: "${R2_RESTORE_ACCESS_KEY_ID:?set the read-only R2 access key ID}"
: "${R2_RESTORE_SECRET_ACCESS_KEY:?set the read-only R2 secret key}"
: "${R2_RESTORE_ENDPOINT:?set the R2 endpoint URL}"
: "${R2_RESTORE_BUCKET:?set the R2 bucket name}"

DRILL_DIR=$(mktemp -d "${TMPDIR:-/tmp}/ltv-r2-restore.XXXXXX")
export DRILL_DB="$DRILL_DIR/data.db"
trap 'rm -rf "$DRILL_DIR"' EXIT

cat > "$DRILL_DIR/litestream.yml" <<'YAML'
dbs:
  - path: ${DRILL_DB}
    replica:
      type: s3
      bucket: ${R2_RESTORE_BUCKET}
      path: data.db
      endpoint: ${R2_RESTORE_ENDPOINT}
      region: auto
      access-key-id: ${R2_RESTORE_ACCESS_KEY_ID}
      secret-access-key: ${R2_RESTORE_SECRET_ACCESS_KEY}
YAML

litestream restore \
  -config "$DRILL_DIR/litestream.yml" \
  -integrity-check full \
  "$DRILL_DB"
test -s "$DRILL_DB"

sqlite3 -readonly "$DRILL_DB" <<'SQL'
PRAGMA query_only = ON;
PRAGMA integrity_check;
SELECT 'dealers', COUNT(*) FROM dealers
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'saved_deals', COUNT(*) FROM saved_deals;
SQL
```

Require `PRAGMA integrity_check` to return `ok` and compare the record counts
with a known production checkpoint. A zero count can be legitimate for a new
tenant, so investigate unexpected deltas rather than relying on a blanket
nonzero test. Record the restored transaction ID/time and counts in the
quarterly operations issue.

---

## Emergency restore

Follow [`db-restore.md`](db-restore.md). It creates and validates a replacement
volume while retaining the stopped original machine and volume. Never destroy
the only volume to make room for a restore.

---

## Rotating R2 credentials

Quarterly, ideally automated via a calendar reminder.

1. Create a new read/write token in Cloudflare with the same single-bucket scope.
2. Set the new Fly secrets (the machine restarts; schedule outside business hours).
3. Verify health and a new Litestream snapshot before revoking the old token.
4. Rotate the separate read-only restore token and rerun the quarterly drill.
