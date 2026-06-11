# LTV Desking PRO — State of the Software

**Date:** 2026-06-10 · **Baseline:** `main` @ `4af4e1e` (deployed 2026-05-31) · **Method:** fresh multi-agent
code audit (adversarially verified) + 12-dimension gap analysis, reconciled against
`PRODUCTION_READINESS_PLAN.md` and `BUG_AUDIT_2026-05-28.md`.

---

## 1. Executive Summary

**Verdict: not ready for a paid pilot today — but the distance is 3–5 focused weeks, not months.** The
codebase is structurally sound (the May hardening genuinely closed the security and math holes it
targeted), the AI lender-sheet differentiator is real and verified in code, and pilot COGS is $0. What
stands between you and a defensible pilot is a long list of small, concrete items — most under a day each —
plus a handful of business basics that have nothing to do with code.

**The five things that genuinely block a pilot:**

1. **Two advertised features have always been broken in production** — VIN decode and pay-stub OCR both
   fail on the live site because the security policy (CSP) blocks the services they call (C3, C4). Nobody
   noticed because nothing tests the deployed app.
2. **Customer paper leaks and overpromises** — the deal PDF prints your front-end gross profit on the sheet
   the shopper takes home, collects a signature on a TILA-lookalike worksheet, brands dealer-typed numbers
   as "J.D. Power," and prints lender "approvals" the matcher never actually checked (G1, G2, G80, G77).
3. **Consumer financial data flows to AI providers uncontrolled** — credit score + income go to
   OpenAI/Anthropic/Gemini with retention defaulted ON, while your live Privacy Policy claims you don't
   collect credit data, promises deletion you can't perform, and lists a support email **on a domain nobody
   has registered** (G8, G10, G59).
4. **Every store login can see cost and gross and edit the lender sheet** — below "admin" there is no
   server-side permission separation at all; that's a no-sale the moment you demo to a store with hired
   salespeople (G37, G38).
5. **The safety nets are unproven or wired backwards** — the backup has never been restored once and the
   restore script can overwrite your good backup with an empty database; previews and local dev point at
   the production database; nothing pages your phone when prod dies; and prod schema has silently drifted
   from the migrations behind green deploys (G50–G54).

**The three biggest things you hadn't thought of:** (1) the unregistered support/legal domain — $10 and
ten minutes, but until then every promise in your app bounces and the domain is hijackable; (2) the
"false success" epidemic — across the owner console, dealer settings, seeding, and saves, the app
routinely shows green toasts for writes that silently failed, which in a dealership means decisions made
on data that was never saved; (3) prod-vs-code drift — deployed behavior (missing collection, CSP blocks,
dead Renovate) diverged from what the repo says, because nothing verifies the running system.

**What's genuinely strong:** the desking math core (cent-accurate, sane edge handling, 122 unit tests),
tenancy isolation and AI cost controls from the hardening pass, client-side-only pay-stub OCR (a real
privacy win), an honest "estimates only" footer already on customer PDFs, CI that gates every PR, and a
differentiator — AI rate-sheet extraction → structured tiers → whole-lot LTV matching — that no DMS
desking screen offers.

---

## 2. Scorecard

| Dimension                                        | Status | Blockers | Worst finding                                                           | Effort to green |
| ------------------------------------------------ | ------ | -------- | ----------------------------------------------------------------------- | --------------- |
| Code health (82 findings: 18 P1 / 31 P2 / 33 P3) | 🔴     | 18       | Two features 100% broken in prod (CSP); false-success toasts everywhere | ~2 wks          |
| D1 Reg Z / TILA exposure                         | 🟡     | 4        | Gross profit + signature line on customer PDF                           | Days            |
| D2 GLBA / AI data pipeline                       | 🔴     | 6        | NPI to AI providers w/ retention ON; policy claims otherwise            | Days            |
| D3 Desking completeness                          | 🟡     | 6        | OH/IN/4th-state tax silently wrong; one global deal                     | 1–2 wks         |
| D4 Data trust & freshness                        | 🟡     | 3        | "J.D. Power" branding on dealer-typed numbers                           | Days            |
| D5 AI reliability & liability                    | 🟡     | 3        | One click: PDF → live matching, no review/diff                          | ~1 wk           |
| D6 Roles & org reality                           | 🔴     | 4        | Sales sees cost/gross; can edit lender programs                         | ~1 wk           |
| D7 Audit trail / evidence                        | 🔴     | 3        | No record of what was shown to a customer; deals hard-deletable         | Days            |
| D8 Operational readiness                         | 🔴     | 5        | Previews/dev on PROD data; unproven backups                             | Days            |
| D9 Commercial & legal                            | 🔴     | 4        | Support domain not registered; false ToS claims                         | Days + counsel  |
| D10 Floor-readiness UX                           | 🟡     | 3        | Session dies mid-deal, work lost, no message                            | ~1 wk           |
| D11 Pilot design & measurement                   | 🟡     | 4        | Zero analytics events; no charter/metrics                               | Days            |
| D12 Competitive positioning                      | 🟡     | 3        | "Approval" claim outruns the matcher                                    | Days            |

**Totals: 165 verified findings** — 82 code (§4, register C.2) + 83 gap (§5, register C.1); 66
pilot-blockers (48 gap + 18 code P1); **63 of the gap findings are NEW** (nowhere in your existing plan).

---

## 3. State of the Software Today

### What the product is

A desking and lender-matching companion for US used-car dealerships: import inventory (CSV/XLSX), decode
VINs, structure retail-installment deals (price / down / trade / term / APR → payment, out-the-door, LTV
against book value), match deals against lender programs by FICO/LTV/PTI tier, extract lender rate sheets
from PDFs with AI, analyze deals with AI, scan pay stubs for income, save deals, and print/PDF customer
sheets. Multi-tenant (per-dealership) with an owner console for you.

### What the last 10 days bought (shipped 2026-05-31, PRs #1–#2)

The 87-issue hardening pass closed every finding in the May audit: the two privilege-escalation holes
(self-promote to superadmin; cross-dealer writes), AI cost-abuse surface (rate limiting, body caps, error
masking), the silent-wrong-number math bugs (blank APR → 0% loan, missing rounding, dropped transit fee),
silent import data loss, the realtime/state races, modal accessibility, and a 44% smaller first-paint
bundle (1.0 MB → 565 KB). Verified live; one regression (route-redirect hang) was caught and hotfixed the
same day.

### Live health (verified today)

| Check                                    | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend (ltvdeskingpro.vercel.app)      | HTTP 200, renders clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Backend health (fly.dev `/api/health`)   | HTTP 200                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Open PRs / pending changes               | None — `main` clean, in sync                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **`system_settings` collection on prod** | **Missing.** Unauthenticated GET returns the same generic 400 as a nonexistent collection (a control probe of a fake collection returns the identical body, while `dealers` responds normally). Diagnosis: the `1747400000_create_system_settings.js` migration **never applied to the production database**. The app degrades gracefully (cache/defaults), but announcement banner, signups kill-switch, and AI defaults silently don't work in prod — and it implies other migrations with "fresh-DB skip" guards may also be unapplied. Remediation is a backend deploy/migration replay, not frontend code. |

### Dependency posture (today's `npm audit` / `npm outdated`)

- **1 moderate CVE:** `ws` 8.18.3 (uninitialized memory disclosure, GHSA-58qx-3vcg-4xpx) — pulled in by
  **`@google/genai@2.2.0`, a production dependency**. Fixed by the available `@google/genai@2.8.0` bump.
- **20 packages outdated**, including the PocketBase JS client (0.26.9; latest 0.27.0 — server runs
  0.26.5, keep client on 0.26.x until the server upgrades) and three majors (ESLint 10, Vite 8,
  @vitejs/plugin-react 6) that need deliberate migration, not auto-bumps.
- **Renovate appears configured but inert:** the setup commit exists (`a8aab1a`), yet zero Renovate PRs in
  10 days with 20 outdated packages. The GitHub App is likely not installed/enabled on the repo.

### Test & CI posture

9 unit-test files / ~122 cases (calculator, lender matcher, parser, validators, AI proxy) — solid for the
money math. **No end-to-end tests** (playwright is installed and unused), no coverage thresholds. CI gates
PRs (type-check, lint, test, build) and the backend deploy boot-validates migrations on an ephemeral
PocketBase. Backups: Litestream → Cloudflare R2, 10s sync, 14-day point-in-time recovery — **but the
restore drill has never been executed.** Sentry is frontend-only; there is no uptime alerting to a phone
and no staging environment.

---

## 4. Fresh Code-Audit Findings

Seven reviewer agents covered what the May audit didn't: the hardening code itself plus every component
never previously deep-read (both admin dashboards, all table/deal surfaces, modal/AI tools, services,
auth flows, deps/config). Every P1/P2 claim was independently re-derived from source by a separate
verifier; **all 82 findings survived, zero were rejected.** Full register with file:line and fixes:
Appendix C.2.

**Delta vs the May audit:** all twelve B-findings remain fixed — no relapse in the calculator, parser,
or backend guards themselves. But this pass found two _regressions of hardening intent_ (a side door
re-opens B6: clearing the APR inside the Deal Structuring modal still writes a 0% rate, C9; and the new
DataError/retry UI is unreachable because the API layer swallows the errors it was built to display,
C10), plus a recurring theme the May audit couldn't see: **significant parts of the app are dead or
never-wired code** — the deal-history panel, the favorites table, the background-upload store, the entire
client-side validation layer, and three owner-console settings that nothing reads.

### The 18 P1s (fix before any pilot)

| ID  | Finding                                                                                                             | Where                            |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| C3  | **CSP blocks the NHTSA API — VIN decode has always failed in production**                                           | vercel.json                      |
| C4  | **CSP blocks tesseract assets — pay-stub OCR has always failed in production**                                      | DocumentScanner + vercel.json    |
| C5  | Analytics "Lender Comparison" chart shows **hardcoded fake lender rates** as deal data                              | DealCharts.tsx                   |
| C9  | Clearing APR in Deal Structuring modal writes 0% into the global deal (B6 regression)                               | DealStructuringModal.tsx         |
| C11 | Saving lender "Chase" silently **overwrites "Chase Auto Finance"** (substring match) and deletes other near-matches | lib/api.ts                       |
| C13 | Dealer-admin "Dealership Details" save **never saves** (superadmin-only helper), then toasts success                | DealerAdminDashboard.tsx         |
| C16 | Every owner-console mutation swallows errors — forms close and refresh **as if writes succeeded**                   | SuperAdminDashboard + lib/api.ts |
| C14 | Superadmin can self-demote/self-delete (incl. the last superadmin) with one unconfirmed click                       | SuperAdminDashboard.tsx          |
| C15 | A tenant admin can demote or delete a dealer-assigned superadmin                                                    | users_guard.pb.js + dashboards   |
| C12 | Prod-reachable "Seed DB" button can inject fake lender rates into a live dealer                                     | lib/seeder.ts + SettingsModal    |
| C1  | logout() leaves the previous user's customer/deal data in localStorage on a shared desk                             | lib/auth.ts                      |
| C2  | Self-registration will break the moment the tightened API rules deploy (unauthenticated dealer-code lookup)         | lib/auth.ts + rules migration    |
| C10 | DataError/retry UI unreachable — API layer swallows the errors it should surface                                    | lib/api.ts + DealContext         |
| C17 | Shortlist column sorting is a complete no-op                                                                        | App.tsx                          |
| C18 | Filter changes never reset the page → false "No vehicles match" on page 2+                                          | DealContext + DealControls       |
| C6  | Deal-comparison inputs lose focus after every keystroke (component defined in render)                               | FloatingToolsPanel.tsx           |
| C7  | Minimized AI upload shows a 0% spinner forever (progress state never written)                                       | App.tsx + Header.tsx             |
| C8  | Cancel during an AI lender batch doesn't abort — tokens keep burning, results resurrect into a closed modal         | AiLenderManagerModal.tsx         |

### P2 highlights (31 total — see C.19–C.49)

