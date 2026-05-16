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

### 3. Get the S3 endpoint URL

It's `https://<accountid>.r2.cloudflarestorage.com`. Find your account ID at the top right of the Cloudflare R2 dashboard.

### 4. Set Fly secrets

```bash
fly secrets set -a ltv-desking-pro-api \
  LITESTREAM_BUCKET=ltv-desking-pro-backups \
  LITESTREAM_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com \
  LITESTREAM_ACCESS_KEY_ID=<from step 2> \
  LITESTREAM_SECRET_ACCESS_KEY=<from step 2>
```

The Fly machine restarts automatically when secrets change.

### 5. Confirm replication is live

```bash
fly logs -a ltv-desking-pro-api | grep -i litestream
```

You should see lines like:

```
[start] Booting PocketBase under Litestream replication.
level=INFO msg="replicating to" path=/pb/pb_data/data.db ...
level=INFO msg="snapshot written" ... size=...
```

If you see `[start] LITESTREAM_* secrets not set` instead, one of the four secrets above is missing.

---

## Verifying a restore (do this quarterly)

The point of backups is that they restore. Verify on a scratch Fly app — never on the live one.

```bash
# 1. Create a throwaway Fly app
fly apps create ltv-desking-pro-restore-drill

# 2. Re-use the same image but a fresh volume
fly volumes create ltv_desking_data --size 1 --region ord -a ltv-desking-pro-restore-drill

# 3. Set the same R2 secrets (read-only would suffice; reuse for simplicity)
fly secrets set -a ltv-desking-pro-restore-drill \
  LITESTREAM_BUCKET=ltv-desking-pro-backups \
  LITESTREAM_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com \
  LITESTREAM_ACCESS_KEY_ID=<...> \
  LITESTREAM_SECRET_ACCESS_KEY=<...>

# 4. Deploy and verify
fly deploy -a ltv-desking-pro-restore-drill
fly logs -a ltv-desking-pro-restore-drill | head -50
# Expect: "[start] No data.db on volume — attempting Litestream restore from R2…"
# Then PocketBase should boot normally with the same data as prod.

# 5. SSH in and spot-check
fly ssh console -a ltv-desking-pro-restore-drill \
  -C "sqlite3 /pb/pb_data/data.db 'select count(*) from dealers, users, saved_deals;'"

# 6. Tear down
fly apps destroy ltv-desking-pro-restore-drill --yes
```

If step 4 doesn't show the restore line or step 5 returns zero rows, the backup chain is broken — investigate before relying on it.

---

## Emergency restore (live volume gone)

```bash
# 1. Take the app down to prevent partial writes
fly scale count 0 -a ltv-desking-pro-api

# 2. Either: create a new volume on a healthy host
fly volumes destroy <broken-volume-id>
fly volumes create ltv_desking_data --size 1 --region ord -a ltv-desking-pro-api

# 3. Bring the app back up. start.sh detects empty volume → runs
#    `litestream restore` automatically before PocketBase starts.
fly scale count 1 -a ltv-desking-pro-api

# 4. Watch logs for the restore line
fly logs -a ltv-desking-pro-api | grep -i restore
```

Expected RTO: 5–15 minutes depending on DB size.

---

## Rotating R2 credentials

Quarterly, ideally automated via a calendar reminder.

1. Create a new token in Cloudflare with the same bucket scope.
2. Set the new Fly secrets (will trigger a restart — schedule outside business hours).
3. Verify restart succeeded via `fly logs`.
4. Revoke the old token in Cloudflare.
