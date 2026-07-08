# Runbooks

Operational playbooks for production incidents. Keep these short, specific, and tested.

## Index

| File                                                         | When to use                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| [`r2-backup-setup.md`](r2-backup-setup.md)                   | First-time R2 + Litestream wiring; quarterly restore drill      |
| [`pb-down.md`](pb-down.md)                                   | PocketBase API returning 5xx or unreachable                     |
| [`db-restore.md`](db-restore.md)                             | Restore SQLite from R2 (emergency or drill)                     |
| [`customer-locked-out.md`](customer-locked-out.md)           | A dealer user can't log in or has lost their dealer association |
| [`oom.md`](oom.md)                                           | Fly machine OOM-killed or trending toward it                    |
| [`ai-rate-limit.md`](ai-rate-limit.md)                       | One or more AI providers returning 429 or sustained errors      |
| [`secrets-rotation.md`](secrets-rotation.md)                 | Quarterly rotation of API tokens / passwords                    |
| [`breach-incident-response.md`](breach-incident-response.md) | Security incident, breach, data exfil, anomalous audit_log      |
| [`dealer-offboarding.md`](dealer-offboarding.md)             | Dealer cancellation, data export + GDPR-style deletion request  |

Also available: `wire-sentry-and-r2.sh` (one-time secret wiring helper).

## CI Integration (see .github/workflows/check.yml)

- Runs on PR/push: type-check, lint, unit test, `npm run test:coverage` (v8 thresholds + artifact), `npm audit`, safe-fix dry-run report, e2e (Playwright + report artifact).
- Audit hygiene + coverage gates are part of ongoing ops (cross-ref `secrets-rotation.md`).

## Conventions

Every runbook follows the same shape:

1. **Symptom** — how you noticed
2. **Triage** — 60-second commands to confirm what's broken
3. **Recovery** — minimal steps to restore service
4. **Root-cause investigation** — what to dig into after the fire is out
5. **Prevention** — what to add to make this not happen again
