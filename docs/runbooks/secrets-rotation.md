# Runbook — Quarterly secrets rotation

## Cadence

Every 90 days, plus immediately after:

- Any suspected leak (key seen in a screenshot, chat log, email, or commit)
- Departure of anyone who had access (when team grows)
- A platform-side notification (e.g., GitHub secret-scanning alert)

## Inventory

| Secret                                         | Where stored                                 | How to rotate                                                                         |
| ---------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `FLY_API_TOKEN`                                | GitHub Actions secret                        | `fly tokens create deploy --name="ci-deploy"` → `gh secret set FLY_API_TOKEN`         |
| `VERCEL_TOKEN`                                 | GitHub Actions secret                        | Vercel dashboard → Settings → Tokens → revoke + create → `gh secret set VERCEL_TOKEN` |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`           | GitHub Actions secrets                       | Not really secrets; stable per project. Re-set only if project moves.                 |
| `LITESTREAM_*` (4 keys)                        | GitHub Actions secrets → Fly machine secrets | Cloudflare → R2 → API Tokens → roll → re-run `./docs/runbooks/wire-sentry-and-r2.sh`  |
| `VITE_SENTRY_DSN`                              | GitHub Actions secret                        | Sentry → project → Client Keys → rotate → `gh secret set VITE_SENTRY_DSN`             |
| `PB_SERVICE_EMAIL`, `PB_SERVICE_PASSWORD`      | Vercel env vars                              | PB Admin UI → \_superusers → update password → Vercel dashboard → set new env         |
| AI provider keys (OpenAI / Anthropic / Gemini) | PB `ai_provider_keys` collection             | Provider dashboard → rotate → Owner Console → Settings → AI Providers → Replace       |
| PB `_superusers` passwords                     | PB SQLite                                    | PB Admin UI → \_superusers → edit                                                     |

## Procedure

For each secret in the inventory (top to bottom is roughly riskiest-first):

1. **Stage the new value.** Generate or grab from the provider; keep the old one active.
2. **Update the storage location.** Write the new value to GH / Vercel / PB / Fly.
3. **Verify the new value works.** Trigger a workflow / call the endpoint / log in once.
4. **Revoke the old value.** Click "delete old token" in the provider dashboard.
5. **Document in `audit_log`** (for AI provider keys — already automatic; for the others, log a note in a quarterly-rotation issue).

## After rotation

```bash
# Confirm the deploy pipeline still works
gh workflow run check.yml --ref main

# Confirm Litestream still replicating
gh workflow run fly-diag.yml
# grep artifact for: msg="snapshot written"

# Confirm AI proxy still works
curl -sS https://ltvdeskingpro.vercel.app/api/ai/models | jq .providers[].configured
```

All three should pass within ~5 minutes.

## Prevention

- Calendar reminder every 90 days for "rotation Friday"
- GitHub secret scanning enabled at the org level (catches leaks in pushes/PRs)
- Never paste a secret into Claude/chat without rotating it after