The clusters that matter most: **money-display integrity** (every surface including the customer PDF
rounds to whole dollars while one shows pennies; saved-deal dates render "Invalid Date" on iPads/Safari;
"undefined" can be persisted into vehicle names; 0-mile units can't be desked) · **dead code shipped as
features** (DealHistoryPanel/FavoritesTable unmounted — the deal search/restore UX is unreachable;
validation layer never called while a comment claims otherwise; three owner-console settings written but
never read) · **import/parse edges** (the parser's carefully-built error messages are swallowed into a
generic toast; `28500,50` parses as 2.85 million; same-file re-upload is a silent no-op; no-VIN units can
collide and drop) · **session integrity** (mid-session token expiry leaves the app "logged in" while every
call 401s; a non-superadmin visiting /admin gets fully logged out and loses their in-progress deal; OwnerLogin's
rejection message is wiped by a reload before it renders; `isDealDirty` is tracked but nothing consumes it)
· **CSP hygiene** (`unsafe-inline` in script-src neuters XSS protection; the HIBP breach check is silently
dead; Renovate config exists but the bot was never installed).

The 33 P3s are polish-grade (sentinel rendering, animation, stale duplicate components) — register C.50–C.82.

---

## 5. Gap Analysis — The Missing Things (D1–D12)

Each dimension: a status, the single worst finding in bold, a plain-English verdict, and the findings table.
**Tags:** 🚫 = pilot-blocker, 🌱 = growth. **NEW** = not in PRODUCTION_READINESS_PLAN.md anywhere;
**KU** = known in the plan but unscheduled. Effort: S (<1 day), M (days), L (weeks+). Full evidence and
fixes for every finding: Appendix C.

### D1 — Reg Z / TILA disclosure exposure 🟡

**Worst: the customer-facing deal PDF collects a customer signature on a TILA-lookalike itemized payment
worksheet that also prints the dealer's front-end gross profit — and no copy of what was handed to the
shopper is ever archived.**

Good news first: the deal sheet is better than feared — every payment is labeled "Estimated Monthly
Payment" next to APR/term/down, with a "preliminary proposal, not a final contract" footer, and the
post-hardening payment math is the standard actuarial method rounded to cents. A one-on-one quote sheet
generally isn't a Reg Z "advertisement," so the trigger-term theory is the lesser risk. The real exposure
(review with counsel) is the **customer signature line on an itemized worksheet** — the classic
"signed four-square" pattern behind payment-packing claims — with backend products as one unexplained lump
sum. Two one-day PDF fixes take most of the sting out.

| Finding                                                                             | Tag | New? | Effort |
| ----------------------------------------------------------------------------------- | --- | ---- | ------ |
| Customer PDF prints **front-end gross profit**, credit score, and lender tier names | 🚫  | NEW  | S      |
| Signature lines on a TILA-lookalike itemized payment worksheet                      | 🚫  | NEW  | S      |
| Disclaimer never says "not an offer of credit / not a TILA disclosure"              | 🚫  | NEW  | S      |
| Legal pages are self-declared placeholders; ToS cites billing that doesn't exist    | 🚫  | KU   | M      |
| No snapshot of what was shown/handed to the customer                                | 🌱  | KU   | M      |
| Blank APR crashes PDF generation (`"".toFixed`)                                     | 🌱  | NEW  | S      |
| In-app payment columns lack estimate labeling / adjacent APR-term                   | 🌱  | NEW  | S      |

### D2 — GLBA / FTC Safeguards + the AI data pipeline 🔴

**Worst: every AI deal-analysis ships the customer's credit score, monthly income, and free-text deal
notes to OpenAI/Anthropic/Gemini with zero retention controls — the OpenAI call leaves `store` at its
default (true), so consumer NPI persists in the OpenAI dashboard ~30 days, while the live Privacy Policy
claims "we do not collect… credit-report data."**

The good news is real: pay-stub images never leave the browser (OCR is fully client-side), no
SSN/DL/DOB field exists anywhere, and customer names are never sent to AI. The bad news: credit score +
income go to whichever provider you picked with no zero-retention flag, no DPA, and no way to know if a
Gemini key is free-tier (trainable). Once a dealer pays, the FTC Safeguards Rule makes them contractually
responsible for overseeing this SaaS — and today there's nothing to hand them. **Red — but five of the six
blockers are under-a-day fixes. A sprint, not a rebuild.**

| Finding                                                                    | Tag | New? | Effort |
| -------------------------------------------------------------------------- | --- | ---- | ------ |
| NPI sent to AI with provider retention at defaults (`store:false` missing) | 🚫  | NEW  | S      |
| Gemini free-tier keys can train on dealer data; app can't tell             | 🚫  | NEW  | S      |
| Privacy Policy/ToS make disprovable claims (incl. "no credit data")        | 🚫  | KU   | S      |
| No retention/disposal program — name+income+score stored indefinitely      | 🚫  | KU   | M      |
| No service-provider/Safeguards addendum to hand a paying dealer            | 🚫  | KU   | S      |
| No breach-notification / incident-response plan                            | 🚫  | NEW  | S      |
| audit_log never records access to consumer financial data                  | 🌱  | NEW  | M      |
| Free-text notes are the uncontrolled SSN channel (warn + redact)           | 🌱  | NEW  | S      |

### D3 — Deal-math & desking completeness 🟡

**Worst: selecting OH or IN in Settings — or taking a trade above Michigan's capped trade-in credit —
silently produces a wrong sales-tax/OTD number on every deal. The engine only correctly models "Michigan
dealer, uncapped trade credit," and it never refuses or warns.**

The core payment/OTD math for one Michigan retail deal is genuinely solid post-hardening, and skipping
leases is the right call for a used-car independent. But today this is a one-deal-at-a-time calculator,
not a desk: one global structure every screen writes through, no 2–3-scenario presentation or payment
grid, and lender caps imported from rate sheets that the matcher quietly ignores — so "eligible" verdicts
can be wrong. **Pilot at a Michigan store only**; fix the S/M blockers below and a Michigan pilot can desk
roughly two-thirds of its deals end-to-end.

| Finding                                                                          | Tag | New? | Effort |
| -------------------------------------------------------------------------------- | --- | ---- | ------ |
| Tax engine only models an MI dealer; OH/IN/other = silently wrong tax            | 🚫  | NEW  | M      |
| MI trade-in tax credit modeled as unlimited (statutory cap missing)              | 🚫  | NEW  | S      |
| No per-deal buyer state — tax state is one global setting                        | 🚫  | NEW  | M      |
| Single global deal structure — no scenarios, no payment grid                     | 🚫  | NEW  | M      |
| Extracted lender caps stored but never enforced → false "eligible"               | 🚫  | NEW  | S      |
| Negative equity garbled on customer PDF ("- -$3,000", no rollover line)          | 🚫  | NEW  | S      |
| No backend product menu (one lump dollar; no per-product cost/price)             | 🌱  | KU   | L      |
| No buy/sell rate or reserve in the deal flow; reserve tool syncs wrong principal | 🌱  | NEW  | M      |
| Doc fee unvalidated vs Michigan statutory cap                                    | 🌱  | KU   | S      |
| Rebates/incentives not representable (fine to defer)                             | 🌱  | NEW  | S      |

### D4 — Trust-critical data & freshness 🟡

**Worst: customer-facing PDFs print dealer-typed CSV numbers under the "J.D. Power" brand name with no
license, feed, or "your entered book value" labeling — trademark and accuracy exposure on paper a consumer
takes home.**

Every trust-critical number — book values, lender programs, credit score — is dealer-entered or
AI-extracted, which is fine for a pilot, but the app dresses several up as more authoritative than they
are and never says how old they are. The AI even extracts lender-program `effectiveDate` — then throws it
away without displaying it. Real inventory shows under a **"Sample Data Loaded"** header after a reload.
All honesty-of-labeling, most under a day each.

| Finding                                                                              | Tag | New? | Effort |
| ------------------------------------------------------------------------------------ | --- | ---- | ------ |
| Dealer-keyed values branded "J.D. Power" in UI + customer PDFs                       | 🚫  | NEW  | S      |
| Lender programs: no effective date / last-verified / staleness warning shown         | 🚫  | NEW  | M      |
| Real inventory shows under "Sample Data Loaded"; no "data as of" stamp               | 🚫  | NEW  | S      |
| Credit score lacks "estimated / customer-stated" qualifier (FCRA hygiene)            | 🌱  | NEW  | S      |
| DMS/credit/book integrations planned but unscheduled; no interim labeling workstream | 🌱  | KU   | L      |

### D5 — AI-output reliability & liability 🟡

**Worst: one click on "Confirm and Update" pushes every AI-extracted lender program — including tiers the
user never saw (preview caps at 4) and silent overwrites of existing profiles with no diff — straight into
live deal matching.**

Real guardrails exist (schema validation fails closed; OCR has a confirm step; prompts forbid inventing
rates). But the lender pipeline is one click from PDF to live matching; nothing downstream distinguishes
AI-extracted from hand-entered numbers; and a **partially-extracted tier silently matches MORE deals**
(missing constraint = constraint not enforced). AI-written notes can land verbatim on the customer PDF.

| Finding                                                                  | Tag | New? | Effort |
| ------------------------------------------------------------------------ | --- | ---- | ------ |
| No real review gate: blind tiers, silent overwrites, no diff             | 🚫  | NEW  | M      |
| AI text/numbers reach customer PDF unmarked (Apply → notes → PDF)        | 🚫  | NEW  | S      |
| Partial extraction matches MORE deals; confidence ignored by matcher     | 🚫  | NEW  | M      |
| No AI provenance downstream (badge, source file, page number)            | 🌱  | NEW  | S      |
| No golden-file extraction regression — drift found by dealers, not tests | 🌱  | NEW  | M      |
| OCR conflates pay-period/YTD figures with monthly income                 | 🌱  | NEW  | S      |

### D6 — Roles, permissions & dealership org reality 🔴

**Worst: any sales-role login — the default for every self-registered user — can read unit cost and
front-end gross on every unit AND silently rewrite the store's lender programs and book values. Below
"admin" there is no server-side permission separation at all.**

Workable in a 3-person shop where the owner desks every deal; a no-sale the moment you demo to a store
with hired salespeople — the GM either refuses to load costs (killing the LTV/gross value prop) or loads
them and leaks them to the floor. Offboarding is hard-delete-only, the forgot-password path is dead, and
"who showed what" rests on a free-typed name.

| Finding                                                                            | Tag | New? | Effort |
| ---------------------------------------------------------------------------------- | --- | ---- | ------ |
| Sales role reads unitCost/gross via API + UI (PB lacks field rules — needs hook)   | 🚫  | NEW  | M      |
| Sales can create/edit/delete lender programs, prices, inventory                    | 🚫  | NEW  | S      |
| Can't verify tightened rules are live on prod (sibling migration unapplied)        | 🚫  | NEW  | S      |
| No deactivate/suspend; hard delete only; admin can't reset passwords               | 🚫  | KU   | M      |
| Deal attribution is a free-typed string, not the logged-in user                    | 🌱  | NEW  | M      |
| "manager" role exists in schema but grants nothing                                 | 🌱  | KU   | M      |
| Multi-store dealer groups structurally unsupported (fine — don't sell to them yet) | 🌱  | KU   | L      |

### D7 — Audit trail & evidentiary record 🔴

**Worst: the deal-sheet PDF a customer is shown is generated in the browser and handed over with no stored
copy, no input snapshot, and no event record anywhere — and any store employee can hard-delete the
saved-deal records that do exist.**

If a customer says "your guy told me $389 a month," the app cannot back the dealer up. Saved deals do
snapshot numbers with server timestamps — but any employee can permanently delete or rewrite them with no
trace, and your own plan's proposed mechanism (extend `audit_log`) was quietly invalidated by the May
lockdown migration (createRule superadmin-only). The credible fix is small: one append-only `deal_events`
collection + five logging calls.

| Finding                                                                           | Tag | New? | Effort |
| --------------------------------------------------------------------------------- | --- | ---- | ------ |
| Customer PDFs ephemeral: no artifact, snapshot, or generation event               | 🚫  | KU   | M      |
| Plan's audit_log-based snapshot mechanism invalidated by lockdown migration       | 🚫  | NEW  | S      |
| Saved deals silently rewritable/hard-deletable by any store user                  | 🚫  | NEW  | S      |
| "Every deal Jim quoted last week" unanswerable (free-text attribution)            | 🌱  | NEW  | S      |
| Saved deals omit the lender-approval grid; `calculatedData` field never populated | 🌱  | NEW  | S      |
| No login/auth events in any log                                                   | 🌱  | NEW  | M      |

### D8 — Operational readiness 🔴

**Worst: every Vercel preview deploy and every local dev session talks to the production database — the
prod PocketBase URL is the hardcoded fallback — so untested code runs against live dealer data, and there
is no staging environment anywhere.**

The paperwork is good — runbooks, CI gates, backups — but almost none of it is _proven_. Nothing pages
your phone when PocketBase dies on a Saturday. The backup has never been restored once, and `start.sh` has
a flaw that can **replicate an empty database over your good backup** after a failed restore. The deploy
pipeline reported green on May 31 while prod is provably missing a collection — 13 of 14 migrations carry
silent "[skip]" guards, so schema drift hides behind green checkmarks.

| Finding                                                                             | Tag | New? | Effort |
| ----------------------------------------------------------------------------------- | --- | ---- | ------ |
| Previews + local dev hit PROD data; prod URL is the hardcoded fallback              | 🚫  | NEW  | M      |
| Restore drill documented, never executed — backups unproven                         | 🚫  | KU   | S      |
| start.sh failure path boots empty DB and replicates it to R2 as newest backup       | 🚫  | NEW  | S      |
| Prod schema drifted from migrations despite green deploys (system_settings missing) | 🚫  | NEW  | M      |
| Nothing pages a phone when PB is down / AI errors spike                             | 🚫  | NEW  | S      |
| Zero e2e coverage on the four money paths (playwright installed, unused)            | 🌱  | NEW  | M      |
| Saturday-outage story: one machine, one region, one human, laptop-required recovery | 🌱  | KU   | M      |
| No dealer data export/deletion mechanism (but Privacy Policy promises both)         | 🌱  | NEW  | S      |
| Stale root fly.toml targets a second app with no volume (2am footgun)               | 🌱  | NEW  | S      |

### D9 — Commercial & legal readiness 🔴

**Worst: every support and legal contact in the app points to `@ltvdeskingpro.com` — a domain that is NOT
REGISTERED (whois: "No match"). Every email a pilot dealer sends will bounce, and anyone can buy the domain
today and silently receive your dealers' mail.**

You cannot take a dealer's check today: no pilot agreement, no billing path, and the in-app Terms falsely
claim Stripe billing and promise 99.9% uptime. The raw material is decent (PDF disclaimers, honest
subprocessor list in the privacy stub) — about a week of focused work clears all of it, none of which
needs Stripe or new features.

| Finding                                                                             | Tag | New? | Effort |
| ----------------------------------------------------------------------------------- | --- | ---- | ------ |
| **ltvdeskingpro.com not registered** — dead support email, hijackable domain        | 🚫  | NEW  | S      |
| ToS stub contains false statements (Stripe billing, 99.9% uptime); no liability cap | 🚫  | KU   | M      |
| Privacy Policy promises export + 30-day deletion the product can't perform          | 🚫  | NEW  | S      |
| No pilot agreement or billing path (Stripe self-serve is overkill for 1–3 dealers)  | 🚫  | NEW  | M      |
| No documented manual offboarding/export runbook                                     | 🌱  | NEW  | S      |
| Safeguards service-provider exhibit needed for counsel; CA/CO exposure minimal      | 🌱  | KU   | S      |

### D10 — Floor-readiness UX 🟡

**Worst: the login token silently hard-expires ~14 days after login (the app never refreshes it), so
mid-deal the salesperson gets only "Failed to save deal" — and recovering via reload loses the customer
name, salesperson, and staged vehicle. In front of the customer.**

The core desk experience is genuinely fast — every car shows a payment on open, and deal numbers survive
reloads via localStorage. The edges are rough: no offline awareness, the Payment column scrolls off-screen
on iPad portrait, bare `type="number"` inputs (no decimal keypad; scroll-wheel can silently change APR),
and PDFs are A4-sized raster screenshots printed on US Letter. Two or three of these WILL happen during a
30-day pilot and will read as "the app broke."

| Finding                                                                  | Tag | New? | Effort |
| ------------------------------------------------------------------------ | --- | ---- | ------ |
| Session hard-expires mid-deal; no refresh, no message, partial work loss | 🚫  | NEW  | M      |
| Payment column off-screen + sub-44px tap targets on iPad portrait        | 🚫  | KU   | M      |
| 12 bare number inputs: no decimal keypad; scroll-wheel changes values    | 🚫  | NEW  | S      |
| No offline awareness; single-shot saves with zero retry                  | 🌱  | NEW  | S      |
| PDFs A4 not Letter; raster text; match/no-match is color-only in B&W     | 🌱  | NEW  | S      |
| App opens priced with the PREVIOUS customer's deal numbers               | 🌱  | NEW  | S      |

### D11 — Pilot design & measurement 🟡

**Worst: zero analytics events are instrumented (PostHog exists only in the plan), so if the paid pilot
started tomorrow you could not answer "did anyone desk a real deal with it" with anything but anecdotes.**

No pilot charter, no success metrics, no in-app feedback channel, no quote-vs-funded validation loop, and
no data-export path if the dealer walks — though your privacy policy promises one. Every gap here is days,
not weeks. Also flagged: the founder-pilots-own-store trap — your store is dogfood, not evidence; dealer #2
is the real pilot.

| Finding                                                                               | Tag | New? | Effort |
| ------------------------------------------------------------------------------------- | --- | ---- | ------ |
| No product analytics instrumented (an SLO in the plan depends on a nonexistent event) | 🚫  | KU   | M      |
| No pilot charter or success metrics anywhere                                          | 🚫  | NEW  | S      |
| No quote-vs-funded validation loop; deals can't be tied to funded contracts           | 🚫  | NEW  | S      |
| No rollback story: zero export exists despite policy promise                          | 🚫  | NEW  | S      |
| No in-app feedback channel (footer mailto only — to the dead domain)                  | 🌱  | KU   | S      |
| Founder-pilots-own-store trap: run the evidence pilot arms-length                     | 🌱  | NEW  | M      |

### D12 — Competitive table-stakes & positioning 🟡

**Worst: the app promises "see which lenders approve a deal" while the matcher silently ignores half the
constraints the AI extraction captures (excluded makes, vehicle type, max advance, tier PTI/backend caps) —
and those green checks print on customer paper.**

The differentiator is real and verified in code: nothing in DealerCenter/Frazer/Wayne Reaves reads a credit
union's PDF rate sheet into structured tiers and scans the whole lot for fundable LTV fits. That plus
dual-book LTV-first desking is a defensible $399/mo **companion** story — and because book values ride in
on the dealer's CSV, pilot COGS is $0. A **replacement** posture loses every bake-off (menus, leasing,
credit pull, e-sign, DMS sync, 47 states of tax). Position as companion, in MI/OH/IN, and say so plainly.

| Finding                                                                                             | Tag | New? | Effort |
| --------------------------------------------------------------------------------------------------- | --- | ---- | ------ |
| "Approval" claim outruns the matcher — false green checks reach customer paper                      | 🚫  | NEW  | M      |
| No positioning decision: adopt COMPANION-to-DMS explicitly + ship the one-liner                     | 🚫  | NEW  | S      |
| "JD Power" on customer PDFs with no license (also a competitive liability)                          | 🚫  | NEW  | S      |
| Book-value strategy undecided: BYO-CSV ($0 COGS) vs licensed feed (unverified cost)                 | 🌱  | NEW  | S      |
| No F&I menu — correctly out of scope under companion positioning                                    | 🌱  | NEW  | L      |
| Bake-off gaps (DMS/credit/e-sign/reports/billing) parked in Q3/Q4 — right call; pre-empt the script | 🌱  | KU   | L      |
| MI/OH/IN-only tax constrains pilot geography — own it as a strength                                 | 🌱  | NEW  | M      |

---

## 6. The Pilot-Blocker List

All 66 blockers (48 gap + 18 code P1), consolidated into **12 workstreams** ordered by risk×effort.
Constituent finding IDs reference the registers (G = Appendix C.1, C = Appendix C.2).
Owner legend: **me** = I can execute on your go · **you** = a decision or non-code action ·
**counsel** = lawyer hour(s) · **vendor** = third-party signup.

| #   | Workstream                                                                                                                                                                                                                       | What it closes                                         | IDs                                | Effort | Owner                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------- | ------ | ---------------------------- |
| 1   | **Un-break production** — CSP allowlist (NHTSA, tesseract self-host, HIBP), replay the missing prod migrations, install Renovate, bump @google/genai (ws CVE)                                                                    | Two dead features, schema drift, dead security checks  | C3 C4 G52 + §3 deps                | S      | me                           |
| 2   | **Register the domain + truth-pass the legal stubs** — buy ltvdeskingpro.com, fix false ToS/Privacy claims (Stripe, 99.9%, export/deletion, credit-data)                                                                         | Bounced support email, hijack risk, disprovable claims | G59 G60 G61 G10 G7                 | S      | you ($10) + me               |
| 3   | **Customer-paper truth pass** — remove gross profit, fix signature line, complete disclaimers, fix negative-equity rendering, relabel "J.D. Power"→"Book Value", fix "Sample Data Loaded", qualify credit score, blank-APR crash | Reg Z exposure, trademark exposure, embarrassments     | G1 G2 G3 G5 G21 G26 G28 G29 G80 C9 | S–M    | me (+counsel reads result)   |
| 4   | **AI data-protection sprint** — `store:false`, Gemini paid-tier attestation, strip/band NPI in prompts, retention policy page, breach runbook, Safeguards addendum draft                                                         | GLBA/Safeguards red                                    | G8 G9 G11 G12 G13                  | S–M    | me + counsel                 |
| 5   | **Lender-matching integrity** — enforce or visibly badge unchecked caps, fix substring overwrite, real review/diff gate with all tiers, no AI text to customer PDF, staleness stamps, kill fake chart, soften "approval" claims  | False "approvals" reaching customers                   | G20 G27 G31 G32 G33 G77 C5 C11     | M      | me                           |
| 6   | **Roles & access** — hide cost/gross from sales (PB hook), role-gate lender/inventory writes, prod rules probe, user deactivate flag, wire forgot-password, decide registration model                                            | The hired-salespeople no-sale                          | G37 G38 G39 G40 C2                 | M      | me                           |
| 7   | **Evidence trail** — append-only `deal_events` (PDF snapshot on every generate), saved-deal soft-delete + admin-only delete, populate `calculatedData`                                                                           | "What did we show the customer?"                       | G44 G45 G46 G48                    | M      | me                           |
| 8   | **Ops proof** — run the restore drill, fix start.sh empty-DB footgun, UptimeRobot→phone, split previews/dev off prod DB, delete root fly.toml                                                                                    | Unproven backups, prod-data exposure                   | G50 G51 G53 G54 G58                | S      | me + you (drill 1 hr)        |
| 9   | **Floor reliability** — token auto-refresh + 401 handling + expiry message, logout clears deal storage, beforeunload guard, iPad table/keypad pass, Letter PDFs, offline banner                                                  | Mid-deal data loss in front of customers               | G65 G66 G67 G68 G69 C1             | M      | me                           |
| 10  | **Kill false success** — owner-console mutations surface failures, dealer-admin save fix, seeder gated, self-demote guards, upload-input reset, VIN errors surfaced, shortlist sort, filter-page reset                           | Decisions made on unsaved data                         | C5–C8 C10 C12–C18                  | M      | me                           |
| 11  | **Tax correctness (MI pilot scope)** — trade-credit cap, per-deal buyer state, disable/relabel OH/IN until modeled, doc-fee warn                                                                                                 | Silently wrong OTD                                     | G16 G17 G18 G24                    | M      | me + you (verify cap values) |
| 12  | **Pilot kit** — PostHog 5 events, 1-page charter, quote-vs-funded Friday loop, deals CSV export, report-a-problem button, pilot agreement + manual invoice                                                                       | Measurability, rollback, getting paid                  | G62 G71 G72 G73 G74 G75            | S–M    | me + you + counsel           |

**Realistic calendar: 3–5 weeks** of focused work (workstreams 1, 2, 8 are an afternoon each; 5, 6, 9, 10
are the meat). Everything else in this report is **Next/Later** — see §7.

One tagged blocker deliberately deferred: **G19 (multi-scenario desking / payment grid)**. The audit calls
it pilot-blocking; my judgment is a supervised Michigan pilot can run one structure at a time for week one
— but it is the first NEXT item, and if the pilot desk complains in week one, it becomes NOW.

---

## 7. Roadmap — Now / Next / Later

**NOW (pre-pilot, 3–5 weeks):** the 12 workstreams in §6, in that order. Nothing else jumps the line.

**NEXT (during/just after the pilot, the quarter):**
multi-scenario desking + payment grid (G19 — the feature that turns the calculator into a desk) ·
backend-product line items (G22, before any reports work) · buy/sell rate + reserve in the deal flow
(G23) · e2e smoke tests on the four money paths (G55) · AI provenance badges + golden-sheet regression
(G34 G35) · deal attribution via user relation (G41) · login/auth audit events (G49) · P2 code cleanups
(C19–C49, batched) · OH/IN real tax rules **only when** an OH/IN store is actually signing.

**LATER (post-pilot conversion — matches your PRP §2.3, deliberately not pulled forward):**
DMS integration ladder (Tekion → Dealertrack) · 700Credit soft pull · licensed book values (decision
point G79) · e-sign · reports tab · Stripe self-serve billing · leasing (only if a franchise store ever
matters) · multi-store dealer groups (G43/D6) · SOC 2 · two-machine warm standby.

One plan supersedes two: this roadmap + your PRP are reconciled in Appendix D — the PRP's Q3/Q4 ladder
stands; its 20 known-unscheduled items now have explicit Now/Next/Later homes.

---

## 8. Decisions Needed From You

1. **Pilot store & arms-length** — your own store is dogfood, not evidence (G76). Who is dealer #2, and
   are they in Michigan? (The tax engine says they must be, for now.)
2. **Paid or free pilot** — recommend discounted-paid with the 2–4 page agreement from workstream 12;
   paid pilots produce honest feedback.
3. **Companion vs replacement positioning** — this report recommends **companion to the DMS** explicitly
   (G78); approving that one-liner unblocks all pilot materials.
4. **Book values: relabel vs license** — recommend honest relabel now ("Book Value (Trade/Retail)", $0
   COGS); pricing a J.D. Power/Black Book license is a research task, not a pilot need (G26 G79 G80).
5. **Registration model** — self-registration will break when the tightened rules deploy (C2). Recommend:
   invite-only during pilot (admin creates users), revisit self-serve later.
6. **OH/IN scope** — disable the options until real OH/IN tax rules are modeled, or fund that work now
   (G16). Recommend: disable, pilot in MI.
7. **Counsel budget** — one short engagement covers: pilot agreement + Safeguards addendum + ToS/Privacy
   pass + reading the fixed customer PDF (workstreams 2, 3, 4, 12). Everything is drafted for them, so
   this should be hours, not weeks.
8. **The $10 decision** — register ltvdeskingpro.com today. (This one isn't really a decision.)

---

## Appendix A — Methodology & Scope

- **Code audit:** 7 parallel reviewer agents over areas the May audit didn't cover deeply (the hardening
  code itself, both admin dashboards, table/deal surfaces, modal/AI tools, never-audited services and
  hooks, auth flows, dependencies/config). Every P0–P2 claim was then independently re-derived from source
  by a separate adversarial verifier before inclusion; rejected claims are excluded. All 82 findings
  survived verification. (Disclosure: the verification stage was interrupted once by an API session limit
  and resumed from the workflow journal; every verifier ultimately completed.)
- **Scale:** ~130 agents across the two workflows (19 auditors/analysts + ~110 verifiers/support),
  ~4.7M tokens, ~960 tool calls, all read-only against `main` @ `4af4e1e`.
- **Gap analysis:** 12 dimension agents (compliance, product completeness, data trust, AI liability,
  roles, audit trail, operations, commercial, floor UX, pilot design, competitive) answering pre-designed
  audit questions with file/doc/live evidence. Every finding is tagged **PILOT-BLOCKER vs GROWTH** and
  **NEW vs KNOWN-UNSCHEDULED** against `PRODUCTION_READINESS_PLAN.md`.
- **Live checks (GET-only):** health endpoints, the `system_settings` 400 reproduction with control
  probes, `npm audit`/`npm outdated`, repo PR state.
- **Not in scope:** no code changes, no production mutations, no load testing, no formal legal review
  (compliance findings are exposure flags for counsel, not legal advice).

## Appendix B — Compliance Glossary (plain English)

- **Reg Z / TILA** (Truth in Lending Act): the federal rules for telling a consumer the true cost of
  credit. Two ways it touches this app: (1) the math behind any payment you show must be right, and
  (2) a printed/PDF sheet that states a monthly payment is plausibly a credit _advertisement_ — and
  stating a payment is a "trigger term" that legally requires companion disclosures (APR, terms) or, more
  practically for a desking tool, clear "estimate only — not an offer of credit" framing with assumptions
  shown. The dealer (you) is the creditor and carries the liability; the tool must not manufacture
  violations.
- **GLBA / FTC Safeguards Rule:** car dealers who arrange financing are "financial institutions" under
  federal law. Customer income (a pay stub!), credit estimates, and deal terms are protected "nonpublic
  personal information." The Safeguards Rule requires a written security program **and contracts with
  service providers that handle this data** — which is what LTV Desking PRO becomes the day a dealer pays
  for it. Sending pay-stub-derived data through AI providers without retention controls and disclosure is
  exactly what a dealer's compliance reviewer will catch.
- **ECOA / adverse action:** if the tool ever influences a credit decision (today it doesn't pull credit —
  FICO is a salesperson estimate, which keeps it out of this scope), denial-style decisions trigger notice
  requirements. Relevant only when a real credit-pull integration lands.
- **FCRA:** governs consumer credit reports. The app stays out of FCRA scope only as long as FICO inputs
  are clearly labeled as estimates, not pulls. Labeling matters.
- **OFAC screening:** dealers must not transact with sanctioned persons; F&I platforms typically offer a
  name-screen step. Absence is normal for a desking companion but worth a line in positioning.
- **Red Flags Rule:** identity-theft program requirements triggered by storing identity data like SSNs or
  driver's-license numbers. The app currently stores neither — staying that way is the cheapest
  compliance win available.

## Appendix C — Full Findings Register

### C.1 Gap-analysis register (G1–G83)

Format: ID · [tag | novelty | effort] · finding — evidence → fix (compressed; agents' full text retained in audit transcripts).

**D1: Consumer-credit disclosure & advertising exposure (Reg Z / TILA)**

- **G1** [BLOCKER | NEW | S] **Customer-facing PDF prints dealer front-end gross profit, customer credit score, and lender tier names**
  - Evidence: components/pdf/PdfTemplate.tsx:272 — InfoListItem("Front-End Gross", formatCurrency(vehicle.frontEndGross)) sits in the "Customer & Deal Terms" block of the sheet handed to the shopper; same at FavoritesPdfTemplate.tsx:447. Cre…
  - Fix: Remove Front-End Gross from both customer PDF templates immediately (it's a dealer-internal number that hands the shopper your profit and fuels negotiation/UDAP narratives). Decide deliberately whether lender names/tiers and th…
- **G2** [BLOCKER | NEW | S] **Signature lines on a TILA-lookalike itemized payment worksheet (signed four-square / payment-packing exposure)**
  - Evidence: components/pdf/PdfTemplate.tsx:286-321 itemizes Selling Price + Doc Fee + CVR Fee + State/Title Fees + Sales Tax = Total OTD − Cash Down − Net Trade + "Backend Products" (single lump sum, no product itemization) = "Total Amount…
  - Fix: Exposure to review with counsel, not legal advice — but do not soften it: a customer-signed payment worksheet that looks like a credit disclosure is the document plaintiffs' lawyers and state AGs ask for in payment-packing/spot…
- **G3** [BLOCKER | NEW | S] **Disclaimer language is close but incomplete — never says "not an offer of credit" or "subject to credit approval"**
  - Evidence: components/pdf/PdfTemplate.tsx:390 and FavoritesPdfTemplate.tsx:552: "This is a preliminary proposal and not a final contract. All figures are estimates and subject to lender approval." Companion terms are actually present (APR…
  - Fix: One-line copy change, same PR as the signature-line fix: extend the footer to "...not an offer or extension of credit; approval, APR, and terms depend on creditworthiness; this is not a Truth-in-Lending disclosure." Keep APR/te…
- **G4** [growth | KNOWN-UNSCHEDULED | M] **No snapshot of what was actually shown/handed to the customer**
  - Evidence: FavoritesTable.tsx:243-283 — generateDealPdf/share produce a blob, open/share it, and record nothing. Saving a deal is optional and separate (App.tsx:415-472) and the SavedDeal payload omits Settings (docFee, cvrFee, tax rate) …
  - Fix: Schedule the plan's own item: on every PDF generate/share, persist the rendered PDF blob (or full render payload incl. settings + eligibility) to PocketBase with timestamp/user/dealer, and extend audit_log per §6.3. Interim pil…
- **G5** [growth | NEW | S] **Blank APR crashes PDF generation (TypeError on "".toFixed)**
  - Evidence: components/pdf/PdfTemplate.tsx:271 — `dealData.interestRate.toFixed(2)`; at runtime a cleared APR field is "" (DealControls.tsx:92-93, acknowledged in calculator.ts:128-135), so generation throws and the user sees "Failed to ge…
  - Fix: Accidentally protective (you can't print a payment sheet without an APR — payment is already "N/A" per calculator.ts:170-173), but it's still an unhandled crash. Render "—" for a blank rate and suppress the payment box, or bloc…
- **G6** [growth | NEW | S] **In-app payment columns show dollar payments with no estimate labeling or adjacent APR/term**
  - Evidence: InventoryTable.tsx:247-252 and FavoritesTable.tsx:579-584 render a "Payment" column per vehicle; the governing APR/term live in the separate DealControls panel. Contrast: DealStructuringModal.tsx:352-359 does it right — "$X / 6…
  - Fix: Low-cost hygiene: retitle the column "Est. Payment" and add a persistent strip near the tables echoing the active assumptions ("All payments: 72 mo @ 8.9% APR, $2,000 down — estimates only"). Keeps the screen-share scenario con…
- **G7** [BLOCKER | KNOWN-UNSCHEDULED | M] **Legal pages are self-declared placeholders; ToS disclaims compliance liability but cites billing that doesn't exist**
  - Evidence: components/legal/TermsOfService.tsx:19-21 ("⚠️ placeholder pending lawyer review"), :66-71 (§7 correctly pins TILA/Reg Z on the dealership and disclaims compliance liability — right direction), :54-58 (§5 claims "We bill via St…
  - Fix: Book the lawyer review your own ToS comment and risk-register line 661 require before invoicing the pilot store. Keep §7's liability allocation (it is the correct posture for a tool vendor), fix the false Stripe/billing clause,…
    **D2 — Consumer financial data protection & the AI pipeline (GLBA / FTC Safeguards Rule)**

- **G8** [BLOCKER | NEW | S] **Consumer NPI (credit score, income, deal notes) sent to AI providers with provider-side retention left at defaults — OpenAI `store` not disabled**
  - Evidence: api/\_lib/ai/prompts.ts:127-133 JSON.stringify's the full dealData (incl. free-text `notes`, types.ts:36) and filters (creditScore types.ts:40, monthlyIncome types.ts:41) into the prompt; routes.ts:88-97 passes these through as …
  - Fix: One-line fix first: add `store: false` to the OpenAI Responses call today. Then strip fields the model doesn't need — the prompt only uses income/credit for lender-tier matching, so consider sending banded values (e.g. FICO 640…
- **G9** [BLOCKER | NEW | S] **Gemini path can train on dealer data if the configured key is free-tier — and the app cannot tell**
  - Evidence: providerClients.ts:181-206 calls the Google AI (generativelanguage) API with whatever key is in the global ai_provider_keys record; Google's terms allow free-tier prompts to be used for training and human review, paid-tier not.…
  - Fix: Adopt a written rule: Gemini keys must come from a paid-tier (billed) Google Cloud project, verified at key-entry time in the Owner Console with a checkbox attestation and a note in the audit_log. Cheaper alternative: restrict …
- **G10** [BLOCKER | KNOWN-UNSCHEDULED | S] **Privacy Policy and ToS make claims a dealer's compliance reviewer can disprove — including 'we do not collect credit-report data' while storing credit scores**
  - Evidence: components/legal/PrivacyPolicy.tsx:40-42 — 'We do not collect end-customer SSNs, driver's-license numbers, or credit-report data' (saved_deals stores dealer-entered creditScore + monthlyIncome per customer; defensible wording b…
  - Fix: Before the lawyer pass (already planned), spend half a day making the stub merely TRUE: multi-tenant, owner-selected provider, global keys, deletion 'on request via support' rather than a 30-day SLA you can't meet, remove Strip…
- **G11** [BLOCKER | KNOWN-UNSCHEDULED | M] **No data-retention or disposal program for consumer NPI in saved_deals — indefinite storage of name + income + credit score in JSON blobs**
  - Evidence: backend/pb_migrations/1746999004_baseline_saved_deals.js:59-71 — customerName (text), customerFilters JSON (lib/dealMappers.ts:112-114 maps creditScore + monthlyIncome into it), and a 10,000-char free-text notes field, retained…
  - Fix: For the pilot, a documented retention schedule + a tested manual procedure is enough: write a one-page retention policy (e.g. deals auto-purge or anonymize customerName/income 25 months after last update), do the PII inventory …
- **G12** [BLOCKER | KNOWN-UNSCHEDULED | S] **No service-provider agreement / Safeguards addendum to hand a paying dealer**
  - Evidence: FTC Safeguards Rule §314.4(f) obligates the dealer to (1) select service providers capable of maintaining safeguards and (2) contractually require them — the moment a dealer pays, this SaaS is that service provider. No DPA, sec…
  - Fix: Have counsel produce a short service-provider/security addendum (encryption at rest/in transit, subprocessor list, breach notice to dealer within 72 hours, deletion on termination) and attach it to the pilot agreement. This is …
- **G13** [BLOCKER | NEW | S] **No breach-notification or security-incident response plan**
  - Evidence: docs/runbooks/ contains pb-down, db-restore, oom, secrets-rotation, customer-locked-out, ai-rate-limit, r2-backup-setup — zero hits for 'breach' or security 'incident' (grep verified). PRODUCTION_READINESS_PLAN.md §11 checklist…
  - Fix: Write a one-page incident-response runbook: detection sources, who decides it's a breach, dealer notification within X hours, FTC 30-day clock awareness, log/backup preservation steps, and provider key rotation. Pair it with th…
- **G14** [growth | NEW | M] **audit_log never records access to consumer financial data, and every user in a dealership can read/edit/delete every deal**
  - Evidence: backend/pb_migrations/1747600002_create_audit_log.js:4-11 — log covers AI-key admin actions only (confirmed by live facts). saved_deals rules are SAME_DEALER for list/view/create/update/delete (1747400002_tighten_api_rules.js:8…
  - Fix: Extend audit coverage via a PocketBase hook on saved_deals (create/update/delete at minimum; reads are harder in PB and can wait), and document the flat same-dealer access model in the permission matrix the plan already calls f…
- **G15** [growth | NEW | S] **Free-text notes fields are the uncontrolled channel for SSNs — the only realistic Red Flags Rule pull-in**
  - Evidence: Verified clean: no ssn/driver's-license/DOB field exists in types.ts, components, lib, services, or any migration (grep; the only 'ssn' hits were 'className'), pay-stub images are never uploaded or stored (DocumentScanner.tsx:4…
  - Fix: Add an SSN-pattern check (\d{3}-?\d{2}-?\d{4}) that warns on save and redacts from the AI payload, plus placeholder text in the notes field ('Never enter SSNs or license numbers'). Keep resisting SSN/DL fields until the Safegua…
    **D3: Deal-math & desking completeness**

- **G16** [BLOCKER | NEW | M] **Tax engine models only a Michigan dealer; OH/IN options and any 4th state produce silently wrong tax**
  - Evidence: services/calculator.ts:67-94 — TAX_RATES has only MI/OH/IN, unknown state silently falls back to 6% (`TAX_RATES[defaultState] ?? 0.06`), and non-MI states get Michigan's reciprocity cap min(6%, rate) + transit fee, i.e. 'MI dea…
  - Fix: For the pilot: Michigan dealers only, and relabel/disable the OH/IN options (today they mean 'MI dealer, out-of-state buyer'). Before signing any OH/IN store, implement real dealer-state rules (OH: county rate table, no used tr…
- **G17** [BLOCKER | NEW | S] **Michigan trade-in tax credit modeled as unlimited — tax understated on larger trades**
  - Evidence: services/calculator.ts:105 — `Math.max(0, price - tradeInValue)` deducts the full trade value from the taxable base. Michigan statutorily caps the trade-in credit (indexed annually, on the order of ~$12K in 2026 — verify the cu…
  - Fix: Add a settings-configurable MI trade-credit cap and clamp the deduction; surface the capped amount on the deal sheet. Cheap fix, real-dollar exposure on exactly the bigger deals a pilot store will showcase.
- **G18** [BLOCKER | NEW | M] **No per-deal buyer state — tax state is one global dealership setting**
  - Evidence: types.ts:28-37 — DealData has no state/buyer-state field; calculateSalesTax reads only settings (calculator.ts:65). To desk one Ohio buyer, an MI store must flip the global 'Dealership State' in Settings (SettingsModal.tsx:213-…
  - Fix: Add a per-deal buyer-state selector (defaulting from settings) feeding calculateSalesTax. Until shipped, make flip-and-restore an explicit training point for pilot users and show the active tax state on the deal screen and PDF.
- **G19** [BLOCKER | NEW | M] **Single global deal structure — no multi-scenario hold, no term-by-down payment grid**
  - Evidence: context/DealContext.tsx:152 — one `dealData` object in localStorage; DealControls.tsx:248-251 literally titles it 'Global Deal Structure'; DealStructuringModal.tsx:118 writes through to the same global object, so 'structuring' …
  - Fix: Add 2-4 named scenario slots per customer plus a 3x3 term-by-down payment grid on the deal screen/PDF. Presenting options is the desk manager's actual job; this is the single feature that turns the calculator into a desking too…
- **G20** [BLOCKER | NEW | S] **Lender caps extracted from rate sheets are stored but never enforced — false 'eligible' verdicts**
  - Evidence: types.ts:71-96 defines frontEndLtv, maxAdvance, maxBackend, maxBackendPercent, maxRate, tier-level maxPti/maxDti/minIncome, vehicleType, excluded/includedMakes — services/lenderMatcher.ts:91-148 checks only FICO, year, mileage,…
  - Fix: Enforce at minimum maxBackend/maxBackendPercent, tier maxPti, maxRate vs the quoted APR, and excludedMakes inside checkBankEligibility — or visibly badge those fields 'not checked'. The AI extraction feature is the product's wo…
- **G21** [BLOCKER | NEW | S] **Negative equity garbled on the customer-facing PDF (double negative, no rollover line)**
  - Evidence: components/pdf/PdfTemplate.tsx:195+298 — renders `- ${formatCurrency(netTradeIn)}`, so an upside-down trade prints as 'Net Trade-In - -$3,000'; same in FavoritesPdfTemplate.tsx:376+468. Math is correct (rollover is properly fin…
  - Fix: Render an explicit 'Negative equity added to amount financed: +$X' row when payoff > trade value. Frame as exposure to review with counsel: rollover presentation on consumer-facing paper is exactly what examiners and plaintiff'…
- **G22** [growth | KNOWN-UNSCHEDULED | L] **No backend product menu: one lump dollar, no per-product cost/price, no backend gross**
  - Evidence: types.ts:32 — `backendProducts: number` is the entire backend data model; DealControls.tsx:289-300 is a single 'Backend ($)' input. No VSC/GAP line items, no cost-vs-price, so backend gross and PVR are uncomputable. PRODUCTION\_…
  - Fix: Deskable without it for a pilot (managers carry product pricing in their heads), so not a blocker — but schedule the itemized-product data model BEFORE the §6.5 reports tab and §6.4 Sentinel work, since both are downstream of i…
- **G23** [growth | NEW | M] **No buy-rate/sell-rate or reserve in the desking flow; the standalone reserve tool syncs the wrong principal**
  - Evidence: DealData carries one APR (types.ts:34); tier baseInterestRate/rateAdder/maxRate surface only in LenderProfileModal.tsx:443 and the cheat-sheet PDF — never in the deal. No markup-cap check against the quoted rate. FinanceTools.t…
  - Fix: Quick win now (S): sync resAmount from vehicle.amountToFinance. Post-pilot (M): once a matched lender tier is selected, carry its buy rate into the deal, compute reserve in-line, and warn when quoted APR exceeds tier maxRate — …
- **G24** [growth | KNOWN-UNSCHEDULED | S] **Doc fee accepts any number — no validation against Michigan's statutory cap**
  - Evidence: SettingsModal.tsx:86-95 clamps numeric settings to >= 0 only; services/validator.ts:1-34 has no docFee rule. MI caps doc fees by statute (indexed annually — verify the current figure). PRODUCTION_READINESS_PLAN.md §5.6 (line 32…
  - Fix: Warn (don't block) when docFee exceeds the configured state cap. Frame as exposure to review with counsel: the tool over-charging isn't the app's liability, but a desking tool that lets a $695 doc fee through in Michigan looks …
- **G25** [growth | NEW | S] **Rebates/incentives cannot be represented at all**
  - Evidence: grep for rebate/incentive across components/, services/, context/, lib/, types.ts: zero hits. No DealData field exists.
  - Fix: Genuinely deferrable past the pilot: manufacturer rebates are a new-car phenomenon and rare paper at a used-car independent. When added, it's one DealData field — but tax treatment of rebates differs by state, so land it togeth…
    **D4 — Trust-critical data integrations & freshness**

- **G26** [BLOCKER | NEW | S] **Dealer-keyed book values labeled "J.D. Power" across UI and customer-facing PDFs — no license or feed exists**
  - Evidence: services/fileParser.ts:163-164 (values come from dealer CSV columns); components/pdf/PdfTemplate.tsx:256-257 and FavoritesPdfTemplate.tsx:431-432 (consumer-facing "JD Power (Trade/Retail)"); FavoritesTable.tsx:356/361, Inventor…
  - Fix: Global relabel to "Book Value (Trade)" / "Book Value (Retail)" with a settings field for the dealer's book source name, plus a PDF footnote "Book values entered by dealership." Keep CSV header auto-detection for "J.D. Power" co…
- **G27** [BLOCKER | NEW | M] **Lender programs carry no visible effective date, last-verified stamp, or staleness warning — effectiveDate is captured then thrown away**
  - Evidence: types.ts:115 effectiveDate exists; api/\_lib/ai/prompts.ts:14 instructs the AI to extract it; lib/pocketbase.ts:168 persists it; zero renders in LenderProfileModal.tsx or LenderProfiles.tsx list; services/lenderMatcher.ts has no…
  - Fix: Surface effectiveDate in the lender list and edit modal, add a "last verified" timestamp set on every save/extraction, and show an amber badge when a program is >30-60 days old (configurable). Fix the payload mappers so enrichm…
- **G28** [BLOCKER | NEW | S] **Real inventory displays under "Sample Data Loaded" after page reload; no "data as of" date anywhere**
  - Evidence: context/DealContext.tsx:190 (fileName defaults to "Sample Data Loaded"); App.tsx:247 is the only setFileName call (fresh import only); App.tsx:659 renders fileName unconditionally next to the vehicle count, so persisted PocketB…
  - Fix: Persist fileName and an importedAt timestamp with the inventory (or derive from PocketBase record `updated`), and render "<filename> — imported <date>" in the header. The mislabel is a one-line trust bug; the date stamp also an…
- **G29** [growth | NEW | S] **Credit score input and consumer PDFs lack "estimated / customer-stated" qualifier (FCRA posture is otherwise clean)**
  - Evidence: components/DealControls.tsx:137 bare "Credit Score" label; PdfTemplate.tsx:269 and FavoritesPdfTemplate.tsx:273,444 print unqualified "Credit Score" on consumer-facing PDFs. Mitigants: no bureau integration exists anywhere, Pri…
  - Fix: Relabel to "Credit Score (estimated)" in DealControls and "Estimated Credit Score (customer-stated)" on PDFs. Today nothing implies a real credit pull, so the app stays out of FCRA scope — this is exposure to review with counse…
- **G30** [growth | KNOWN-UNSCHEDULED | L] **DMS / 700Credit / licensed book-value integrations are planned but unscheduled, and the PRP has no interim honest-labeling workstream**
  - Evidence: PRODUCTION_READINESS_PLAN.md roadmap rows 141-142 (DMS Tekion/Dealertrack XL $20-40K; 700Credit/RouteOne credit pull L $15-25K, both status 📋), §6.1 (DMS ladder: Tekion first), §6.2 (book values: KBB/Black Book/MMR/J.D. Power, …
  - Fix: Keep the integration sequencing as written (Tekion -> Dealertrack; 700Credit soft pull next) — it is the right ladder for ACV, not a pilot requirement. Add a small "data honesty" workstream to the PRP now (findings 1-4, roughly…
    **D5: AI-output reliability & liability**

- **G31** [BLOCKER | NEW | M] **No real human-review gate: one click saves all extracted lenders, hides tiers past the first 4, and silently overwrites existing profiles with no diff**
  - Evidence: components/AiLenderManagerModal.tsx:223-310 (handleConfirm batch-saves everything), :619 tiers.slice(0,4) + :688 '+N more tier(s)...' (unseen tiers confirmed blind), :247-265 (case-insensitive name match overwrites existing pro…
  - Fix: Make the results screen an actual review: show ALL tiers, add per-lender and per-tier include/exclude checkboxes, allow inline edits of the matching-critical fields (FICO, LTV, term, rate), and when a name matches an existing l…
- **G32** [BLOCKER | NEW | S] **AI-generated text and numbers can reach the customer-facing deal sheet unmarked (Apply -> notes -> PDF)**
  - Evidence: components/AiDealAssistant.tsx:61-66 (applySuggestion merges proposedChanges incl. notes into dealData); api/\_lib/ai/schemas.ts:260 (notes is AI free text); services/pdfGenerator.ts -> components/pdf/PdfTemplate.tsx:236 prints …
  - Fix: Cheapest fix: stop merging the AI 'notes' field on Apply (or show it for explicit editing first), and add one line of in-product framing on the AI Desk Manager panel ('Internal desking aid — verify before presenting; not financ…
- **G33** [BLOCKER | NEW | M] **Partially-extracted tiers silently match MORE deals — missing constraints are skipped, and the matcher ignores confidence entirely**
  - Evidence: services/lenderMatcher.ts:96-143 (every tier check guarded by !== undefined, e.g. :130 maxLtv — absent field = constraint not enforced); no reads of tier.confidence or extractionSource anywhere in lenderMatcher.ts; AiLenderMana…
  - Fix: This is the quiet wrong-answer path: an LTV cap the model failed to read makes the lender look like a fit for a 140% LTV deal. Either require the matching-critical trio (FICO range, maxLtv, maxTerm) before a tier participates i…
- **G34** [growth | NEW | S] **No AI provenance downstream: saved lender lists and matching results don't distinguish AI-extracted from hand-entered data; no PDF-page provenance exists**
  - Evidence: components/LenderProfiles.tsx:599-625 (confidence bar only, only when expanded); extractionSource (types.ts:100, enum table/text/header/inferred — no page number, api/\_lib/ai/schemas.ts:38) is never rendered in any component; e…
  - Fix: Add an 'AI-imported (date, source file)' badge on lender rows and persist the source filename on import; ask the extraction model for a page number per tier and store it so a dealer can flip to page 3 of the rate sheet to verif…
- **G35** [growth | NEW | M] **No golden-file regression for extraction — model drift would be discovered by a dealer, not a test**
  - Evidence: api/\_lib/ai/schemas.test.ts: 3 cases on hand-written minimal JSON (schema-shape only, no real rate-sheet fixtures); live facts: no e2e tests; lib/aiModelRegistry.ts:38 hardcoded model list 'verified 2026-05-14'; modelSelection.…
  - Fix: Build a golden set of 3-5 real (NDA-safe/redacted) lender rate sheets with hand-verified expected tier JSON; run extraction against them on a schedule and on any model/provider change, diffing the matching-critical fields. The …
- **G36** [growth | NEW | S] **OCR income confirm step exists but conflates pay-period/YTD figures with monthly income**
  - Evidence: components/DocumentScanner.tsx:150-176 (confirm card, good); :153 labels result 'Detected monthly income' but :65-68 regex captures Net/Gross Pay (a per-pay-period figure) and the bare \b(Net|Gross)\b fallback can grab YTD gros…
  - Fix: Keep the confirm step (it's adequate as a consent gate) but add a pay-frequency selector (weekly/biweekly/semimonthly/monthly) that converts to monthly before applying, show the matched label ('found next to: Net Pay') so the u…
    **D6: Roles, permissions & dealership org reality**

- **G37** [BLOCKER | NEW | M] **Sales role can read unitCost / front-end gross everywhere (API and UI) — PB has no field-level rules**
  - Evidence: backend/pb_migrations/1747400002_tighten_api_rules.js:21,87-94 — inventory list/view rule is SAME_DEALER with no role term; unitCost is a plain field (1746999002_baseline_inventory.js:49). UI shows it to all roles: InventoryTab…
  - Fix: PocketBase cannot do field-level rules, so hiding cost requires: (a) an onRecordEnrich hook in pb_hooks that calls e.record.hide('unitCost') for non-admin/non-superadmin auth (cheapest, recommended), plus (b) role-gating the Fr…
- **G38** [BLOCKER | NEW | S] **Sales can create/edit/delete lender programs, book values, prices, and whole inventory rows — no role gate in rules, hooks, or UI**
  - Evidence: 1747400002_tighten_api_rules.js:87-96 — sameDealerAll (create/update/delete = SAME_DEALER, any role) on inventory, lender_profiles, saved_deals. backend/pb_hooks/dealer_guard.pb.js enforces tenancy only, zero role checks. UI: A…
  - Fix: Flip lender_profiles and inventory update/delete (and lender_profiles create) to SAME_DEALER_ADMIN in a new migration — it's a one-constant change in the existing rule file. Decide whether sales may run CSV imports (probably ad…
- **G39** [BLOCKER | NEW | S] **Cannot verify the tightened rules are actually live on prod — sibling migration from the same deploy never applied**
  - Evidence: Live fact (2026-06-10): system_settings collection (1747400000, same deploy trio as the rules migration per PRODUCTION_READINESS_PLAN.md Appendix A.1) does not exist on prod. 1747400002_tighten_api_rules.js:67-77 also self-skip…
  - Fix: Run a 30-minute prod probe with a throwaway sales-role account: (1) unauthenticated list of lender_profiles/dealers must return 401/empty; (2) sales-role read of another dealer's inventory must fail; (3) PATCH own role to super…
- **G40** [BLOCKER | KNOWN-UNSCHEDULED | M] **Employee departure: no deactivate/suspend — hard delete is the only kill switch, and admin cannot reset a password**
  - Evidence: users schema has no status/active/suspended field — only firstName/lastName/phone/dealer/role (1746999001_baseline_users_fields.js:30-62). DealerAdminDashboard.tsx:140-150 offers only Delete ('They will lose access immediately'…
  - Fix: Pilot-week fixes: wire the forgot-password link to the existing lib reset flow, and verify the admin edit-email path doesn't 400 against prod (manageRule). Then: add an 'active' bool to users, check it in every collection rule …
- **G41** [growth | NEW | M] **Deal attribution is a free-typed string; the user relation captures whoever was logged in, not who sold the car**
  - Evidence: types.ts:142,172 — salespersonName: string on SavedDeal and DealPdfData; saved_deals schema stores it as a 200-char TextField (1746999004_baseline_saved_deals.js:60) alongside a separate required user relation that saveDeal fil…
  - Fix: Add an optional salesperson relation to users with a picker populated from the dealership's user list (keep free text as fallback for unlicensed floor staff). Do this before building the /reports tab the plan wants (PRODUCTION\_…
- **G42** [growth | KNOWN-UNSCHEDULED | M] **The 'manager' role exists in the schema but grants exactly nothing — there is no desk-manager tier**
  - Evidence: users.role select includes 'manager' (1746999001_baseline_users_fields.js:59) and SuperAdminDashboard renders a manager badge (SuperAdminDashboard.tsx:1488), but every rule predicate is ADMIN_OR_SUPER (1747400002:15) and every …
  - Fix: When you do findings #1/#2, define the matrix in the same pass: sales = desk deals, no cost/gross, read-only lenders; manager = cost/gross visible, edit lenders/inventory, no user management; admin = + user management; superadm…
- **G43** [growth | KNOWN-UNSCHEDULED | L] **Multi-store dealer groups structurally break: dealer = one rooftop, user = one dealer**
  - Evidence: dealers is a single-rooftop record (name/address/city/state — 1746999000_baseline_dealers.js:33-42); users.dealer is maxSelect:1 (1746999001:42-49); all data rules pivot on exactly one dealer id. A group F&I director needs N lo…
  - Fix: Do not sell to a multi-store group until dealer_group exists — say 'single-rooftop for now' in sales conversations rather than improvising shared logins (which would also destroy the deal attribution in finding #5). When schedu…
    **D7: Audit trail & evidentiary record — "what did we show the customer?"**

- **G44** [BLOCKER | KNOWN-UNSCHEDULED | M] **Customer-facing PDFs are ephemeral: no rendered artifact, input snapshot, or generation event stored anywhere**
  - Evidence: services/pdfGenerator.ts:99 returns pdf.output('blob'); all callers are blob→objectURL→window.open/navigator.share with no persistence: App.tsx:541-545, components/FavoritesTable.tsx:243-283, components/LenderProfiles.tsx:226. …
  - Fix: Cheapest credible artifact: a new append-only PB collection `deal_events` (dealer relation, user relation, action: pdf_generated|pdf_shared|deal_saved|deal_deleted, customerName, vin, snapshot JSON = full DealPdfData + Settings…
- **G45** [BLOCKER | NEW | S] **The plan's proposed mechanism for disclosure snapshots (extend audit_log) was invalidated by the audit_log lockdown migration**
  - Evidence: PRODUCTION*READINESS_PLAN.md §6.3: 'The shipped audit_log collection is the right substrate — extend action enum to include tila_disclosure_shown.' But backend/pb_migrations/1747700000_lock_audit_log_create.js:24-25 sets audit*…
  - Fix: Update the plan: audit_log stays the superadmin/platform log; disclosure & deal events go into the separate dealer-readable deal_events collection from the previous finding. This is a 30-minute plan correction that prevents som…
- **G46** [BLOCKER | NEW | S] **Saved deals can be silently rewritten or hard-deleted by any store user — no versioning, no soft-delete, no deletion trace**
  - Evidence: backend/pb_migrations/1747400002_tighten_api_rules.js:87-96 grants update AND delete on saved_deals to ANY same-dealer authenticated user (including 'sales'). UI exposes one-click permanent delete: DealHistoryPanel.tsx:265 / Sa…
  - Fix: One small migration: saved_deals updateRule/deleteRule → admin-or-superadmin only (reuse SAME_DEALER_ADMIN), and change the UI delete to a soft-delete (status='cancelled') plus a deal_deleted event in deal_events. This preserve…
- **G47** [growth | NEW | S] **"Every deal Jim quoted last week" is not answerable: attribution is a free-text name box and unsaved quotes leave zero trace**
  - Evidence: Salesperson is hand-typed (components/DealControls.tsx:128-135) and disconnected from the authenticated user; DealHistoryPanel.tsx:55-58,72-74 builds its salesperson filter from these free-text strings, so 'Jim'/'jim'/'James'/b…
  - Fix: Prefill salespersonName from the logged-in user's firstName/lastName and add a 'filter by user account' option in DealHistoryPanel keyed on the existing user relation. The deal_events collection (finding 1) closes the unsaved-q…
- **G48** [growth | NEW | S] **Even saved deals don't capture the lender-approval grid the customer saw, and the schema's calculatedData field is never populated**
  - Evidence: saveDeal payload (App.tsx:445-458) writes vehicleData (which does snapshot monthlyPayment/otdLtv/salesTax via the serialized CalculatedVehicle — good), dealData, customerFilters, notes — but NOT the lenderEligibility array rend…
  - Fix: On save, populate calculatedData with { lenderEligibility, settings, appVersion }. ~20 lines in App.tsx handleSaveDeal; no migration needed since the field exists. Makes every saved deal self-contained evidence even before deal…
- **G49** [growth | NEW | M] **No login/auth events in any log — audit_log covers only 3 AI-key actions**
  - Evidence: Confirmed: the only writeAuditLog call sites are ai_key_updated/ai_key_cleared (lib/api.ts:867-872) and ai_key_tested (lib/api.ts:901-905). lib/auth.ts login() (line 17-19, authWithPassword) records nothing. backend/pb_hooks/ c…
  - Fix: Add a PB onRecordAuthRequest hook (sibling to log.pb.js) writing login success/failure to audit_log server-side (server hooks bypass the superadmin-only createRule). Defer until after the pilot-blockers; it matters more once mu…
    **D8 — Operational readiness for a paid pilot**

- **G50** [BLOCKER | KNOWN-UNSCHEDULED | S] **Litestream restore drill documented but never executed — backups are unproven**
  - Evidence: docs/runbooks/db-restore.md + r2-backup-setup.md:70 ('Verifying a restore — do this quarterly'); PRODUCTION_READINESS_PLAN.md §2.1 marks it P0 'due this week' as of 2026-05-16; live fact 2026-06-10: never executed (3.5 weeks ov…
  - Fix: Run the documented scratch-app drill this week (r2-backup-setup.md steps 1-4, ~1 hr), record row counts vs prod, and put the next drill on an actual calendar with a reminder — the PRP scheduled it once and it slipped silently.
- **G51** [BLOCKER | NEW | S] **start.sh restore-failure path boots an empty DB and replicates it to R2 as the newest backup generation**
  - Evidence: backend/start.sh:46-53: 'timeout 30s litestream restore' → on failure logs 'starting with fresh DB' and boots anyway; Litestream replicate then creates a new generation from the empty DB. db-restore.md ('How the restore knows w…
  - Fix: Change start.sh so that when LITESTREAM\_\* secrets are set and no data.db exists, a failed restore ABORTS the boot (exit 1, let Fly health checks scream) instead of starting fresh; require an explicit ALLOW_FRESH_DB=1 env to boo…
- **G52** [BLOCKER | NEW | M] **Prod schema drifted from migrations despite green deploys — system_settings missing, and 13/14 migrations have silent [skip] guards**
  - Evidence: Live fact: system_settings 400s on prod. gh run list: 'Deploy Backend to Fly' succeeded 2026-05-31 with migration 1747400000_create_system_settings.js in the image — so it's likely marked applied in \_migrations while its effect…
  - Fix: Remediate safely: (1) fly ssh in, take a manual sqlite snapshot, (2) query \_migrations vs actual collections, (3) delete the stale \_migrations rows for 1747400000 and 1747600001 (aiDefaults) and restart PB so they re-run — exac…
- **G53** [BLOCKER | NEW | S] **Nothing pages a phone when PocketBase is down or /api/ai errors spike**
  - Evidence: Sentry is frontend-only (live fact; lib/sentry.ts); docs/runbooks/pb-down.md lists 'Sentry alerts fire for PB connection errors' as a symptom, but frontend Sentry only fires if a user has the app open. No schedule: trigger in a…
  - Fix: Today: free UptimeRobot/BetterStack monitor on https://ltv-desking-pro-api.fly.dev/api/health and on the Vercel frontend, SMS+call to your phone, 1-minute interval — 30 minutes of work, $0. Then add Sentry to the /api/ai server…
- **G54** [BLOCKER | NEW | M] **No staging environment — Vercel previews and local dev hit PRODUCTION data by default**
  - Evidence: lib/pocketbase.ts:5 — prod URL is the hardcoded fallback when VITE_POCKETBASE_URL is unset; .env.example explicitly says to leave Sentry/env unset 'on PR previews', and .env.local:2 states 'Frontend talks to the production Pock…
  - Fix: Stopgap this week (S): remove the prod fallback in lib/pocketbase.ts — throw a visible error if VITE_POCKETBASE_URL is unset — and set the Preview-environment var in Vercel to a non-prod value. Real fix (M): a $5/mo second Fly …
- **G55** [growth | NEW | M] **Zero e2e coverage on the four money paths; Playwright is installed but unused**
  - Evidence: package.json:63 has playwright ^1.60.0 in devDependencies but no playwright.config._ or _.spec.ts exists anywhere; only 'test: vitest' (9 unit-test files, ~122 cases — live fact). check.yml runs unit tests only.
  - Fix: Four smoke specs, in priority order: (1) CSV/XLSX import → inventory grid shows correct rows/book values (services/fileParser.ts), (2) desk a deal: price/down/trade/term/APR → assert exact payment/OTD/LTV (services/calculator.t…
- **G56** [growth | KNOWN-UNSCHEDULED | M] **Saturday-outage story: one machine, one region, one human — and recovery assumes a laptop with flyctl**
  - Evidence: backend/fly.toml: single [[vm]], primary_region 'ord', min_machines_running=1, no standby. PRP §4.1 lists 'Two-machine warm standby' as 📋 undated. Runbooks (pb-down.md) are good but every recovery path starts with fly/gh CLI; t…
  - Fix: Cheap wins first: fly-diag.yml and recover-fly.yml are workflow_dispatch — document in the runbook README that both are runnable from the GitHub MOBILE app, and rehearse triggering them from your phone once. Name a backup human…
- **G57** [growth | NEW | S] **No dealer data export or deletion mechanism, but the live Privacy Policy promises both**
  - Evidence: components/legal/PrivacyPolicy.tsx:69 'Export your data on request', :71-72 'Hard-delete completes within 30 days; backups roll out of retention within 14 days.' No export code in lib/api.ts, no CSV export (capabilities), no ac…
  - Fix: Write a one-page docs/runbooks/dealer-offboarding.md: superadmin-authenticated API pulls of inventory/lender_profiles/saved_deals/users filtered by dealer → JSON/CSV, then record deletion steps — and TEST it once against the st…
- **G58** [growth | NEW | S] **Stale root fly.toml targets a second app with no volume — a 2am-incident footgun**
  - Evidence: Root fly.toml: app = 'ltv-desking-pro' (not -api), min_machines_running=0, no [[mounts]], no health check; the real backend config is backend/fly.toml (app 'ltv-desking-pro-api'). 'fly deploy' run from repo root during an incid…
  - Fix: Delete the root fly.toml (frontend lives on Vercel; it serves no purpose) or replace it with a README pointing at backend/fly.toml. Five minutes, removes a mistake you'd only make under pressure.
    **D9: Commercial & legal readiness**

- **G59** [BLOCKER | NEW | S] **Support/legal email domain ltvdeskingpro.com is not registered — every contact promise in the app is dead, and the domain is hijackable**
  - Evidence: Live check today: `whois ltvdeskingpro.com` → "No match for domain" at Verisign; no MX/A/NS records. Hardcoded at App.tsx:1027 (footer mailto:support@ltvdeskingpro.com), components/legal/PrivacyPolicy.tsx:89 (support@), compone…
  - Fix: Register ltvdeskingpro.com today (~$10 — also closes the hijack/phishing hole), set up a monitored mailbox or forward to your real inbox, and verify a test email round-trips. Until then, change all three hardcoded addresses to …
- **G60** [BLOCKER | KNOWN-UNSCHEDULED | M] **Terms of Service is a stub containing false statements: claims Stripe billing that doesn't exist and a 99.9% uptime target you can't honor; no liability cap for calculation errors**
  - Evidence: TermsOfService.tsx:4-8 self-describes as 'Stub... Not a final document'; §5 (line 56): 'We bill via Stripe' — no Stripe dependency in package.json, no billing code anywhere; §6 (line 62): 'We target 99.9% monthly uptime' — sing…
  - Fix: Same-day: delete the Stripe and 99.9% sentences and the always-today 'Last updated: {new Date()}' stamp — false statements in accepted terms are worse than thin terms. Before the first paid invoice: have counsel produce real te…
- **G61** [BLOCKER | NEW | S] **Privacy Policy stub promises data-export and 30-day account deletion the product cannot perform, and omits that you store end-customers' names and income**
  - Evidence: PrivacyPolicy.tsx:67-75 promises 'Export your data on request' and 'Delete your account... Hard-delete completes within 30 days' — no export or deletion code exists anywhere (grep for deleteAccount/export across lib/ and compon…
  - Fix: One-day edit: change export/deletion to 'available on written request to support; fulfilled manually within 30 days' (which you CAN do via PocketBase admin + the db runbooks), add 'end-customer name, credit-score band, and stat…
- **G62** [BLOCKER | NEW | M] **No pilot agreement or billing path exists — the plan's only commercial track is full Stripe self-serve, which is overkill for a 1-3 dealer pilot**
  - Evidence: Repo-wide search: zero agreement/MSA/order-form/pilot docs (docs/ contains only ops runbooks); no Stripe in package.json. PRODUCTION_READINESS_PLAN.md §8.2 (lines 466-474) and launch checklist line 611 schedule 'Stripe Billing …
  - Fix: Realistic path: a 2-4 page counsel-reviewed Pilot Agreement + a monthly Stripe/QuickBooks invoice (no integration needed). The agreement must cover: liability cap at fees paid; 'all figures are estimates — dealer owns final TIL…
- **G63** [growth | NEW | S] **Data export and account deletion features absent with no documented manual offboarding runbook**
  - Evidence: No export/deletion code (confirmed by search; stated capability gaps). docs/runbooks/ covers db-restore, pb-down, oom, secrets-rotation, customer-locked-out — no 'customer offboarding / data return' runbook. Privacy stub (Priva…
  - Fix: Write a one-page offboarding runbook now (PocketBase admin export of the dealer's vehicles/lenders/saved-deals collections to JSON/CSV, user deletion, R2 backup retention note) so the pilot-agreement 'data return on exit' claus…
- **G64** [growth | KNOWN-UNSCHEDULED | S] **Regulatory exposure for counsel review: FTC Safeguards Rule service-provider clause is the real ask; CA/CO consumer-privacy exposure is minimal at pilot scale**
  - Evidence: Dealers are MI/OH/IN only (types.ts:177 AppState = "MI" | "OH" | "IN"); out-of-state buyers are contemplated (types.ts:186 outOfStateTransitFee) but CCPA/Colorado CPA applicability thresholds (~$25M revenue / 100k consumers) ar…
  - Fix: Frame for counsel, not as legal advice: add a short security/Safeguards-Rule exhibit to the pilot agreement (encryption, access control, breach notice within 72h, subprocessor list — you already have the honest list in PrivacyP…
    **D10: Floor-readiness UX (device, connectivity, paper, persona)**

- **G65** [BLOCKER | NEW | M] **Session hard-expires mid-deal with no refresh, no expiry message, and partial work loss**
  - Evidence: grep authRefresh: only server-side api/\_lib/ai/auth.ts:63 — never called in frontend; lib/auth.ts:92-98 logout() = pb.authStore.clear() + window.location.reload(); context/DealContext.tsx:165-167 customerName/salespersonName/ac…
  - Fix: Call pb.collection('users').authRefresh() on app boot and on a timer so active users never expire (PocketBase default token TTL ~14 days from login, not sliding). Intercept 401s once in lib/api.ts and show 'Your session expired…
- **G66** [BLOCKER | KNOWN-UNSCHEDULED | M] **Payment column off-screen and sub-44px tap targets on iPad — the stated primary device**
  - Evidence: InventoryTable.tsx:78-255 defines 15 columns with no responsive hiding; Payment is column 14, inside VirtualizedTable overflow-auto (components/common/VirtualizedTable.tsx:110) so it requires horizontal scroll on iPad portrait …
  - Fix: Before pilot, do the plan's own §5.4 work for the inventory table only: hide low-value columns (Stock#, VIN, Book) below lg: so Payment and OTD LTV are always visible on iPad portrait, and bump row-action tap targets to 44px. F…
- **G67** [BLOCKER | NEW | S] **All 12 deal-input fields are bare type="number": no decimal keypad on iPad, and scroll-wheel can silently change APR/price**
  - Evidence: grep inputMode/inputmode across repo: zero hits; components/DealControls.tsx:139-327 twelve type="number" inputs; grep onWheel: zero hits — Chrome/Edge change a focused number input's value on wheel/trackpad scroll, so scrollin…
  - Fix: Half-day fix: add inputMode="decimal" (currency/rate) or inputMode="numeric" (term/mileage) to every deal input for the iPad number pad, and add onWheel={(e)=>e.currentTarget.blur()} (or a shared NumberInput wrapper) to kill si…
- **G68** [growth | NEW | S] **No offline awareness and single-shot saves — Wi-Fi blip is indistinguishable from a broken app**
  - Evidence: grep navigator.onLine / 'offline' across repo: zero hits — no banner, no detection; lib/api.ts:462-480 saveDeal is one attempt returning null; lib/queryClient.ts:18 retry: 0 for mutations; App.tsx:462-471 failure → toast only, …
  - Fix: Add a window online/offline listener with a thin amber 'Working offline — changes will save when you reconnect' banner, and one automatic retry-with-backoff on saveDeal. A queued-save service worker is overkill for pilot; the b…
- **G69** [growth | NEW | S] **PDFs are A4-sized raster screenshots; lender match/no-match distinction is color-only in B&W**
  - Evidence: services/pdfGenerator.ts:74 format: "a4" (US dealers print Letter — output scales/shifts on every print); pdfGenerator.ts:61-99 html2canvas→PNG→jsPDF means non-vector text (~192dpi effective at scale 2) — 7.5-9pt gray labels (#…
  - Fix: One-line fix now: format: "letter". Add a ✓/✗ glyph or 'NO MATCH' text next to lender items so B&W printouts keep the distinction, and bump minimum PDF text to 9pt non-gray. Vector-text PDFs (jsPDF text API or react-pdf) is a l…
- **G70** [growth | NEW | S] **App opens showing every car priced with the PREVIOUS customer's deal numbers**
  - Evidence: DealContext.tsx:152-157 dealData (down payment, trade-in, APR override) persists in localStorage indefinitely and feeds the Payment column for all inventory on open (DealContext.tsx:388-392); mitigated by the blue summary bar s…
  - Fix: On app open, if persisted dealData is non-default and older than ~8 hours, prompt 'Start a fresh deal?' (one tap keeps or clears). Clear the ltv\* deal/scratchpad keys in logout() — shared-machine hygiene plus a light privacy wi…
    **D11 — Pilot program design & success measurement**

- **G71** [BLOCKER | KNOWN-UNSCHEDULED | M] **No product analytics instrumented — PostHog is planned, not built (and an SLO depends on a nonexistent event)**
  - Evidence: grep 'posthog' hits only PRODUCTION_READINESS_PLAN.md:115,128,253,506; no posthog in package.json or package-lock.json; zero capture()/track() calls in any .ts/.tsx; PRP:506 defines deal-save SLO measured by PostHog event 'deal…
  - Fix: Wire posthog-js with identify(user.id, {dealer, role}) and exactly 5 events tied to real-deal usage: deal_desked (calc run with non-default inputs, props: term/apr/ltv-band), lender_match_viewed, pdf_generated (props: type=deal…
- **G72** [BLOCKER | NEW | S] **No pilot success metrics or charter — 'pilot' appears in no planning doc except as a deadline word**
  - Evidence: grep -i 'pilot|design partner|beta' in PRODUCTION_READINESS_PLAN.md returns nothing; BUG_AUDIT_2026-05-28.md:9 uses 'paid pilot' only as a severity deadline; no charter/success-criteria doc in repo or docs/
  - Fix: Write a 1-page pilot charter with 4 measurable metrics, agreed with the dealer before day 1: (1) adoption — ≥3 distinct desk users fire deal_desked weekly by week 2; (2) volume — ≥10 real deals desked/store/week; (3) trust — de…
- **G73** [BLOCKER | NEW | S] **No quote-vs-funded validation loop, and saved deals can't be tied to funded contracts in-app**
  - Evidence: types.ts:138-155 SavedDeal has customerName/dealData/vehicle but no status/funded field (dealNumber is optional legacy); types.ts:28-37 DealData has no contract-reference field; no validation workflow documented anywhere
  - Fix: Cheapest workflow, zero code: every Friday, pull 5 funded deals from the DMS/funding packets, look up the matching saved deal by customer name, and log 7 columns in a Google Sheet — deal #, tool payment, contract (TIL-box) paym…
- **G74** [growth | KNOWN-UNSCHEDULED | S] **No in-app feedback channel — only a footer mailto link; Intercom/Crisp planned but unscheduled**
  - Evidence: App.tsx:1027 mailto:support@ltvdeskingpro.com is the only support surface; PRODUCTION_READINESS_PLAN.md:480 lists 'Intercom or Crisp chat widget' as 📋 XS with no date; no report-a-problem component in components/
  - Fix: For a 1-2 store pilot, skip the chat widget: give the desk your cell number and a 'Report a problem' footer button that opens a prefilled mailto (page, dealer, user, app version, timestamp) — a couple hours of work. Your users …
- **G75** [BLOCKER | NEW | S] **No rollback story: zero data export exists, but the privacy policy promises export-on-request and 30-day deletion**
  - Evidence: components/legal/PrivacyPolicy.tsx:69-73 promises 'Export your data on request' and hard-delete within 30 days; only CSV code in repo is import (services/fileParser.ts:141 parseInventoryCsv); grep -i 'export|deletion|offboard' …
  - Fix: Ship a client-side 'Download my deals (CSV)' button on the saved-deals view (data already comes from getSavedDeals in lib/api.ts:445 — under a day) and a documented superadmin runbook for full-tenant export (saved deals + lende…
- **G76** [growth | NEW | M] **Founder-pilots-own-store trap: a pilot at your own dealership proves compliance, not product-market fit**
  - Evidence: Project context: owner is the dealer principal of the pilot store; no second-store recruitment or arms-length design exists in PRODUCTION_READINESS_PLAN.md (zero 'pilot' mentions)
  - Fix: Your staff will use the boss's tool because the boss is watching — that tells you nothing about whether dealer #2 will pay. Treat your own store as the dogfood/staging environment, and run the evidence pilot arms-length: recrui…
    **D12: Competitive table-stakes & positioning**

- **G77** [BLOCKER | NEW | M] **Lender 'approval' claim outruns the matcher — false green checks reach customer paper**
  - Evidence: services/lenderMatcher.ts:91-148 enforces only FICO/year/mileage/amount/term/single maxLtv; types.ts:55-101 (LenderTier) carries excludedMakes, includedMakes, vehicleType, maxAdvance, frontEndLtv vs otdLtv, tier-level maxPti/ma…
  - Fix: Before pilot (S, same-day): rename every 'eligible/approve' surface to 'preliminary fit — verify with lender' incl. the PDF, and show which constraints were NOT checked per tier. Then (M) close the gap: enforce excludedMakes/in…
- **G78** [BLOCKER | NEW | S] **No positioning decision: sell as COMPANION to the DMS, not replacement — and ship the one-liner**
  - Evidence: PRODUCTION_READINESS_PLAN.md §8.1 prices the band ($399-799) and §8.4 lists marketing surface, but no doc states what the product is relative to the dealer's DMS; capability surface confirms replacement is impossible today (Dea…
  - Fix: Adopt companion positioning explicitly in all pilot materials. The one-sentence answer to 'why this instead of my DMS desking screen': 'Your DMS desks the one car your customer already picked — LTV Desking PRO has read every ra…
- **G79** [growth | NEW | S] **Book-value strategy undecided: BYO-via-CSV is $0 COGS but fragile; licensed-feed COGS unverified**
  - Evidence: Book values are dealer-supplied CSV columns, not a licensed feed (types.ts:9-10 jdPower/jdPowerRetail on Vehicle; no book API anywhere in services/ or api/). PRP §6.2 plans KBB/Black Book/MMR/J.D. Power integrations but §8.1's …
  - Fix: Today $399-799 survives because there is no book COGS — the dealer's own guidebook subscription does the work. I cannot verify current J.D. Power Valuation Services / Black Book / KBB per-rooftop or SaaS-redistribution licensin…
- **G80** [BLOCKER | NEW | S] **'JD Power' name printed on customer-facing PDFs and UI with no license or data relationship**
  - Evidence: components/pdf/PdfTemplate.tsx:256-257 and components/pdf/FavoritesPdfTemplate.tsx:431-432 print 'JD Power (Trade)/(Retail)' on documents handed to consumers; components/LenderProfileModal.tsx:226-227 and InventoryTable.tsx:200…
  - Fix: Exposure to review with counsel — but the practical risk is also competitive: the deal sheet implies an integrated J.D. Power valuation that doesn't exist, and a competitor or lender who notices will use it. One-day fix: relabe…
- **G81** [growth | NEW | L] **No F&I product menu — single dollar field where ProMax/Darwin/MenuMetric live**
  - Evidence: types.ts:32 — backendProducts: number is the entire F&I product model; no menu presentation, no per-product (VSC/GAP/tire-wheel) line items, no menu-compliance trail. README.md positions the product 'for dealership F&I teams.' …
  - Fix: Don't build for pilot — companion positioning makes the menu the DMS/menu-tool's job. But soften 'F&I platform' language toward 'desking and lender intelligence' in pilot materials, and put a minimal product line-item model (wh…
- **G82** [growth | KNOWN-UNSCHEDULED | L] **Bake-off weaponizable gaps: no DMS sync, credit pull, e-sign, reports, billing — all known, all parked in Q3/Q4**
  - Evidence: PRP §2.3 'Later — Q3+Q4 2026': DMS integration #1 ($20-40K, XL), credit pull ($15-25K), e-sign ($10-15K); §6.5 states reporting is 'table stakes... required before charging mid-tier prices'; §8.2 Stripe billing still 📋. A Deale…
  - Fix: Correct call to NOT pull these forward — but pre-empt the script: pilot pitch should name the re-key honestly ('5 fields into your DMS once the deal is bought') and anchor ROI on one saved deal/month covering the subscription. …
- **G83** [growth | NEW | M] **Tax math limited to MI/OH/IN constrains pilot geography and claims — and expansion is not on the PRP at all**
  - Evidence: services/calculator.ts:67-71 TAX_RATES = {MI, OH, IN}; types.ts:177 AppState = 'MI' | 'OH' | 'IN'; grep of PRODUCTION_READINESS_PLAN.md finds no state-expansion line item (only 'Stripe Tax' §8.2 and a smart-defaults note §5).
  - Fix: Recruit pilot dealers only in MI/OH/IN and say so plainly in pilot materials ('built for Michigan, Ohio, Indiana dealers' is a strength, not an apology — local tax/reciprocity correctness is a trust signal a national DMS gets w…

### C.2 Code-audit register (C1–C82)

Format: ID · severity · area · finding — file:line → fix. All 82 survived independent
adversarial verification (verifiers re-derived each claim from source; zero were rejected).

- **C1** [P1 | auth-flows] **logout() does not clear deal localStorage — previous user's customer/deal data bleeds into the next login on a shared desk** — `lib/auth.ts:92-98`
  - logout() clears only the PB authStore, the superadmin override, and the view-mode key, then does window.location.reload(). It never removes the localStorage keys that hold the in-progress deal: ltvDealData_v2, ltvFilt…
  - Fix: On logout, explicitly remove the per-user deal keys (DEAL_DATA, FILTERS, FAVORITES, SCRATCH_PAD, and arguably SETTINGS) before reload, or namespace these localStorage keys by user/dealer id so they…
- **C2** [P1 | auth-flows] **Self-registration is incompatible with the tightened API rules — will break onboarding the moment the pending backend migration deploys** — `lib/auth.ts:52-76`
  - register() runs entirely UNauthenticated: it calls pb.collection('dealers').getList() to resolve the dealer code (lines 52-54) and then pb.collection('users').create() (line 76). The hardening migration backend/pb_mig…
  - Fix: Decide the registration model explicitly. Either (a) keep public self-registration and carve out unauthenticated read access to dealers (e.g. a minimal public endpoint or a dealers list rule that a…
- **C3** [P1 | deps-config] **CSP blocks NHTSA vPIC — VIN decode always fails in production** — `vercel.json:20`
  - connect-src does not include https://vpic.nhtsa.dot.gov, but services/vinDecoder.ts:25 fetches `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json` from the browser (called from App.tsx:329 han…
  - Fix: Add https://vpic.nhtsa.dot.gov to connect-src in vercel.json. Add a smoke test / manual checklist item that exercises VIN lookup against a production deploy, since CSP regressions are invisible in …
- **C4** [P1 | deps-config] **CSP blocks tesseract.js CDN assets — pay-stub OCR scanner always fails in production** — `components/DocumentScanner.tsx:8, 48-55`
  - Tesseract.recognize is called with no workerPath/corePath/langPath overrides, so tesseract.js v7 uses its browser defaults: worker from https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js (loaded via a…
  - Fix: Preferred: self-host the three assets (copy worker.min.js, tesseract-core wasm, eng.traineddata.gz into public/ and pass workerPath/corePath/langPath to Tesseract.recognize) — this also removes a t…
- **C5** [P1 | modals-ai-tools] **Analytics 'Lender Comparison' chart presents hardcoded fake lender rates/payments as deal data** — `components/DealCharts.tsx:103-115`
  - LenderComparisonChart, rendered in FinanceTools' Analytics tab under the heading 'Lender Comparison (Est.)' (FinanceTools.tsx:374-380), returns a hardcoded array of fabricated lenders/rates/payments whenever any vehic…
  - Fix: Either compute real per-lender payments from lenderProfiles (buy rate per matched tier via checkBankEligibility + calculateMonthlyPayment on the deal's amountToFinance) or remove/hide the chart unt…
- **C6** [P1 | modals-ai-tools] **DealComparison's DealColumn is defined inside render — inputs lose focus on every keystroke** — `components/FloatingToolsPanel.tsx:439-490`
  - DealColumn is declared as a function component inside DealComparison's render body. Every keystroke calls setDealA/setDealB, re-rendering DealComparison and creating a new DealColumn function identity; React sees a di…
  - Fix: Hoist DealColumn to module scope and pass deal/handler/calculated as props (they already are props). Apply the same fix to ProgressSection in AiLenderManagerModal.
- **C7** [P1 | modals-ai-tools] **Minimized AI-upload progress is permanently 0%: aiUploadProgress is never written, and backgroundUploadStore is dead code** — `App.tsx:174-177, 573-577`
  - Confirms and extends the audit claim. The live minimized-upload UI is the Header chip (Header.tsx:245-291) fed by App's aiUploadProgress state — but setAiUploadProgress is never called anywhere (grep: only the useStat…
  - Fix: Add an onProgress callback prop to AiLenderManagerModal (it already computes overallProgress/currentStage in handleAnalyze) and call setAiUploadProgress from it; also pass actual isLoading up so th…
- **C8** [P1 | modals-ai-tools] **Cancel/backdrop-click during AI lender batch does not abort the analyze loop; results resurrect into the closed modal** — `components/AiLenderManagerModal.tsx:148-221, 312-324, 414-417, 721-724`
  - During isLoading the header X is thoughtfully swapped for Minimize (line 435), but the overlay backdrop onClick={handleClose} (line 416) and the footer 'Cancel' button (line 722) remain active. handleClose() resets st…
  - Fix: Add a cancellation token (ref checked each loop iteration, or AbortController threaded into processLenderSheet/postAiRoute) that handleClose sets; have the loop bail and skip the trailing setState …
- **C9** [P1 | modals-ai-tools] **DealStructuringModal coerces a cleared APR to 0 in global deal state — regresses the B6 'no accidental 0% payment' hardening** — `components/DealStructuringModal.tsx:110-118, 271, 354-359`
  - handleDealChange does `const numValue = Number(value) || 0;` for every numeric field. Clearing the APR input ('' arrives) therefore writes interestRate: 0 (a number) into the GLOBAL dealData (the modal receives App's …
  - Fix: Mirror DealControls: when value === '' store '' (and skip validation), letting calculateFinancials yield 'N/A' instead of a 0%-APR payment. Apply the same to DealComparison's handleAChange/handleBC…
- **C10** [P1 | regression-hunt] **DataError/retry UI is unreachable: loadData's catch is dead code because every API call swallows errors and returns []/null** — `lib/api.ts:44-47, 251-254, 456-459, 518-521 (and context/DealContext.tsx:287-322, App.tsx:810-817)`
  - The hardening pass added dataLoading/dataError + a DataError retry surface (DealContext.tsx:315-322 sets dataError in loadData's catch; App.tsx:810-817 renders it). But getInventory, getLenderProfiles, getSavedDeals e…
  - Fix: Make the fetchers throw (or return a Result) when called from loadData — e.g. add getInventoryOrThrow variants or a {strict: true} option — so loadData's catch actually fires and the DataError UI t…
- **C11** [P1 | regression-hunt] **saveLenderProfile substring match (name ~) overwrites a different lender's record and deletes others as 'duplicates'** — `lib/api.ts:273-313`
  - saveLenderProfile looks up 'existing' records with PocketBase's `~` operator, which is a LIKE/contains match (auto-wrapped in %...%). Saving a lender whose name is a substring of an existing lender's name — e.g. savin…
  - Fix: Use an exact (case-insensitive) equality match: fetch with `name = {:name}` or filter the getFullList results with `r.name.toLowerCase().trim() === profile.name.toLowerCase().trim()` before treatin…
- **C12** [P1 | services-libs] **Prod-reachable Seed DB button + error-swallowing emptiness check can inject fake lender rates into a live dealer** — `lib/seeder.ts:18-53 (plus components/SettingsModal.tsx:476-500, lib/api.ts:44-47)`
  - seedDatabase() has no env or role guard and is wired to a 'Seed DB' button in SettingsModal (comment: 'Temporary Seed Button') visible in production to anyone who can open Settings. Its only safety check is emptiness:…
  - Fix: Gate the button behind import.meta.env.DEV (or superadmin role), and make seedDatabase distinguish 'fetch failed' from 'genuinely empty' — getInventory must rethrow or return a Result, not [].
- **C13** [P1 | superadmin-dash] **Dealer admin 'Dealership Details' save silently no-ops for every real user, then shows a success toast** — `components/admin/DealerAdminDashboard.tsx:162-172 (and lib/api.ts:1044-1055)`
  - handleDealerSubmit calls the superadmin-only updateDealer() from lib/api.ts, which begins `if (user?.role !== "superadmin") return null;` — it returns null without making any API call. DealerAdminDashboard is only eve…
  - Fix: Add a dealer-scoped updateCurrentDealer() in the DEALER ADMIN section of lib/api.ts (guard: role admin/superadmin + id === getCurrentDealerId(), throw on failure) and use it here; check the return …
- **C14** [P1 | superadmin-dash] **Owner console lets a superadmin demote or delete THEMSELF (or the last superadmin) with one unconfirmed click** — `components/admin/SuperAdminDashboard.tsx:1479-1497, 1198-1215, 1511-1517`
  - In UserManagement the role <select> on every row fires handleRoleChange immediately on change with no confirmation and no self-guard; the delete button likewise has no self-check (only a generic confirm). DealerAdminD…
  - Fix: Disable role select and delete for user.id === getCurrentUser()?.id (as DealerAdminDashboard does), wrap role changes in confirmAction, and refuse demote/delete when the target is the only remainin…
- **C15** [P1 | superadmin-dash] **Tenant admin can demote or delete a dealer-assigned superadmin; the row even displays their role as 'Sales'** — `components/admin/DealerAdminDashboard.tsx:140-158, 448-459 (and SuperAdminDashboard.tsx:1346-1371,1406-1414; backend/pb_hooks/users_guard.pb.js:47-50)`
  - Two interacting bugs. (1) The superadmin console's create/edit user form REQUIRES a dealer for every role including superadmin (submit disabled on `!formData.dealer`, SuperAdminDashboard.tsx:1412; there is no way to c…
  - Fix: In users_guard.pb.js, also block non-superadmins from changing/deleting any record whose stored role is 'superadmin'. In DealerAdminDashboard, filter superadmins out of the list (or render them rea…
- **C16** [P1 | superadmin-dash] **Every superadmin mutation helper swallows errors; the console resets forms and refreshes as if the write succeeded** — `components/admin/SuperAdminDashboard.tsx:713-718, 746-764, 1105-1135, 1198-1215 (and lib/api.ts:1044-1196)`
  - updateDealer, deleteDealer, updateUserRole, updateUser, and deleteUser all catch internally and return null/false (api.ts:1051-1054, 1064-1067, 1158-1161, 1179-1182, 1192-1195). No caller checks the return value. Cons…
  - Fix: Make these helpers throw (or have callers check for null/false) and surface failures via the existing error state/toast before resetting forms. Verify the email-change path against PB v0.26 — if re…
- **C17** [P1 | tables-deals] **Shortlist (favorites) column sorting is a no-op — sort arrows toggle but rows never reorder** — `App.tsx:192-195, 832-841`
  - The favorites Shortlist renders InventoryTable with data={calculatedFavorites}, sortConfig={favSort}, and an onSort that updates favSort — but nothing ever applies favSort to the data. calculatedFavorites is a plain m…
  - Fix: Sort calculatedFavorites with favSort before passing it (reuse the comparator pattern from DealContext.tsx:431-457, which correctly handles N/A/Error/undefined sentinels), or move favorites sorting…
- **C18** [P1 | tables-deals] **Filter changes never reset currentPage — stale page shows false 'No vehicles match your filters', and the visible recovery button wipes the active deal** — `context/DealContext.tsx:459-469 (and components/DealControls.tsx:73,85; components/common/Pagination.tsx:18-22)`
  - paginatedInventory slices sortedInventory by pagination.currentPage, but currentPage is only reset on CSV upload (App.tsx:298), loadSampleData, clearDealAndFilters, and itemsPerPage change. DealControls' setFilters ca…
  - Fix: Reset currentPage to 1 when debouncedFilters changes (or clamp: `const page = Math.min(currentPage, Math.max(1, Math.ceil(sortedInventory.length / itemsPerPage)))` inside paginatedInventory and ref…
- **C19** [P2 | auth-flows] **OwnerLogin: rejecting a non-superadmin calls logout()→reload(), wiping the 'Owner access required' error before it can render** — `components/auth/OwnerLogin.tsx:39-43`
  - When a valid but non-superadmin account signs into the Owner Console, handleSubmit calls logout() and then setError(...). logout() (lib/auth.ts:97) immediately does window.location.reload(), so the component unmounts …
  - Fix: Don't full-logout+reload here. Clear the auth token without reloading (pb.authStore.clear()) or show the error first and defer logout, so the user actually sees why access was denied. If a reload i…
- **C20** [P2 | auth-flows] **Mid-session token expiry never logs the user out — app stays 'authenticated' while every API call 401s** — `App.tsx:1126,1153-1163`
  - isAuth is seeded once from isAuthenticated() (=pb.authStore.isValid, which checks JWT exp) and thereafter only updated by onAuthStateChange, whose callback sets isAuth = !!user. onAuthStateChange (lib/auth.ts:132-142)…
  - Fix: Add a global 401 handler (PB beforeSend/afterSend or a wrapper) that, on an auth failure, clears authStore and forces the login view, ideally preserving the in-progress deal. At minimum, re-check p…
- **C21** [P2 | auth-flows] **Non-superadmin navigating to /admin is fully logged out (and loses the in-progress deal), not redirected** — `App.tsx:1177-1180`
  - The route-redirect effect treats any authenticated non-superadmin who lands on /admin by calling logout() then navigate('/'). logout() ends the session entirely and reloads (lib/auth.ts:97), so a salesperson or dealer…
  - Fix: Just redirect: navigate('/', { replace: true }) without logout(). A dealer user visiting /admin should be sent to their app with their session and work intact, not signed out.
- **C22** [P2 | auth-flows] **Unsaved in-progress deal is silently discarded on every reload path; isDealDirty is tracked but never consumed and there is no beforeunload guard** — `context/DealContext.tsx:168,377-381`
  - DealContext maintains isDealDirty and sets it true whenever dealData/filters/customerName/salespersonName/activeVehicle change with a vehicle active, but nothing ever reads it (grep shows it is only declared, set, and…
  - Fix: Wire isDealDirty to a beforeunload handler (and/or a confirm dialog before logout / dealer switch) so an unsaved deal prompts before the page reloads, or persist the in-progress customer/activeVehi…
- **C23** [P2 | deps-config] **CSP blocks api.pwnedpasswords.com — HIBP breach check is silently dead in production (degrades open)** — `lib/passwordPolicy.ts:59-63, 80-82`
  - validatePassword fetches https://api.pwnedpasswords.com/range/{prefix} from the browser, but connect-src in vercel.json:20 does not include that host. The CSP-refused fetch throws, lands in the catch block at line 80-…
  - Fix: Add https://api.pwnedpasswords.com to connect-src. Consider logging/reporting (e.g. captureException or a console.warn) when the HIBP call fails so a silently disabled security control is visible, …
- **C24** [P2 | deps-config] **Renovate config present but the bot is not installed — zero PRs, no Dependency Dashboard, security PRs never fire** — `.github/renovate.json:1-70`
  - renovate.json (committed May 16) extends :dependencyDashboard and configures vulnerabilityAlerts with prCreation 'immediate' plus weekly scheduled update PRs and patch automerge. None of it has ever executed: `gh pr l…
  - Fix: Install the Renovate GitHub App on the repo (github.com/apps/renovate) or enable Mend Renovate for the org, then confirm the Dependency Dashboard issue appears. For platformAutomerge to work as con…
- **C25** [P2 | deps-config] **CSP script-src 'unsafe-inline' plus dead provider/Sentry allowances — XSS protection largely neutered** — `vercel.json:20`
  - script-src is "'self' 'unsafe-inline' https://_.ingest.sentry.io https://_.sentry.io". 'unsafe-inline' in script-src allows any injected inline <script> to run, which defeats most of the XSS protection a CSP exists to…
  - Fix: Remove 'unsafe-inline' and the sentry hosts from script-src (keep 'unsafe-inline' in style-src — React inline styles and the PDF templates need it), and remove the three provider hosts from connect…
- **C26** [P2 | modals-ai-tools] **FinanceTools 'Reset to Active Deal' string-concatenates a blank APR: fabricated 2% sell rate and 0%-APR quotes** — `components/FinanceTools.tsx:183-203`
  - handleSyncToDeal reads `const rate = dealData.interestRate;` with no blank guard. At runtime interestRate can be '' (DealControls stores '' on clear; the TS type `number` lies). Then `setSellRate(rate + 2)` evaluates …
  - Fix: Guard blank: `const rate = typeof dealData.interestRate === 'number' ? dealData.interestRate : null;` and skip syncing rate fields (or sync '' through) when null; never arithmetic on the raw field.…
- **C27** [P2 | modals-ai-tools] **Lender eligibility LTV check fails open on NaN: 'N/A'/'Error' amountToFinance can show a bank as ELIGIBLE** — `services/lenderMatcher.ts:118-143`
  - CalculatedVehicle.amountToFinance is number | 'Error' | 'N/A'. checkBankEligibility's destructuring default (= 0) only covers undefined, so the sentinel string flows to `const amt = Number(amountToFinance)` → NaN. The…
  - Fix: Add `if (!Number.isFinite(amt)) continue;` (or return an explicit 'cannot evaluate' reason) before the LTV math, and surface 'PTI not evaluated — no payment/rate' instead of silently passing PTI wh…
- **C28** [P2 | modals-ai-tools] **DocumentScanner labels an OCR'd pay-period amount as 'monthly income' with no pay-frequency handling** — `components/DocumentScanner.tsx:63-84, 150-171`
  - Post-fix the scanner correctly requires confirmation and sanity-bounds the value, but the regexes grab 'Net Pay'/'Gross Pay' — a per-pay-period figure on most stubs (bi-weekly/semi-monthly/weekly) — and the dialog ass…
  - Fix: Change the label to 'Detected pay amount' and add a pay-frequency selector (weekly/bi-weekly/semi-monthly/monthly) that converts to monthly before onIncomeExtracted, or at minimum stop asserting 'm…
- **C29** [P2 | regression-hunt] **parseFile's detailed errors (missing columns, skip reasons) are swallowed by App's generic 'Error syncing inventory' catch; the data.length===0 branch is dead** — `App.tsx:252-259, 308-313 (with services/fileParser.ts:181-196, 302-311)`
  - The [B1] hardening made data loss visible by building ParseResult.reasons and rich thrown errors ('File is missing or has misnamed required columns: …', 'No valid rows found. Ensure Price and Mileage are populated and…
  - Fix: In the catch, surface err.message when err instanceof Error (the parser's messages are user-safe and were written for this purpose), falling back to the generic text only for unknown failures; dist…
- **C30** [P2 | regression-hunt] **Realtime subscriptions are never (re)established on in-place dealer override change; Header's auto-select path leaves them permanently dead, and subscription refetches bypass the loadData seq token** — `context/DealContext.tsx:328-347 (with lib/api.ts:566-598, components/Header.tsx:44-51)`
  - subscribeToInventory/subscribeToSavedDeals return a no-op `() => {}` when getCurrentDealerId() is null at subscribe time (lib/api.ts:567-568, 601-602). DealContext's effect subscribes exactly once (deps `[loadData]`, …
  - Fix: In the dealerOverrideChanged handler, tear down and re-create both subscriptions (or make the effect depend on a dealerId state snapshot that updates on the event). Route the subscription callbacks…
- **C31** [P2 | regression-hunt] **File input value is never reset after an upload attempt — re-selecting the same file is a silent no-op** — `App.tsx:209-317`
  - handleFileUpload clears fileInputRef.current.value only in the two pre-flight validation failure branches (lines 220-224 oversize, 240-244 bad type). After a parse failure, a sync failure/throw, or even a successful i…
  - Fix: Reset the input once, up front: capture the File, then immediately set `e.target.value = \"\"` (or do it in the finally block) so every subsequent selection of the same file re-fires onChange.
- **C32** [P2 | regression-hunt] **parseNumber accepts pure-comma European decimals as integers: '28500,50' parses as 2,850,050** — `services/fileParser.ts:110-117`
  - The hardening added a refusal for 'ambiguous European-decimal formats' but the guard requires a dot to also be present: `if (s.includes(\".\") && /\\d,\\d{1,2}$/.test(s)) return \"N/A\"`. A value with ONLY a comma dec…
  - Fix: Drop the `s.includes(\".\")` condition — refuse any value matching /\\d,\\d{1,2}$/ (a 1-2 digit group after the final comma is never a US thousands separator). Add unit cases for '28500,50', '1234,…
- **C33** [P2 | regression-hunt] **syntheticVin collides for distinct no-VIN vehicles: basis omits trim and degrades to stock='N/A' when the Stock column is missing — second unit dropped as a 'duplicate VIN'** — `services/fileParser.ts:124-135, 237-247`
  - The [B11] hardening replaced row-index synthetic VINs with a hash of stock|make|model|year. But (a) trim is excluded from the basis, and (b) when the file has no 'Stock #' column, idx.stock is -1 so `vals[idx.stock] ?…
  - Fix: Include trim (and mileage, which is guaranteed numeric at this point) in the basis. When a synthetic-VIN collision occurs, disambiguate with an occurrence counter suffix (SYN-XXXX-2) instead of dro…
- **C34** [P2 | services-libs] **Seeder reports success regardless of outcome and sends client-only field names PocketBase doesn't store** — `lib/seeder.ts:22-32, 42-53`
  - Two compounding bugs: (1) addInventoryItem (api.ts:50-66) catches errors and returns null instead of throwing, but the seeder ignores the return value and increments `inventoryCount++` unconditionally — so `toast.succ…
  - Fix: Check the return value (count only non-null), and map Vehicle→InventoryItem fields explicitly (modelYear→year, stock→stockNumber, status:'available') instead of casting.
- **C35** [P2 | services-libs] **Entire client validation layer (lib/validation.ts + lib/typeGuards.ts guards) is dead code; AI-extracted lender data saved unvalidated** — `lib/validation.ts:62-188 (plus lib/typeGuards.ts:59-194, lib/pocketbase.ts:18-21)`
  - Grep confirms zero call sites in app code (only tests) for validateDealData, validateLenderProfile, validateInventoryItem, validateDealerSettings, validateSavedDeal, sanitizeString, sanitizeVin, sanitizeNumber, saniti…
  - Fix: Wire validateLenderProfile into saveLenderProfile and validateDealData into deal save, or delete the layer and fix the misleading comment. Don't ship a validation module that creates false confidence.
- **C36** [P2 | services-libs] **validateInput has no cases for tradeInValue/tradeInPayoff/maxMiles/maxOtdLtv — negative trade-in silently changes quoted payment** — `services/validator.ts:7-32`
  - DealControls passes ids tradeInValue (line 268), tradeInPayoff (280), maxMiles (224), maxOtdLtv (235) into validateInput, which falls through to `default: return null` — no validation at all. A salesperson typo like t…
  - Fix: Add the four missing ids to the negative-value case (and a sane upper bound), and reconcile the loanTerm cap (96 vs 120) with the schema.
- **C37** [P2 | services-libs] **Customer-facing PDF crashes or renders blank when APR field was cleared — render errors escape pdfGenerator's try/catch** — `components/pdf/PdfTemplate.tsx:271 (plus FavoritesPdfTemplate.tsx:446, services/pdfGenerator.ts:49-68, components/DealControls.tsx:90-94, context/DealContext.tsx:152)`
  - PdfTemplate line 271 calls `dealData.interestRate.toFixed(2)` unguarded. DealControls' handleDealChange stores `""` when the user clears a numeric input (`setDealData((prev) => ({ ...prev, [id]: "" }))`), and DealCont…
  - Fix: Normalize dealData through mapDealData (lib/dealMappers.ts:42 already does this correctly) before passing to PDF templates, and wrap the rendered component in an error boundary or use flushSync + a…
- **C38** [P2 | services-libs] **No canvas size guard in pdfGenerator — multi-deal favorites PDF can silently exceed Safari/iOS canvas limits** — `services/pdfGenerator.ts:61-79`
  - html2canvas renders the entire container (all favorite deals, one .page of 297mm each, FavoritesPdfTemplate renders a page per deal) into a single canvas at `scale: 2` (~1588px wide). iOS Safari caps canvas area aroun…
  - Fix: Validate `imgData.length > 'data:,'.length` and canvas dimensions against a budget; render each deal/page into its own canvas instead of one giant canvas, or drop scale to 1.5 when the container ex…
- **C39** [P2 | services-libs] **aiProcessor has no file-size preflight — rate sheets over ~3.2MB always fail after a full base64 upload with a cryptic HTTP 413** — `services/aiProcessor.ts:66-75, 197-218`
  - processLenderSheet base64-encodes the entire PDF in memory (FileReader dataURL ≈ 2.3x file size held simultaneously) and POSTs it as JSON to /api/ai/lender-extract. Vercel serverless functions reject request bodies ov…
  - Fix: Reject files > ~3MB before reading, with a message stating the limit ('Rate sheet must be under 3 MB'), and map 413 to that same human-readable error.
- **C40** [P2 | services-libs] **decodeVin interpolates raw user input into the NHTSA URL — no encodeURIComponent, no charset validation; sanitizeVin exists but is unused** — `services/vinDecoder.ts:8-14 (plus App.tsx:730)`
  - decodeVin only checks `vin.length !== 17` then builds `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json` with the raw string. The only input processing upstream is `setVinLookup(e.target.valu…
  - Fix: Run sanitizeVin (lib/validation.ts:136) on the input before decode and persist; encodeURIComponent the path segment as defense-in-depth.
- **C41** [P2 | services-libs] **App's VIN lookup catch collapses every decodeVin error to 'Error: Service unavailable' — and its 11-char gate contradicts the decoder's 17-char requirement** — `App.tsx:321-323, 385-387 (vs services/vinDecoder.ts:9-10, 57-65)`
  - vinDecoder carefully crafts distinct user-facing errors ('Invalid VIN. Must be 17 characters long.', 'VIN lookup timed out…', 'VIN not found in the NHTSA database.', HTTP status failures) and re-throws them 'to be dis…
  - Fix: Display `err instanceof Error ? err.message : fallback` in the catch, and align the UI gate to 17 chars (NHTSA does support partial VINs if you intend 11+, but then decodeVin must accept them).
- **C42** [P2 | superadmin-dash] **Header DealerSwitcher silently auto-impersonates the alphabetically-first dealer — bypasses the confirm ceremony and the inactive-dealer gate** — `components/Header.tsx:39-54 (and App.tsx:1232-1235)`
  - DealerManagement deliberately gates impersonation behind confirmAction (SuperAdminDashboard.tsx:720-730) and disables it for inactive dealers (line 1013). But when a superadmin clicks 'Dealer view' (App.tsx onSwitchTo…
  - Fix: Never auto-write the override. If no override exists in dealer view, render a 'pick a dealership' state (the switcher already has the dropdown) or send the superadmin back to /admin; at minimum fil…
- **C43** [P2 | superadmin-dash] **System Settings writes three fields nothing reads (supportEmail, defaultLtvThresholds, aiDefaults) while the UI promises platform-wide effects** — `components/admin/SuperAdminDashboard.tsx:2109-2186, 1782-1909`
  - Repo-wide grep (client, /api proxy, server, services) shows the only consumed system_settings fields are announcementBanner (AnnouncementBanner.tsx) and signupsEnabled (Register.tsx). supportEmail ('Shown to dealers i…
  - Fix: Either wire the consumers (AI proxy should read aiDefaults as the fallback chain; dealer creation should seed defaultLtvThresholds; help/error surfaces should show supportEmail) or remove/disable t…
- **C44** [P2 | tables-deals] **DealHistoryPanel.tsx and FavoritesTable.tsx are dead code — the deal-history search/filter/restore UX is unreachable, and PR #1 hardened an unmounted component** — `components/DealHistoryPanel.tsx:1-321 (and components/FavoritesTable.tsx:1-622)`
  - Neither component is imported anywhere at HEAD 4af4e1e (verified via git grep across the tree; only self-references and a tailwind.config comment). DealHistoryPanel — the only surface with deal search, salesperson fil…
  - Fix: Decide: either mount DealHistoryPanel (and fix the four latent bugs first) or delete both files so future audits and bundle size aren't paying for dead surfaces. If FavoritesTable stays deleted, po…
- **C45** [P2 | tables-deals] **Saved deal cards display the model year twice ('2021 2021 Honda Civic EX')** — `components/SavedDeals.tsx:79-81`
  - The card renders `{deal.vehicle?.modelYear ...} {deal.vehicle?.vehicle ...}` — but every path that constructs the `vehicle` name string already prefixes the year: DealContext.tsx:261 `vehicle: \`${i.year} ${i.make} ${…
  - Fix: Drop the modelYear prefix from the card (render just deal.vehicle.vehicle), or strip the leading year from the name string before prefixing.
- **C46** [P2 | tables-deals] **Structure Deal rebuilds the vehicle name with `${item.trim}` — renders literal 'undefined' (or 'N/A' year) and persists it into saved deals and PDFs** — `components/InventoryTable.tsx:126-131`
  - The Actions column's structure-deal handler overrides the already-correct `item.vehicle` with a rebuilt template: `vehicle: \`${item.modelYear} ${item.make} ${item.model} ${item.trim}\``. `trim` is optional (types.ts:…
  - Fix: Pass `item` unmodified (its `vehicle` field is already correct), or guard each part: `[item.modelYear !== "N/A" ? item.modelYear : null, item.make, item.model, item.trim].filter(Boolean).join(" ")`.
- **C47** [P2 | tables-deals] **0-mile vehicles are coerced to mileage 'N/A', showing 'N/A' in the Miles column and blocking Structure Deal / Save Deal** — `context/DealContext.tsx:265 (mapInventoryItem)`
  - `mileage: i.mileage || "N/A"` turns a legitimate 0 into 'N/A'. Downstream, the validation in handleSelectVehicle (App.tsx:393-400) explicitly intends to allow zero (`typeof vehicle.mileage === "number" && vehicle.mile…
  - Fix: Use a nullish/typeof check: `mileage: typeof i.mileage === "number" ? i.mileage : "N/A"` (and consider the same for jdPower/jdPowerRetail/unitCost).
- **C48** [P2 | tables-deals] **PocketBase 'created' date strings ('YYYY-MM-DD HH:MM:SS.sssZ') are passed raw to new Date() — renders 'Invalid Date' on Safari/WebKit (iPads)** — `components/SavedDeals.tsx:62-69 (and lib/dealMappers.ts:102-105, components/common/TableCell.tsx:44-57, components/DealHistoryPanel.tsx:79,104-105)`
  - mapPocketBaseSavedDeal sets date/createdAt directly from PocketBase's `created` field, which PB serializes with a space separator ('2026-05-31 10:00:00.123Z') — a non-ISO format that WebKit's Date parser rejects (a do…
  - Fix: Normalize once in mapPocketBaseSavedDeal: `const iso = deal.created.replace(" ", "T");` and use it for date/createdAt; alternatively add a parsePbDate helper used by formatDate/formatDateTime. Veri…
- **C49** [P2 | tables-deals] **All money figures — including the customer-facing monthly payment and sales tax on the PDF deal sheet — are displayed rounded to whole dollars, while DocumentScanner shows pennies** — `components/common/TableCell.tsx:4-14`
  - formatCurrency uses `maximumFractionDigits: 0`, and it is the single formatter for InventoryTable cells, InventoryExpandedRow, FavoritesTable, DealHistoryPanel, DealStructuringModal, FinanceTools, and the printed PdfT…
  - Fix: Show cents at least for monthlyPayment, salesTax, and OTD lines on the deal sheet/modal (add a formatCurrencyExact or a fractionDigits param). If whole-dollar display is a deliberate product choice…
- **C50** [P3 | auth-flows] **'Forgot your password?' is non-functional; requestPasswordReset() is never called and no SMTP is configured** — `components/auth/Login.tsx:99-108`
  - The 'Forgot your password?' link is href="#" with preventDefault, and merely toasts 'Please contact your administrator to reset password.' There is no self-service reset. lib/auth.ts:103-111 implements requestPassword…
  - Fix: Either implement real reset (wire the link to requestPasswordReset and configure SMTP on the PB backend) or change the copy to reflect the actual admin-driven process and remove the dead requestPas…
- **C51** [P3 | auth-flows] **Dealer codes are enumerable unauthenticated, and the registration error differentiates valid vs invalid codes** — `lib/auth.ts:52-58`
  - Until the tightened dealer rules deploy, the register() flow proves the dealers collection is readable unauthenticated (it lists by code from the public Register form), so an attacker can probe/enumerate valid dealer …
  - Fix: Validate the dealer code server-side on the create path (so the persisted dealer must match the code), and avoid a distinct error that confirms code validity to unauthenticated callers. Locking dea…
- **C52** [P3 | auth-flows] **Register surfaces raw PocketBase error strings to end users** — `components/auth/Register.tsx:64-66`
  - Register's catch is typed `any` and toasts error.message directly; register() (lib/auth.ts:80-86) likewise returns error.message from PB on failure. PB validation failures produce technical strings (e.g. 'Failed to cr…
  - Fix: Map known PB error codes (validation_not_unique on email, etc.) to friendly copy and fall back to a generic 'Registration failed, please try again' for everything else, rather than echoing raw back…
- **C53** [P3 | deps-config] **`config.api.bodyParser=false` is a Next.js-only convention — likely a no-op on a standalone Vercel function** — `api/ai/[...path].ts:24-30`
  - The function exports `config = { api: { bodyParser: false }, maxDuration: 300 }` and the comment says 'We disable Vercel's body parser so handleAiRequest can stream-read the body itself'. The `api.bodyParser` key is N…
  - Fix: Set NODEJS_HELPERS=0 on the Vercel project (the documented mechanism), or stop relying on stream order: read req.body when present and fall back to the stream. Then exercise a real POST /api/ai/len…
- **C54** [P3 | deps-config] **ws GHSA-58qx-3vcg-4xpx via @google/genai: server-side only and unreachable, but unpatched in lockfile** — `api/_lib/ai/providerClients.ts:1, 194-205, 227-235`
  - Reachability analysis the brief asked for: @google/genai@2.2.0 (package.json:28, a prod dependency) is imported only in api/\_lib/ai/providerClients.ts, which runs in the Vercel function (api/ai/[...path].ts) and the d…
  - Fix: Run `npm audit fix` (bumps ws to >=8.20.1 within @google/genai's range) and commit the lockfile. Low urgency; do it alongside the Renovate enablement so transitive advisories self-heal in future.
- **C55** [P3 | deps-config] **Node version skew: CI checks on Node 22, Vercel production build on Node 20, no engines field** — `.github/workflows/deploy-vercel.yml:20-23`
  - check.yml (the PR gate that runs type-check/lint/test/build) uses node-version "22", but deploy-vercel.yml builds the artifact that actually ships with node-version "20", and package.json has no engines field to pin e…
  - Fix: Align both workflows on "22" (matches the Vercel function runtime default for new projects) and add "engines": { "node": ">=22" } to package.json so npm/Vercel flag mismatches.
- **C56** [P3 | deps-config] **Vitest has no configuration — DOM-testing stack (jsdom, @testing-library/react, playwright) installed but unusable/unused** — `vite.config.ts:7-35`
  - vite.config.ts contains no `test` block and there is no vitest.config.\* anywhere, so vitest runs with the default node environment. All 9 existing test files are pure-logic (api/\_lib, services, lib) so the suite passe…
  - Fix: Add a `test` block to vite.config.ts (environment: 'jsdom' with environmentMatchGlobs or per-file pragmas for the node-only suites, plus coverage thresholds), or drop jsdom/@testing-library/playwri…
- **C57** [P3 | modals-ai-tools] **DealComparison: 'Use This Deal' wipes the other column's scenario via the dealData reset effect** — `components/FloatingToolsPanel.tsx:394-397, 428`
  - useEffect resets BOTH dealA and dealB whenever the global dealData changes. copyToGlobal (the 'Use This Deal' button) calls onDealDataChange(deal), which mutates global dealData, which immediately re-runs the effect a…
  - Fix: Seed dealA/dealB once on mount (or when activeVehicle changes) instead of on every dealData change, or skip the reset when the change originated from copyToGlobal (ref flag).
- **C58** [P3 | modals-ai-tools] **FloatingToolsPanel StyledInput/StyledSelect discard caller className — Gross Profit product-row grid spans are dropped** — `components/FloatingToolsPanel.tsx:39-50, 320-340`
  - StyledInput spreads {...props} BEFORE its hardcoded className, so the literal className wins and any caller-passed class is silently discarded. GrossProfit's product rows pass className="col-span-4"/"col-span-2" insid…
  - Fix: Merge: `className={\`base classes ${props.className ?? ''}\`}` (destructure className out of props first).
- **C59** [P3 | modals-ai-tools] **AiLenderManagerModal: progress map keyed by file.name and index keys — duplicate filenames collide and re-process** — `components/AiLenderManagerModal.tsx:85, 91-95, 170-174, 354-360, 505`
  - handleFileChange appends without dedupe, so picking the same rate sheet twice queues it twice (double AI cost, duplicate lender results that handleConfirm will then create-then-update). fileProgresses is a Map keyed b…
  - Fix: Key progress by a per-file id (index in the batch, or `${name}:${size}:${lastModified}`), dedupe on add, and use the same id for React keys.
- **C60** [P3 | modals-ai-tools] **DealComparison term select lacks 36/48 options — payment computed for a term the UI cannot display** — `components/FloatingToolsPanel.tsx:457-463`
  - The Term select offers only 60/72/84, but dealA/dealB are seeded from global dealData whose loanTerm can be 36 or 48 (DealStructuringModal and DealControls offer them). A controlled select whose value matches no optio…
  - Fix: Use the same option list as the rest of the app (36/48/60/72/84) or render dynamic options including the current value.
- **C61** [P3 | modals-ai-tools] **PaymentBreakdownChart: blank APR and 'Error' payments render a zero-interest pie** — `components/DealCharts.tsx:29-44`
  - `const interestRate = dealData.interestRate || 0;` coerces a blank ('') or 0 APR to 0, so the Analytics pie confidently shows Principal with $0 Interest when the rate is simply unset — the same blank-rate family the B…
  - Fix: When the rate is blank/non-numeric or the payment is 'Error', render a 'rate not set' placeholder instead of a zero-interest breakdown.
- **C62** [P3 | modals-ai-tools] **AiDealAssistant applies AI proposedChanges with no client-side clamps; tool-switch mid-analysis discards the run** — `components/AiDealAssistant.tsx:61-66, 34-59`
  - applySuggestion spreads suggestion.proposedChanges straight into global dealData. The server route does Zod-validate types (api/\_lib/ai/schemas.ts:245-267, z.coerce.number().finite()), which covers the dangerous strin…
  - Fix: Pick only known DealData keys with Number.isFinite + non-negative (and loanTerm from the allowed set) before spreading; optionally lift suggestionResult into the panel or a ref-cache so a tab switc…
- **C63** [P3 | regression-hunt] **Favorites-reconcile effect's `changed` guard is dead — every inventory refetch rewrites favorites localStorage and re-renders all favorites consumers** — `context/DealContext.tsx:562-577`
  - The hardening's reconcile effect sets `changed = true` whenever a favorite's VIN exists in inventory — regardless of whether `live` is the same object or has identical data — so the no-op guard `return changed ? next …
  - Fix: Set changed only when the live object actually differs: `if (live && live !== fav) { changed = true; return live; }` (reference inequality is sufficient here since mapInventoryItem creates fresh ob…
- **C64** [P3 | regression-hunt] **updateSettings performs network + localStorage side effects inside the setSettings updater function** — `context/DealContext.tsx:350-375`
  - The wrapped setter executes localStorage.setItem and a fire-and-forget updateDealerSettings(...) inside the React state updater callback. React documents updaters as pure functions it may invoke more than once (Strict…
  - Fix: Compute newSettings first (outside the updater) or persist from a useEffect keyed on settings; in updateDealerSettings, upsert deterministically (sort the lookup by created and/or enforce a unique …
- **C65** [P3 | regression-hunt] **handleInventoryUpdate silently skips persistence for rows without a PocketBase id, contradicting its own revert-and-notify comment** — `context/DealContext.tsx:520-557`
  - The hardening comment promises: 'when it [fails] (or there's no backing record id), revert the optimistic state and tell the user'. The code only handles the failure case inside `if (item && item.id)` — there is no el…
  - Fix: Add an else branch: either look the record up by VIN server-side before updating, or revert + toast ('This vehicle isn't saved to the server yet') when item.id is missing. Better: after syncInvento…
- **C66** [P3 | regression-hunt] **Rows with unknown model year are silently stamped with the current year when synced to the database** — `App.tsx:279-291`
  - itemsToSync maps parser output for syncInventory with `year: typeof v.modelYear === \"number\" ? v.modelYear : new Date().getFullYear()`. The parser deliberately preserves unknown years as 'N/A' (fileParser.ts:215-228…
  - Fix: Skip the row with a surfaced reason ('missing model year'), or persist a sentinel (0/null) the UI renders as 'N/A' — never the current year.
- **C67** [P3 | services-libs] **vinDecoder timeout stops covering the response after headers arrive — stalled body read hangs the lookup spinner forever** — `services/vinDecoder.ts:22-31`
  - `clearTimeout(timeoutId)` runs immediately after `await fetch(...)` resolves, which happens when response HEADERS arrive. The subsequent `await response.json()` reads the body with no abort coverage — on a connection …
  - Fix: Move clearTimeout into a finally block after the body is consumed, matching the postAiRoute pattern in aiProcessor.ts:132-134.
- **C68** [P3 | services-libs] **Password policy: HIBP k-anonymity implemented correctly, but fails open and is enforced only at client-side registration** — `lib/passwordPolicy.ts:51-83 (plus lib/auth.ts:46)`
  - Answering the audit questions directly: privacy is correct — SHA-1 locally, only the 5-char prefix sent, suffix compared locally, Add-Padding header set, padding entries (count 0) correctly excluded by the `count > 0`…
  - Fix: Mirror the minimum length/complexity in the PB users collection settings (server-side), and call validatePassword in any password-change/admin-create flows.
- **C69** [P3 | services-libs] **hooks/usePerformance.ts is 257 lines of dead code containing a buggy duplicate useLocalStorage (stale-closure setValue) and name-colliding debounce hooks** — `hooks/usePerformance.ts:1-257 (worst: 158-188)`
  - Nothing in the app imports usePerformance.ts (grep finds zero consumers of useThrottledCallback, useDeepMemo, useIntersectionObserver, useWindowSize, useMediaQuery, prefetch, or its useLocalStorage/useDebouncedValue/u…
  - Fix: Delete the file, or strip it to only the hooks that don't already exist elsewhere and fix the functional-update bug with setStoredValue's updater form.
- **C70** [P3 | services-libs] **useLocalStorage returns `parsed as T` after only top-level shape checks — stale/partial persisted objects flow into typed state** — `hooks/useLocalStorage.ts:28-49`
  - The guards only verify array-vs-object at the top level, then `return parsed as T`. Persisted objects with missing keys (after a DealData/FilterData shape change) or wrong-typed values (the `""` that DealControls writ…
  - Fix: Accept an optional validate/migrate callback (DealContext can pass mapDealData from lib/dealMappers.ts which already normalizes every field) and fall back to initialValue when it fails.
- **C71** [P3 | superadmin-dash] **DealerAdminDashboard role change and delete: API helpers throw but handlers have no try/catch — unhandled rejection, select left showing an un-applied role** — `components/admin/DealerAdminDashboard.tsx:140-158`
  - Unlike the superadmin helpers, updateDealerUser and deleteDealerUser do NOT swallow errors — they throw on PB failure and on the cross-dealer guard (api.ts:1264-1270, 1280-1286). handleRoleChange (155-158) and handleD…
  - Fix: Wrap both handlers in try/catch, toast.error on failure, and always loadData() in finally so the select snaps back to the server truth.
- **C72** [P3 | superadmin-dash] **Overview tab 'View as →' bypasses both the impersonation confirm and the inactive-dealer gate** — `components/admin/SuperAdminDashboard.tsx:2346-2355`
  - The Recent-dealers list calls onImpersonate(dealer.id) directly. DealerManagement routes the same action through confirmAction (720-730) and disables it for inactive dealers (1007-1016 `disabled={!dealer.active}` with…
  - Fix: Route the Overview button through the same handleImpersonate(dealer) used in DealerManagement (confirm + active gate), e.g. by lifting that handler up or passing the Dealer object.
- **C73** [P3 | superadmin-dash] **Edit-dealer form claims 'Code cannot be changed after creation' but edits and submits the code** — `components/admin/SuperAdminDashboard.tsx:808, 822-836, 713-718`
  - The edit panel's subheading says 'Code cannot be changed after creation.' yet the Code input directly below is fully editable and handleSubmit sends formData (including code) to updateDealer. DealerAdminDashboard tell…
  - Fix: Either render the code read-only in the edit form (and omit it from the update payload), or drop the copy and add an explicit confirm explaining the signup-code impact.
- **C74** [P3 | superadmin-dash] **resetForm pre-selects the alphabetically-first dealership for the next 'Add User'** — `components/admin/SuperAdminDashboard.tsx:1089-1103 vs 1078-1087`
  - Initial formData uses dealer: "" (forcing an explicit 'Select Dealer' choice — submit is disabled until chosen), but resetForm — which runs after every successful create/edit and on cancel — sets `dealer: dealers[0]?.…
  - Fix: Reset dealer to "" so every create requires an explicit dealership selection (the 'Select Dealer' placeholder + disabled submit already handle the empty case).
- **C75** [P3 | superadmin-dash] **AI key 'Test' gives zero feedback when the proxy fails — result is discarded and response.ok is never checked** — `components/admin/SuperAdminDashboard.tsx:1637-1648 (and lib/api.ts:882-907)`
  - testAiProviderKey never throws on failure: it ignores response.ok, parses a failed/HTML body into {} (ok:false, error undefined), and returns a result object — which AiProvidersCard.testKey discards, relying entirely …
  - Fix: Check response.ok in testAiProviderKey (throw with status text on non-2xx), and have testKey use the returned result to render immediate inline feedback instead of depending solely on the server ha…
- **C76** [P3 | superadmin-dash] **getSystemStats downloads every row of four collections platform-wide just to count them — on every dashboard mount and refresh** — `lib/api.ts:921-958 (consumed at SuperAdminDashboard.tsx:2442-2456)`
  - The Owner Console's loadData runs getSystemStats + getAllDealers + getAllUsers on mount and on each RefreshBar click. getSystemStats calls getFullList() on dealers, users, saved_deals, AND inventory (no fields project…
  - Fix: Use pb getList(1, 1) and read totalItems for each count (and a filtered count for activeDealers), or add a PB hook/route returning aggregate counts; reuse the already-fetched dealers/users arrays f…
- **C77** [P3 | superadmin-dash] **CreateDealerWizard: step-1 server errors surface on step 2, and the close button stays live mid-submit** — `components/admin/SuperAdminDashboard.tsx:278-302, 362-370, 591-613`
  - Two wizard edges: (1) handleSubmit runs from step 2, so a rejection caused by step-1 dealer fields (e.g. duplicate code/name — PB's generic 'Failed to create record.' message, since e?.message is used rather than e?.d…
  - Fix: Disable the close button while submitting; on error, map PB field errors (e?.data?.data) to the owning step and jump back to step 1 when dealer fields failed.
- **C78** [P3 | superadmin-dash] **SortHeader builds Tailwind classes dynamically (`text-${align}`) — works only by accident** — `components/admin/SuperAdminDashboard.tsx:141`
  - Tailwind's scanner cannot see dynamically-constructed class names, so `text-${align}` generates nothing by itself. The headers currently align correctly only because literal 'text-center'/'text-right'/'text-left' toke…
  - Fix: Map align to literal classes: `const alignCls = { left: "text-left", center: "text-center", right: "text-right" }[align]`.
- **C79** [P3 | tables-deals] **LtvCell/OtdLtvCell: rounded display crosses threshold-color boundaries — identical displayed LTV values get different colors** — `components/common/TableCell.tsx:64-108`
  - Color tiers compare the raw float against warn/danger/critical (default 115/125/135) while the text renders formatPercentage(value, 0). An actual 124.6% LTV displays '125%' in the sub-danger (yellow) color while an ac…
  - Fix: Classify on the displayed precision: `const shown = Math.round(value); if (shown >= critical) ...`, or display one decimal so 124.6 and 125.0 are visually distinct.
- **C80** [P3 | tables-deals] **PaymentCell renders 'Error'/'N/A' sentinels as bold green 'N/A' while sibling cells render gray '--' — masks calc errors as missing data** — `components/common/TableCell.tsx:133-137`
  - LtvCell, OtdLtvCell, and GrossCell all short-circuit non-numeric sentinels to a muted gray '--' (lines 72-73, 95-96, 114-115). PaymentCell has no sentinel branch: it pipes the value through formatCurrency, which conve…
  - Fix: Add the same sentinel guard as GrossCell (gray '--'), and consider a distinct visual for 'Error' vs 'N/A' across all four cells.
- **C81** [P3 | tables-deals] **VirtualizedTable: virtualizer ignores the in-flow sticky header (no scrollMargin) and absolute rows clip backgrounds under horizontal overflow** — `/Users/joegallant/AI App App Development Projects/LTV-Desking-PRO/components/common/VirtualizedTable.tsx:87-96, 114-145, 176-195`
  - Two measurement-geometry gaps, both currently masked but fragile: (1) The header div is in normal flow inside the scroll element, so all row content is offset by the header height (~41px), but useVirtualizer is config…
  - Fix: Pass `scrollMargin: headerRef.current?.offsetHeight ?? 0` (and use virtualRow.start - scrollMargin for translateY per tanstack docs), and give the header/body a shared `min-width: max-content` wrap…
- **C82** [P3 | tables-deals] **SavedDeals stagger animation: saving a deal (or realtime insert) leaves the last card at opacity-0 for seconds; plus stale duplicate components/Pagination.tsx invites wrong-import bugs** — `components/SavedDeals.tsx:15, 38-43 (and hooks/useAnimation.ts:35-58; components/Pagination.tsx:1-)`
  - useStaggerAnimation initializes visibleItems once (`useState(new Array(itemCount).fill(false))`). When a new deal is prepended (App.tsx:465 `setSavedDeals((prev) => [mappedSaved, ...prev])` or the realtime subscriptio…
  - Fix: In useStaggerAnimation, sync array length when itemCount changes (`setVisibleItems((prev) => prev.length === itemCount ? prev : Array.from({length: itemCount}, (_, i) => prev[i] ?? false))`) and sk…

## Appendix D — Reconciliation vs PRODUCTION_READINESS_PLAN.md

Of the 83 gap findings, **63 are NEW** — they appear nowhere in your existing readiness plan — and **20
are KNOWN-UNSCHEDULED** (in the plan, but with no date or owner). Per dimension (NEW / KU): D1 5/2 ·
D2 5/3 · D3 8/2 · D4 4/1 · D5 6/0 · D6 4/3 · D7 5/1 · D8 7/2 · D9 4/2 · D10 5/1 · D11 4/2 · D12 6/1.

The 20 KNOWN-UNSCHEDULED items — the parts of your own plan this report says to actually schedule:

| Plan item (PRP anchor where cited)                                | Dim   | This report's call                                                                                  |
| ----------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------- |
| Disclosure snapshot of customer-shown numbers (§6.3)              | D1/D7 | Schedule pre-pilot via new `deal_events` collection — the plan's audit_log mechanism is now invalid |
| Lawyer review of ToS/Privacy stubs                                | D1/D9 | Pre-invoice; fix false claims same-day, counsel pass before money                                   |
| Privacy claims vs reality (NPI, deletion SLA)                     | D2    | Half-day truth pass now, counsel later                                                              |
| PII inventory / retention program (§7.2)                          | D2    | One-page retention policy suffices for pilot                                                        |
| Safeguards service-provider addendum                              | D2/D9 | Attach to pilot agreement — counsel                                                                 |
| Backend product menu                                              | D3    | Correctly deferred (companion positioning)                                                          |
| Doc-fee cap validation (§5.6)                                     | D3    | Cheap warn-only fix, batch with tax work                                                            |
| DMS/700Credit/book integrations ladder (§6.1–6.2)                 | D4    | Keep sequencing; add interim honest-labeling workstream NOW                                         |
| Employee deactivate/suspend + password reset (§7.1)               | D6    | Wire forgot-password now; `active` flag pre-pilot                                                   |
| Permission matrix / "manager" tier (§7.1)                         | D6    | Define matrix in the same pass as cost-hiding                                                       |
| Multi-store groups (§6.6)                                         | D6    | Confirmed Later; don't sell to groups                                                               |
| Litestream restore drill (§2.1 — P0 "this week" as of 2026-05-16) | D8    | Slipped 3.5 weeks; run it this week, calendar the quarterly                                         |
| Two-machine warm standby (§4.1)                                   | D8    | Stays Later; do phone-runnable recovery rehearsal instead                                           |
| iPad/responsive pass (§5.4)                                       | D10   | Do the inventory-table slice only, pre-pilot                                                        |
| PostHog instrumentation (analytics P0)                            | D11   | 5 events, pre-pilot — a plan SLO depends on a nonexistent event                                     |
| Intercom/Crisp support widget                                     | D11   | Skip for pilot; cell number + prefilled mailto button                                               |
| Stripe billing (§8.2)                                             | D9    | Overkill for pilot — agreement + manual invoice instead                                             |
| Bake-off features: DMS sync/credit/e-sign/reports (§2.3 Q3–Q4)    | D12   | Correctly parked; pre-empt in the pilot pitch                                                       |

One plan correction made explicit: **PRP §6.3 proposes extending `audit_log` for disclosure snapshots, but
the May security migration locked audit_log creation to superadmin — client-side deal events can no longer
write to it.** The `deal_events` collection (G55) replaces that mechanism.
