# Runbook — Quarterly secrets rotation

## Cadence

Every 90 days, plus immediately after:

- Any suspected leak (key seen in a screenshot, chat log, email, or commit)
- Departure of anyone who had access (when team grows)
- A platform-side notification (e.g., GitHub secret-scanning alert)

## Inventory

| Secret                                                             | Where stored                                 | How to rotate                                                                                                                                                    |
| ------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLY_API_TOKEN`                                                    | GitHub Actions secret                        | `fly tokens create deploy --name="ci-deploy"` → `gh secret set FLY_API_TOKEN`                                                                                    |
| `VERCEL_TOKEN`                                                     | GitHub Actions secret                        | Vercel dashboard → Settings → Tokens → revoke + create → `gh secret set VERCEL_TOKEN`                                                                            |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`                               | GitHub Actions secrets                       | Not really secrets; stable per project. Re-set only if project moves.                                                                                            |
| `LITESTREAM_*` (4 keys)                                            | GitHub Actions secrets → Fly machine secrets | Cloudflare → R2 → API Tokens → roll → re-run `./docs/runbooks/wire-sentry-and-r2.sh`                                                                             |
| `VITE_SENTRY_DSN`                                                  | GitHub Actions secret                        | Sentry → project → Client Keys → rotate → `gh secret set VITE_SENTRY_DSN`                                                                                        |
| `PB_SERVICE_COLLECTION`, `PB_SERVICE_EMAIL`, `PB_SERVICE_PASSWORD` | Vercel production env vars                   | Run `rotate-pb-service-account.yml`; never place a `_superusers` identity in Vercel                                                                              |
| `AI_KEYS_MASTER`                                                   | Vercel (and optionally Fly) secret           | Generate 32 random bytes as 64 hex chars → set on Vercel Production → re-save each AI provider key in Owner Console so plaintext migrates to `enc:v1:` envelopes |
| AI provider keys (OpenAI / Anthropic / Gemini)                     | PB `ai_provider_keys` collection             | Provider dashboard → rotate → Owner Console → Settings → AI Providers → Replace; prefer ZDR/paid tiers — see [`ai-data-retention.md`](ai-data-retention.md)      |
| `api_service_accounts` records                                     | PB SQLite                                    | Rotation creates one active `scope = "ai_proxy"` record, proves it, then retires the prior record                                                                |
| Human PB `_superusers` passwords                                   | PB SQLite                                    | PB Admin UI → \_superusers → edit; these are never copied to Vercel                                                                                              |

## Procedure

For each secret in the inventory (top to bottom is roughly riskiest-first):

1. **Stage the new value.** Generate or grab from the provider; keep the old one active.
2. **Update the storage location.** Write the new value to GH / Vercel / PB / Fly.
3. **Verify the new value works.** Trigger a workflow / call the endpoint / log in once.
4. **Revoke the old value.** Click "delete old token" in the provider dashboard.
5. **Document in `audit_log`** (for AI provider keys — already automatic; for the others, log a note in a quarterly-rotation issue).

### AI proxy service identity

Do not rotate this identity manually in Vercel or by editing `_superusers`.
Before running the workflow, confirm at least one separate human break-glass
superuser exists. PocketBase refuses to delete its only superuser, and the
workflow requires authentication-based proof that its temporary bootstrap
superuser was removed.

```bash
gh workflow run rotate-pb-service-account.yml --ref main
gh run watch
```

The workflow generates a new `api_service_accounts` record with
`scope = "ai_proxy"`, updates the saved Vercel production environment, then
proves an unaliased staged `/api/ai/models` deployment sees the same configured
providers as PocketBase. It promotes and verifies the canonical alias before it
deletes the previous `ai_proxy` identity. Its temporary bootstrap superuser is
never sent to Vercel and is deleted in unconditional cleanup.

If rotation fails before promotion, production remains on the prior deployment
and identity. If it fails after Vercel environment variables are updated, do not
delete either service identity manually; rerun the workflow so it can complete
the verified cutover and retirement.

### AI_KEYS_MASTER (envelope encryption)

`AI_KEYS_MASTER` is the AES-256-GCM wrapping key used by `api/_lib/ai/keyResolver.ts`
when reading/writing `ai_provider_keys`. Dual-read accepts legacy plaintext until
the next Owner Console save re-encrypts each field as `enc:v1:…`.

```bash
# Generate a 32-byte master (64 hex chars)
openssl rand -hex 32
# Set on Vercel Production (AI proxy), then re-save each provider key once
# so envelopes replace plaintext in PocketBase.
```

Rotating `AI_KEYS_MASTER` without re-saving keys leaves ciphertext unread until
you restore the previous master or re-enter provider keys. Keep the old master
available until every key has been rewritten under the new one.

## After rotation

```bash
# Confirm the deploy pipeline still works
gh workflow run check.yml --ref main

# Confirm Litestream still replicating
gh workflow run fly-diag.yml
# grep artifact for: msg="snapshot written"

# Confirm the production AI API sees at least one PB-backed provider
curl -fsS https://ltvdeskingpro.vercel.app/api/ai/models \
  | jq -e '[.providers[] | select(.configured == true)] | length > 0'
```

All three should pass within ~5 minutes.

## Prevention

- Calendar reminder every 90 days for "rotation Friday"
- GitHub secret scanning enabled at the org level (catches leaks in pushes/PRs)
- Never paste a secret into Claude/chat without rotating it after

## Quarterly dependency hygiene (npm audit)

Run as part of rotation day (or on every PR via CI):

```bash
npm run audit          # = npm audit --audit-level=moderate
npm audit fix          # safe patch/minor only (never --force unless reviewed)
```

As of latest analysis (2026-07-08):

- Performed safe `npm audit fix`; package-lock/package metadata updated.
- `npm audit --audit-level=moderate` reports 0 vulnerabilities.
- CI gate + Renovate vulnerability alerts prevent regression.
- CI now includes explicit "Attempt safe npm audit fix (dry-run report only)" step.

If `npm audit` reports moderate+:

1. `npm audit` for details + GHSA links.
2. Prefer `npm audit fix` (non-breaking) locally; commit updated package-lock.
3. For force-required, review breaking impact, pin via overrides in package.json, or defer with documented exception in this runbook + issue.
4. Update package-lock, commit, verify `npm ci && npm run build && npm test`.

Add any persistent exceptions here (none currently).

Update this section on each rotation with fresh `npm audit` summary + confirmation of safe fix.
