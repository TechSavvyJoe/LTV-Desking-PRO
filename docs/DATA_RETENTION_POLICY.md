# Data Retention & Disposal Policy

**Effective:** 2026-06-11 · **Owner:** platform owner · **Review:** annually and at every pilot
agreement signing. This is the written retention schedule referenced by the Privacy Policy and the
Safeguards service-provider addendum. [G11]

## Data classes & retention

| Data                        | Where                                                                       | Contains consumer NPI?                                                                | Retention                                                                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved deals                 | PocketBase `saved_deals`                                                    | Yes — customer name, credit-score estimate, stated monthly income, deal notes         | Retained while the dealer account is active. **Purge or anonymize 25 months after last update** (covers a 24-month lookback for disputes). Manual purge procedure below until automated. |
| Pay-stub images             | Never stored — OCR is client-side only; the image never leaves the browser  | n/a                                                                                   | n/a (by design — keep it that way)                                                                                                                                                       |
| Inventory & lender programs | PocketBase                                                                  | No                                                                                    | While dealer account active; deleted at offboarding                                                                                                                                      |
| Audit/event logs            | PocketBase `audit_log`, `deal_events`                                       | deal_events snapshots include customer name + figures                                 | 25 months, then purge                                                                                                                                                                    |
| Database backups            | Cloudflare R2 (Litestream)                                                  | Mirrors the above                                                                     | 14-day rolling retention (Litestream generations)                                                                                                                                        |
| AI provider prompts         | OpenAI (`store:false` — not retained), Anthropic/Gemini per provider policy | Credit estimate + income (never customer name; notes excluded; SSN patterns redacted) | Provider-side: zero-retention requested where supported; Gemini keys must be **paid-tier** (free tier permits training use)                                                              |
| Error telemetry             | Sentry                                                                      | No PII by configuration (`sendDefaultPii: false`)                                     | Sentry plan default (30–90 days)                                                                                                                                                         |

## Disposal procedures

- **Dealer offboarding:** follow `docs/runbooks/dealer-offboarding.md` — export the dealer's data
  on request, then delete dealer-scoped records; backups age out within 14 days.
- **Consumer deletion request** (via the dealer): locate `saved_deals` by customer name for that
  dealer in the PB admin UI; delete the records; note the request and completion date in a log
  the dealer can reference. Target: 30 days from written request.
- **25-month purge:** until automated, run quarterly — PB admin → saved_deals filtered by
  `updated < now - 25 months` → delete. Calendar reminder alongside the quarterly restore drill.

## Commitments this policy supports

- Privacy Policy: manual export/deletion within 30 days of written request.
- Safeguards addendum: documented retention schedule + disposal of consumer information no later
  than two years after last use, unless a legitimate business need or legal requirement persists.
