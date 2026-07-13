# Runbook — AI provider data retention (SEC-002)

Deal payloads sent through `/api/ai/*` can include consumer financial data
(credit estimate, income, vehicle terms). Provider retention must be minimized.

## What the proxy already does

| Provider      | Per-request control                 | Notes                                                                                                                                                                                        |
| ------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI**    | `store: false` on Responses API     | Prevents dashboard persistence (~30 days default). Required.                                                                                                                                 |
| **Anthropic** | None (no API flag)                  | Zero Data Retention is an **organization-level** arrangement enabled by Anthropic sales — not a request body field. We intentionally omit `cache_control` so prompt caching is not opted in. |
| **Gemini**    | `store: false` on `generateContent` | Explicit opt-out of AI Studio request logging / project retention. Default for generateContent is already false; we set it so project-level logging cannot silently retain.                  |

Do **not** invent fake API parameters for Anthropic (or others) — unknown fields
can break calls or be ignored without providing the protection you assume.

## Production key requirements

1. **OpenAI** — use a commercial/org key; keep `store: false` (already coded).
2. **Anthropic** — use a commercial organization with **Zero Data Retention (ZDR)**
   enabled by Anthropic. Confirm under Claude Console → Settings → Privacy /
   Data retention. Contact Anthropic sales if ZDR is not enabled.
3. **Gemini** — use a **Paid** Gemini API project. Disable generateContent
   logging in AI Studio Logs settings if it was enabled project-wide. Prefer
   Google’s documented ZDR / paid-tier terms for production GLBA workloads.

## Envelope encryption at rest (SEC-001)

Provider keys in PocketBase `ai_provider_keys` are sealed with AES-256-GCM when
`AI_KEYS_MASTER` is set on the Vercel AI proxy (and any other runtime that
writes keys). See [`secrets-rotation.md`](secrets-rotation.md) and
[`backend/DEPLOYMENT.md`](../../backend/DEPLOYMENT.md).
