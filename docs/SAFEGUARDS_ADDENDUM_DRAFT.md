# Service-Provider Security Addendum — DRAFT FOR COUNSEL

> **Status: draft prepared by the platform team for counsel review. Not executed, not legal
> advice.** Attach the counsel-approved version to every Pilot Agreement. Purpose: the FTC
> Safeguards Rule (16 CFR Part 314) requires the Dealer, as a "financial institution," to select
> service providers capable of maintaining appropriate safeguards and to **contractually require**
> them — this addendum is that contract artifact. [G12]

**Parties:** LTV Desking PRO ("Provider") and the dealership identified in the Pilot Agreement
("Dealer").

1. **Scope of data.** Provider processes, on Dealer's behalf: dealership inventory and lender
   program data; deal worksheets that may include a consumer's name, dealer-estimated credit
   score, and stated monthly income ("Consumer Information"). Provider does not collect consumer
   SSNs, driver's-license numbers, or credit reports, and Dealer agrees not to enter them into
   free-text fields.

2. **Safeguards.** Provider maintains: encryption in transit (TLS) for all data flows; encrypted
   storage volumes and backups; multi-tenant access controls enforced server-side; unique
   per-user accounts with role-based permissions; server-side audit logging of administrative
   actions and deal events; and a documented data-retention schedule (Data Retention & Disposal
   Policy, incorporated by reference).

3. **Subprocessors.** Provider's current subprocessors: Fly.io (database hosting), Vercel
   (frontend hosting and API proxy), Cloudflare R2 (encrypted backups), Sentry (error telemetry,
   configured to exclude PII), and — only when AI features are used — OpenAI, Anthropic, or
   Google (AI inference; provider-side retention disabled where supported; no customer names
   transmitted). Provider will give Dealer 30 days' notice before adding a subprocessor that
   processes Consumer Information.

4. **Incident notification.** Provider will notify Dealer **within 72 hours** of confirming any
   security incident involving unauthorized access to Dealer's data, with a written timeline and
   remediation summary, and will reasonably cooperate with Dealer's own notification obligations
   (including the FTC's 30-day breach-reporting requirement, where applicable).

5. **Data return & deletion.** On termination, Provider will deliver Dealer's data (inventory,
   lender programs, saved deals) in CSV/JSON within 14 days of written request, then delete
   Dealer-scoped records; backup copies age out of the 14-day backup retention automatically.

6. **Access & personnel.** Provider access to Dealer data is limited to the platform owner for
   support and operations; all access paths require authentication; provider credentials are
   rotated upon any suspected compromise.

7. **Limitations.** Provider's tooling produces **estimates and preliminary screens only**; Dealer
   retains sole responsibility for consumer-credit disclosures, final contract figures, and
   compliance with TILA/Reg Z, ECOA, and state law. (Liability allocation per the Pilot
   Agreement.)

— Items for counsel: indemnification, liability cap cross-reference, audit rights wording,
governing law alignment with the Pilot Agreement, and whether §314.4(f) language should be
recited verbatim.
