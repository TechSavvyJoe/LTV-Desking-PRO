# Runbook — Restore SQLite DB from R2

## Symptom

- Volume on the Fly machine is corrupted or lost
- PB starts but with empty `_collections` and `_migrations`
- Confirmed via `sqlite3 /pb/pb_data/data.db 'select count(*) from dealers'` returning 0 against a known-non-empty production

## Triage (60 seconds)

```bash
# Confirm R2 has a recent backup
gh workflow run fly-diag.yml
# Look in artifact for: level=INFO msg="snapshot written" within the last 24h
```

## Recovery

### Option A — Same machine, replace the volume

```bash
# 1. Take the app offline so writes can't happen mid-restore
fly scale count 0 -a ltv-desking-pro-api

# 2. Identify and destroy the broken volume
fly volumes list -a ltv-desking-pro-api
fly volumes destroy <volume-id> -a ltv-desking-pro-api

# 3. Create a fresh empty volume of the same size
fly volumes create ltv_desking_data --size 1 --region ord -a ltv-desking-pro-api

# 4. Scale back up. start.sh detects empty volume → runs
#    `litestream restore -if-replica-exists` automatically before booting PB.
fly scale count 1 -a ltv-desking-pro-api

# 5. Confirm restore landed
fly logs -a ltv-desking-pro-api | grep -E "Restore succeeded|snapshot|generations"
```

Expected RTO: 5–15 min depending on DB size.

### Option B — Restore to a scratch app (drill or forensic)

See [`r2-backup-setup.md`](r2-backup-setup.md) → "Verifying a restore."

## Root cause

Document what caused the volume loss:

- Hardware failure on the Fly host?
- Operator error (`fly volumes destroy` on the wrong volume)?
- Filesystem corruption mid-write (e.g., during an OOM kill)?

Open a GH issue with the timeline. The latter two suggest adding `fly volumes` permission gates or sigterm handling in PB.

## Prevention

- Litestream replicating every 10s (already on)
- 14-day point-in-time recovery retention (already on)
- Quarterly restore drill (see `r2-backup-setup.md`)
- Off-site backup verification — at least one drill per quarter must restore on a different Fly machine

## How the restore knows what to fetch

Litestream stores generations under `s3://ltv-desking-pro-backups/data.db/generations/<gen-id>/`. The latest generation is found via the bucket listing. If multiple generations exist (e.g., after a previous restore created a new chain), Litestream picks the most recent by default.
