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
- **`Litestream is missing` / missing `LITESTREAM_*` settings** — startup fails closed. Run `gh workflow run recover-fly.yml` only for an emergency, explicitly monitored no-backup recovery.
- **No machine output at all** — possible Fly host or volume issue. Do not
  destroy the only machine or volume. Record both IDs, then follow
  [`db-restore.md`](db-restore.md) to build and validate a replacement while
  retaining the original recovery path.

## Recovery

### A. Crash loop with Litestream errors

```bash
gh workflow run recover-fly.yml
# Wait ~60s, then:
curl -sS https://ltv-desking-pro-api.fly.dev/api/health
```

This stages removal of `LITESTREAM_*` and sets `ALLOW_NO_BACKUP=1`, then restarts
plain PocketBase. Production can return in ~60s, but it is not protected by R2.
Repair R2 and run `gh workflow run set-fly-secrets.yml` immediately; that workflow
restores the settings and resets `ALLOW_NO_BACKUP=0`.

### B. Crash loop with PB migration errors

The deploy must have shipped a broken migration. Roll the image back:

```bash
# From the repository root, find and copy the previous good image reference.
fly releases --app ltv-desking-pro-api --image

# Redeploy that immutable image. Fly has no `releases rollback` command.
fly deploy --app ltv-desking-pro-api \
  --config backend/fly.toml \
  --image registry.fly.io/ltv-desking-pro-api:<previous-image-tag> \
  --strategy rolling

curl -fsS https://ltv-desking-pro-api.fly.dev/api/health
```

This rolls back the machine image, not SQLite migrations or current Fly secrets.
Then fix the migration in a follow-up PR.

> **Warning — rollback also rolls back `pb_hooks`.** The image bundles the hook
> files, and `authorization_rules.pb.js` reasserts collection rules at runtime
> (bootstrap + per-minute cron). Rolling back to an older image therefore
> quietly reasserts that image's OLD authorization rules within a minute of
> boot. After any rollback, re-deploy the current image promptly, or manually
> verify collection rules in the PB admin UI against the current
> `authorization_rules.pb.js` contract. The backend release workflow runs
> `validate-migrations` against an empty data directory and blocks the production
> deploy when the same startup failure is reproducible.

### C. Machine fine but `/api/health` slow

Probably DB lock contention or a runaway query. SSH in and check:

```bash
fly ssh console -a ltv-desking-pro-api \
  -C "ls -lh /pb/pb_data/data.db* && ps -o pid,ppid,args"
```

If that hangs, use `fly logs` and the read-only isolated check in
[`r2-backup-setup.md`](r2-backup-setup.md). Do not run an ad hoc SQLite write or
replace the live database in place. Look for long-running PB hooks;
`pb_hooks/log.pb.js` should log requests over 500 ms.

## Root cause

After service is restored:

- Pull the full `fly logs` for the incident window
- Check Sentry for correlated errors
- Open a GH issue with the log artifact attached
- Add a regression test to `validate-migrations` if it was a migration issue

## Prevention

- Fly health check (already configured, 30 s interval)
- Validate-migrations CI gate (already configured)
- `recover-fly.yml` workflow (already configured) — explicit emergency bypass, never a silent fallback
