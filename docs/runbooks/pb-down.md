# Runbook — PocketBase API down

## Symptom

- `curl https://ltv-desking-pro-api.fly.dev/api/health` returns 5xx or hangs
- Vercel AI proxy logs show `auth-refresh` failures
- Sentry alerts fire for PB connection errors

## Triage (60 seconds)

```bash
# Quick state check via the diagnostic workflow
gh workflow run fly-diag.yml
# Then: gh run watch  (artifact is fly-logs.txt)

# OR direct, if your local flyctl works:
fly status -a ltv-desking-pro-api
fly logs -a ltv-desking-pro-api --no-tail | tail -100
```

Look for:

- **`max restart count of 10`** — machine is in a crash loop. See Recovery → A.
- **`reboot: Restarting system`** repeatedly — same as above.
- **`OOM kill`** — see [`oom.md`](oom.md).
- **`litestream: not found`** — Litestream wrapper bug. Run `gh workflow run recover-fly.yml` to unset LITESTREAM\_\* secrets and fall back to plain PB.
- **No machine output at all** — Fly hardware issue. Force a new machine:
  `fly machine list -a ltv-desking-pro-api` → `fly machine destroy <id>` → app autoscales a fresh one.

## Recovery

### A. Crash loop with Litestream errors

```bash
gh workflow run recover-fly.yml
# Wait ~60s, then:
curl -sS https://ltv-desking-pro-api.fly.dev/api/health
```

This unsets `LITESTREAM_*` secrets. `start.sh` falls back to plain PocketBase. Production back in ~60s.

### B. Crash loop with PB migration errors

The deploy must have shipped a broken migration. Roll the image back:

```bash
fly releases list -a ltv-desking-pro-api      # find the previous good release
fly releases rollback <version> -a ltv-desking-pro-api
```

Then fix the migration in a follow-up PR — `.github/workflows/deploy-backend-fly.yml` runs `validate-migrations` against an empty data dir before deploying, so it should catch the same error and block the merge.

### C. Machine fine but `/api/health` slow

Probably DB lock contention or a runaway query. SSH in and check:

```bash
fly ssh console -a ltv-desking-pro-api -C "sqlite3 /pb/pb_data/data.db '.tables' && echo OK"
```

If that hangs, the WAL is blocked. Look for long-running PB hooks — `pb_hooks/log.pb.js` should be logging anything > 500 ms.

## Root cause

After service is restored:

- Pull the full `fly logs` for the incident window
- Check Sentry for correlated errors
- Open a GH issue with the log artifact attached
- Add a regression test to `validate-migrations` if it was a migration issue

## Prevention

- Fly health check (already configured, 30 s interval)
- Validate-migrations CI gate (already configured)
- `recover-fly.yml` workflow (already configured) — keeps unsetting the bad secrets to under 60 seconds
