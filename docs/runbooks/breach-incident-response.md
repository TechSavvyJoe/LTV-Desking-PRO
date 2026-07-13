# Runbook: Security Incident & Breach Response

**Owner:** Joe Gallant (platform owner) · **Last updated:** 2026-07-13
**Scope:** any suspected unauthorized access to dealer or consumer data (PocketBase, R2 backups,
Vercel functions, AI provider accounts, GitHub).

## 1. Detect & triage (first 30 minutes)

Detection sources: UptimeRobot alerts, Sentry errors, a dealer report, provider security email,
anomalous `audit_log` entries, unexplained PB admin logins (`fly logs -a ltv-desking-pro-api`).

Ask three questions:

1. Is data **actively** being accessed? → If yes, contain first (step 2), investigate second.
2. What data classes are in scope? (Consumer NPI = customer name + credit estimate + income in
   `saved_deals`; dealer business data; credentials.)
3. Is the vector still open?

## 2. Contain

- **Compromised AI proxy service identity:** run
  `gh workflow run rotate-pb-service-account.yml --ref main`. The workflow
  proves a new `api_service_accounts` identity through the actual Vercel AI API
  before retiring the prior identity. If the old identity is being actively
  abused, delete that record immediately in the PB Admin UI and accept the
  temporary AI outage while rotation completes. Never put a `_superusers`
  credential in Vercel. See `secrets-rotation.md`.
- **Compromised human PB superuser:** change or delete it in the PB Admin UI and
  review other `_superusers` records. It is separate from the Vercel service
  identity.
- **Compromised AI provider key:** revoke in the provider dashboard, clear it in Owner Console →
  AI Providers, enter the replacement.
- **Compromised user account:** delete/deactivate the user (Owner Console), then verify with the
  dealer principal by phone.
- **Active exploitation of the app itself:** list the machine ID with
  `fly machine list -a ltv-desking-pro-api`, then stop it with
  `fly machine stop <machine-id> -a ltv-desking-pro-api`. Preserve the attached
  volume; a hard outage is better than active exfiltration.
- Preserve evidence BEFORE restarting machines: `fly logs` output to a file, a Litestream snapshot
  of the current DB state, screenshots of audit_log.

## 3. Assess (same day)

- Determine which dealers and which end-customers are affected (query `saved_deals` by dealer).
- Write a timeline: first access, vector, what was readable/writable, when contained.

## 4. Notify

- **Affected dealers: within 72 hours** of confirming a breach involving their data (this is also
  the commitment in the pilot agreement / Safeguards addendum). Email + phone the dealer
  principal. Plain language: what happened, what data, what we did, what they should do.
- **FTC Safeguards Rule:** financial institutions must report certain breaches involving ≥500
  consumers' unencrypted information to the FTC **within 30 days of discovery**. The dealer is
  the regulated financial institution — coordinate with the dealer and counsel on who files.
  Do not let the 30-day clock run out while deciding.
- **State breach-notification laws** (MI/OH/IN all have them) apply to the consumers' data —
  counsel decides applicability; your job is to hand them the timeline within 48 hours.

## 5. Recover & learn

- Restore from a pre-incident Litestream generation if integrity is in doubt (`db-restore.md`).
- Rotate every credential the attacker could have seen, even if "probably not."
- Post-incident note in this folder: what happened, root cause, what changed. No blameless-ness
  theater needed — it's a one-person company — but write it down while it's fresh.

## Contacts

- Platform owner: Joe Gallant — joejgallant@gmail.com
- Counsel: **\*\*\*\***\_\_\_\_**\*\*\*\*** (fill in before pilot)
- Fly.io support: https://fly.io/dashboard → support · Vercel: vercel.com/help
- FTC Safeguards breach reporting: https://www.ftc.gov/safeguards
