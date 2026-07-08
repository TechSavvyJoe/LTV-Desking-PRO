# Runbook — AI provider rate-limited

## Symptom

- Users report "AI failed" toasts in the lender-import / deal-analysis flows
- `/api/ai/*` responses show 429 or sustained 5xx
- Sentry alerts fire with `provider returned HTTP 429`

## Triage (60 seconds)

```bash
# Which provider is failing? Hit the test-key endpoint as superadmin.
# (You'll need a PB superadmin token in your browser — easiest in the Owner
# Console UI → Settings → AI Providers → Test buttons.)

# Or from the command line:
TOKEN=$(curl -sS -X POST https://ltv-desking-pro-api.fly.dev/api/collections/_superusers/auth-with-password \
  -d '{"identity":"...","password":"..."}' \
  -H "Content-Type: application/json" | jq -r .token)

for p in openai anthropic gemini; do
  echo -n "$p: "
  curl -sS -X POST https://ltvdeskingpro.vercel.app/api/ai/test-key \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"provider\":\"$p\"}" | jq -c .
done
```

A `{"ok":false,"error":"...rate limit..."}` confirms which provider is dead.

## Recovery

### A. Switch default provider in Owner Console

1. Sign in as superadmin → Settings → AI Defaults
2. Change "Provider" dropdown to a non-rate-limited provider
3. Pick a per-task model for the new provider
4. Save

Cache invalidates on the next request (60 s max).

### B. Provider is hard-down for >15 min

Same as A, but consider rotating the API key:

1. Provider dashboard → revoke + create new key
2. Owner Console → Settings → AI Providers → Replace the key
3. Click Test to confirm
4. Audit log captures the change

### C. All three providers are rate-limited (extremely rare)

You've hit a real traffic spike. Options:

1. Buy capacity from the provider with the fastest pay-to-upgrade path (typically OpenAI or Anthropic)
2. Temporarily disable AI features by setting all three `*ApiKey` fields to empty in Owner Console — routes that need keys will 4xx with a clear "no provider configured" message instead of timing out
3. Communicate via your status page (if/when configured; use owner email + dealer channel for now)

## Root cause

- Single provider 429: usage spike or rate-tier change (typical fix: upgrade tier)
- Multiple providers 429 simultaneously: someone is hitting the AI proxy from a script — check Vercel logs for unusual traffic patterns

## Prevention

- Multi-provider configuration in `ai_provider_keys` collection (already supported)
- Per-task model selection (already supported in `aiDefaults`)
- Sentry error tracking wired; configure /api/ai/\* error rate alert in Sentry dashboard (rate limit impl in `api/_lib/ai/rateLimit.ts`: per-user 20/min + per-dealer 80/min fixed window, in-memory per instance)
- For durable/global rate limit, consider Upstash or PB-backed counter (not yet)
