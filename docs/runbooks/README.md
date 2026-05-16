# Runbooks

Operational playbooks for production incidents. Keep these short, specific, and tested.

## Index

| File                                               | When to use                                                     |
| -------------------------------------------------- | --------------------------------------------------------------- |
| [`r2-backup-setup.md`](r2-backup-setup.md)         | First-time R2 + Litestream wiring; quarterly restore drill      |
| [`pb-down.md`](pb-down.md)                         | PocketBase API returning 5xx or unreachable                     |
| [`db-restore.md`](db-restore.md)                   | Restore SQLite from R2 (emergency or drill)                     |
| [`customer-locked-out.md`](customer-locked-out.md) | A dealer user can't log in or has lost their dealer association |
| [`oom.md`](oom.md)                                 | Fly machine OOM-killed or trending toward it                    |
| [`ai-rate-limit.md`](ai-rate-limit.md)             | One or more AI providers returning 429 or sustained errors      |
| [`secrets-rotation.md`](secrets-rotation.md)       | Quarterly rotation of API tokens / passwords                    |

## Conventions

Every runbook follows the same shape:

1. **Symptom** — how you noticed
2. **Triage** — 60-second commands to confirm what's broken
3. **Recovery** — minimal steps to restore service
4. **Root-cause investigation** — what to dig into after the fire is out
5. **Prevention** — what to add to make this not happen again
