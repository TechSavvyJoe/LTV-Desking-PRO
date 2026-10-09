# Runbook — AI provider data retention (SEC-002)

Deal payloads sent through `/api/ai/*` can include consumer financial data
(credit estimate, income, vehicle terms). Provider retention must be minimized.

## What the proxy already does

| Provider      | Per-request control                                                                      | Notes                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI**    | `store: false` on Responses API                                                          | Opts out of response/application-state storage. Does not establish zero abuse-monitoring retention. Required.                                                                                |
| **Anthropic** | None (no API flag)                                                                       | Zero Data Retention is an **organization-level** arrangement enabled by Anthropic sales — not a request body field. We intentionally omit `cache_control` so prompt caching is not opted in. |
| **Gemini**    | Top-level `store: false` on REST `generateContent`, sent via SDK `httpOptions.extraBody` | Opts out of AI Studio request logging even when project logging is enabled. It does not eliminate separate abuse-monitoring retention.                                                       |

Do **not** invent fake API parameters for Anthropic (or others) — unknown fields
can break calls or be ignored without providing the protection you assume.

## Production key requirements

1. **OpenAI** — use a commercial/org key; keep `store: false` (already coded).
2. **Anthropic** — use a commercial organization with **Zero Data Retention (ZDR)**
   enabled by Anthropic. Confirm under Claude Console → Settings → Privacy /
   Data retention. Contact Anthropic sales if ZDR is not enabled.
3. **Gemini** — use a **Paid** Gemini API project and disable request logging in
   AI Studio project settings. The proxy also sends a top-level request logging
   opt-out. Paid Developer API use can still retain prompts for abuse monitoring
   (up to 55 days); it does not provide guaranteed zero data retention. If a
   deployment requires guaranteed ZDR, use an eligible Vertex AI arrangement
   and verify its controls before transmitting consumer information.

Google documents the request field in [GenerateContentRequest](https://ai.google.dev/api/generate-content),
and separates it from [ZDR eligibility](https://ai.google.dev/gemini-api/docs/zdr)
and [abuse-monitoring retention](https://ai.google.dev/gemini-api/docs/usage-policies).
Review the actual provider/project terms at every production rollout.

## Envelope encryption at rest (SEC-001)

Provider keys in PocketBase `ai_provider_keys` are sealed with AES-256-GCM when
`AI_KEYS_MASTER` is set on the Vercel AI proxy (and any other runtime that
writes keys). See [`secrets-rotation.md`](secrets-rotation.md) and
[`backend/DEPLOYMENT.md`](../../backend/DEPLOYMENT.md).
