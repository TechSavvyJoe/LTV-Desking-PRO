# Runbook — Fly machine OOM

## Symptom

- Machine restarting frequently
- `fly logs` shows `Out of memory: Killed process` or `oom-killer`
- Sentry sees a wave of 5xx around the same wall-clock time
- Memory usage climbed to ~100% before the kill

## Triage (60 seconds)

```bash
gh workflow run fly-diag.yml
# Look in artifact for: "Out of memory" or "oom-killer"

# Memory headroom check via Fly metrics:
fly status -a ltv-desking-pro-api
fly machine status <machine-id> -a ltv-desking-pro-api
```

## Recovery

### Immediate: bump memory

```bash
fly scale memory 2048 -a ltv-desking-pro-api
```

Triggers a rolling restart. Production back in 30–60 s. Costs about +$4/mo per GB.

### After: identify the leak

Common culprits in this stack:

1. **AI proxy PDFs** — large base64 PDFs in memory during lender extract. Mitigation: lazy-stream, client-side compress (see §5 of `r2-backup-setup.md` cross-ref).
2. **Tesseract OCR** — 5 MB+ language data loaded in memory; should already be lazy-loaded but worth confirming.
3. **PB JSVM hooks** — a hook that retains big payloads (e.g., audit-log JSON). Check `pb_hooks/log.pb.js` doesn't accumulate.
4. **Litestream replicate buffer** — under heavy write load Litestream buffers in memory. Watch for `replicate.maxSize` warnings in `fly logs`.

## Root cause

```bash
fly ssh console -a ltv-desking-pro-api -C "free -h && ps aux --sort=-%mem | head -20"
```

The top process should be `pocketbase`. Anything else taking >100 MB is suspicious.

## Prevention

- Already on 1 GB (bumped from 512 MB)
- Bundle splitting (deferred PDF/OCR loading) reduces memory pressure on the AI proxy path
- Sentry error tracking wired (lib/sentry.ts + DSN in deploy); configure 5xx burst alert + on-call in Sentry dashboard separately (no code change needed)
