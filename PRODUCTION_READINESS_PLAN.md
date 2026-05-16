# LTV Desking PRO — Production Readiness Plan

> **Status** Development → MVP (charging first customer target: Q3 2026)
> **Last updated** 2026-05-16
> **Doc version** v2 (research-backed, May 2026)
> **Owner** Joe Gallant (founder / eng)
> **Stack** PocketBase 0.26.5 on Fly · Vite + React 19 on Vercel · AI proxy via Vercel serverless · keys in PB

---

## Executive summary

LTV Desking PRO is a single-founder automotive-desking SaaS targeting US dealerships. The backend (PocketBase on Fly), frontend (React on Vercel), and AI proxy (Vercel serverless reading keys from PB) are all live. RBAC, audit logging, dealer-tenancy hardening, and a working Owner Console with AI provider key management have shipped this quarter. The next 90 days are about (a) closing the security/ops basics (Sentry, off-volume backups, memory bump, PR-gate CI) and (b) starting the UX uplift toward "looks credible to a dealer GM" — which is what unlocks first paying customers.

**Right now, this week (P0):** Sentry, PR-gate CI, off-volume backups, memory bump, pre-commit hooks, `pb.filter()` parameterization.

**Money required:**

| Goal                                                     | Time        | 2026 USD      |
| -------------------------------------------------------- | ----------- | ------------- |
| **Credible Series-A SaaS** (no sales-call embarrassment) | 8–12 weeks  | **$30–60K**   |
| **Linear-grade polish** (tweet-able screenshots)         | 4–6 months  | **$200–400K** |
| **Category leader** (DMS integrations, compliance)       | 6–12 months | **$300–800K** |

**Top three KPIs to track once instrumented:** activation rate (signup → first saved deal), deal-save success rate (target ≥ 99.95%), API p95 latency (target < 300 ms).

**Biggest open risk:** single-region Fly machine. One bad host = full outage. Mitigation in §13.

---

## Table of contents

1. [Current state](#1-current-state)
2. [Roadmap (Now / Next / Later)](#2-roadmap)
3. [Strategic foundations](#3-strategic-foundations)
4. [Technical hardening](#4-technical-hardening)
5. [UX & design quality](#5-ux--design-quality)
6. [Auto-finance domain depth](#6-auto-finance-domain-depth)
7. [Trust, security & compliance](#7-trust-security--compliance)
8. [Go-to-market & commercial](#8-go-to-market--commercial)
9. [Operational readiness](#9-operational-readiness)
10. [Cost / team / timeline](#10-cost--team--timeline)
11. [Launch checklist](#11-launch-checklist)
12. [Definition of done](#12-definition-of-done)
13. [Risk register](#13-risk-register)
14. [Decision log](#14-decision-log)
15. [Appendix A — Executed history](#appendix-a--executed-history)
16. [Appendix B — Sources](#appendix-b--sources)

**Legend.** ✅ shipped · 🚧 in flight · 📋 planned · ⚠️ blocked · 💤 deferred · ❌ won't do
**Effort.** XS (<1 day) · S (1–3 days) · M (4–10 days) · L (2–4 weeks) · XL (1–3 months) · XXL (3–6 months)

---

## §1 Current state

### Shipped this quarter (most recent first)

| Area                          | What                                                                                                                                                                                                                                                    | Files                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Litestream R2 backups      | Continuous WAL replication to Cloudflare R2 (bucket `ltv-desking-pro-backups`). 10 s sync, 24 h snapshot, 14-day point-in-time recovery. Verified — first snapshot 31,816 bytes in 176 ms. Restore drill runbook in `docs/runbooks/r2-backup-setup.md`. | `backend/start.sh`, `backend/Dockerfile`, `backend/litestream.yml`, `.github/workflows/set-fly-secrets.yml`, `.github/workflows/recover-fly.yml`, `.github/workflows/fly-diag.yml` |
| ✅ Sentry frontend            | DSN baked into production bundle (Vercel build env). Conditional init so PR previews stay quiet. ErrorBoundary captures via `Sentry.captureException`. Ingestion verified end-to-end with a real test event.                                            | `lib/sentry.ts`, `index.tsx`, `components/common/ErrorBoundary.tsx`, `.github/workflows/deploy-vercel.yml`                                                                         |
| ✅ PR-gate CI                 | `check.yml` runs lint + type-check + test + build on every PR to `main` and every push to non-`main` branches. Concurrency-grouped, 10 min timeout, contents:read perms.                                                                                | `.github/workflows/check.yml`                                                                                                                                                      |
| ✅ Pre-commit hooks           | husky v9 + lint-staged fires `eslint --fix` + `prettier --write` on every commit. `prepare: husky` so fresh clones auto-install.                                                                                                                        | `.husky/pre-commit`, `package.json`                                                                                                                                                |
| ✅ `pb.filter()` migration    | All 9 query sites in `lib/api.ts` + `lib/auth.ts` migrated from manual `escapeFilterString` + template strings to parameterized `pb.filter("dealer = {:dealer}", { dealer })`. `escapeFilterString` deprecated.                                         | `lib/api.ts`, `lib/auth.ts`, `lib/typeGuards.ts`                                                                                                                                   |
| ✅ Memory bump 512 MB → 1 GB  | Fly VM bumped (+$4/mo). Removes "is this OOM?" from incident triage with PB + JSVM + AI proxy + Litestream all on the box.                                                                                                                              | `backend/fly.toml`                                                                                                                                                                 |
| ✅ AI proxy                   | Production AI proxy lives at `/api/ai/*` on Vercel serverless. Wraps the same handler the Vite dev plugin uses. Keys resolved per-request from PB with 60 s cache + env-var fallback.                                                                   | `api/ai/[...path].ts`, `api/_lib/ai/*`                                                                                                                                             |
| ✅ AI key store               | `ai_provider_keys` PB collection (superadmin-only RBAC). Owner Console UI lets you add/replace/test/remove keys. Test endpoint round-trips to each provider. Masked display, full keys never leave PB.                                                  | `backend/pb_migrations/1747600000_*.js`, `lib/api.ts`, `components/admin/SuperAdminDashboard.tsx`                                                                                  |
| ✅ AI defaults                | `aiDefaults` on `system_settings` for provider + per-task model. Editable in Owner Console.                                                                                                                                                             | `backend/pb_migrations/1747600001_*.js`                                                                                                                                            |
| ✅ Audit log                  | Append-only `audit_log` collection (superadmin read, `actor=auth` create, no update/delete). Records every key add/clear/test. Owner Console renders the 25 most recent entries.                                                                        | `backend/pb_migrations/1747600002_*.js`, `lib/api.ts`                                                                                                                              |
| ✅ Dealer-tenancy write guard | `pb_hooks/dealer_guard.pb.js` overwrites the `dealer` field on create/update of every dealer-scoped record with `auth.dealer`. Superadmin exempt. Closes spoofing surface.                                                                              | `backend/pb_hooks/dealer_guard.pb.js`, `backend/Dockerfile`                                                                                                                        |
| ✅ Route auth                 | `/api/ai/*` (except `GET /models`) requires `Authorization: Bearer <pb-token>`. `/api/ai/test-key` requires superadmin. Validated via `pb.authRefresh()` per request.                                                                                   | `api/_lib/ai/auth.ts`, `services/aiProcessor.ts`                                                                                                                                   |
| ✅ Fly health check           | 30 s `/api/health` check in `fly.toml`. Rolling deploys now actually verify the new release.                                                                                                                                                            | `backend/fly.toml`                                                                                                                                                                 |
| ✅ CI validate-migrations     | GH Actions job boots ephemeral PB on empty data dir, runs all migrations, asserts via SQLite, re-boots for idempotency. flyctl action SHA-pinned.                                                                                                       | `.github/workflows/deploy-backend-fly.yml`                                                                                                                                         |
| ✅ Baseline migrations        | 1746999000–005 idempotently recreate dealers / users-fields / inventory / lender_profiles / saved_deals / dealer_settings. Lets CI validate against an empty DB.                                                                                        | `backend/pb_migrations/1746999*.js`                                                                                                                                                |
| ✅ RBAC tightening            | Read-side rules locked every dealer-scoped collection to `@request.auth.dealer = dealer`. Unauthed reads on dealers and lender_profiles now return empty.                                                                                               | `backend/pb_migrations/1747400002_*.js`                                                                                                                                            |
| ✅ Email visibility backfill  | `1747500000_backfill_email_visibility.js` flips `emailVisibility=true` on existing users so Owner Console can see emails.                                                                                                                               | `backend/pb_migrations/1747500000_*.js`                                                                                                                                            |
| ✅ URL tab sync               | Active tab now lives in `?tab=` search param. Survives refresh, shareable.                                                                                                                                                                              | `App.tsx`                                                                                                                                                                          |
| ✅ Vercel SPA + API routing   | Rewrite regex excludes `/api/` so serverless functions resolve before the SPA fallback.                                                                                                                                                                 | `vercel.json`                                                                                                                                                                      |
| ✅ PB upgrade 0.22 → 0.26.5   | Image pin took effect with `_admins → _superusers` rename + typed Field constructors.                                                                                                                                                                   | `backend/Dockerfile`                                                                                                                                                               |

### In flight (uncommitted, working tree)

| Area                      | What                                                     | Files     |
| ------------------------- | -------------------------------------------------------- | --------- |
| 🚧 React Router URL state | Additional `useSearchParams` plumbing beyond the tab fix | `App.tsx` |

### File-size measurements (May 2026)

Used by §4 to justify the "God files" call-out.

| File                                       | Lines | Notes                                              |
| ------------------------------------------ | ----- | -------------------------------------------------- |
| `App.tsx`                                  | 1,184 | up from 1,169                                      |
| `components/admin/SuperAdminDashboard.tsx` | 2,610 | up from 2,134 — grew 22 % during AI key UI work    |
| `lib/api.ts`                               | 1,219 | up from 1,000                                      |
| `context/DealContext.tsx`                  | 682   | unchanged                                          |
| `constants.ts`                             | 947   | unchanged                                          |
| `components/common/Icons.tsx`              | 1,032 | hand-rolled SVG — still owed a `lucide-react` swap |

---

## §2 Roadmap

### 2.1 Now — this week (P0)

| Item                                               | Status | Effort | Cost                         | Success metric                                       | Depends on          |
| -------------------------------------------------- | ------ | ------ | ---------------------------- | ---------------------------------------------------- | ------------------- |
| **Sentry frontend errors**                         | 📋     | XS     | $0 (free tier; 5K events/mo) | Errors visible in Sentry dashboard                   | none                |
| **PR-gate CI** (lint + type-check + test on PR)    | 📋     | XS     | $0                           | All PRs blocked by red CI                            | none                |
| **Pre-commit hooks** (husky + lint-staged)         | 📋     | XS     | $0                           | Bad commits never reach the remote                   | none                |
| **`pb.filter()` parameterization** (9+ call sites) | 📋     | S      | $0                           | Zero `escapeFilterString` references in `lib/api.ts` | none                |
| **Off-volume PB backups → R2** (Litestream)        | 📋     | S      | <$5/mo                       | Daily-tested restore works                           | R2 bucket + secrets |
| **Memory bump 512 MB → 1 GB Fly machine**          | 📋     | XS     | +$4/mo                       | OOM removed from incident hypothesis list            | none                |

> **🎯 If you only do one thing this week** — Sentry. Five minutes of wiring, and the next deploy regression surfaces in 30 seconds instead of when a customer emails.

### 2.2 Next — this quarter (Q2 2026, P1)

| Item                                                                                                                              | Status | Effort | Cost                  | Success metric                                      |
| --------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | --------------------- | --------------------------------------------------- |
| **Break up SuperAdminDashboard.tsx** (2,610 → ≤500 LOC per file)                                                                  | 📋     | L      | $7–10K                | No single component > 800 lines                     |
| **DealContext / React Query consolidation** (kill duplication)                                                                    | 📋     | L      | $5–7K                 | One source of truth per server resource             |
| **Drop hand-rolled `Icons.tsx`** → `lucide-react`                                                                                 | 📋     | S      | $0–7K                 | Bundle −50 KB; consistent stroke widths             |
| **Kill `as any` / `@ts-ignore` escape hatches** (~10+)                                                                            | 📋     | XS     | $0                    | grep returns 0; one reviewed `asRecord<T>` helper   |
| **PB slow-query / 5xx hook**                                                                                                      | 📋     | S      | $0                    | Slow + error logs in PB stdout with structured JSON |
| **Sentry + PostHog wired** with 5 events (`deal_saved`, `lender_matched`, `pdf_generated`, `inventory_uploaded`, `sample_loaded`) | 📋     | M      | $0                    | Funnel visible; events firing in prod               |
| **Public marketing landing at `/`** (move app to `/app`)                                                                          | 📋     | L      | $5–10K                | First organic signup attributable to landing        |
| **Bundle splitting + lazy-load `jspdf` / `html2canvas` / `tesseract.js`**                                                         | 📋     | M      | $0                    | First-paint JS < 500 KB gzipped                     |
| **shadcn/ui primitive layer migration (start)**                                                                                   | 📋     | XL     | $25–40K (eng)         | Button / Input / Dialog / Toast / Tabs migrated     |
| **State primitives:** `<EmptyState>`, `<DataLoading>`, `<DataError>`                                                              | 📋     | M      | $5–8K                 | Used on every fetch path                            |
| **Stripe billing wired**                                                                                                          | 📋     | M      | $0 (Stripe fees only) | First test charge clears in test mode               |
| **Privacy policy + ToS** at `/privacy` and `/terms`                                                                               | 📋     | XS     | $0–500 (Termly)       | Pages live; linked from footer                      |

### 2.3 Later — Q3 + Q4 2026 (P2)

| Item                                                          | Status | Effort      | Cost        | Notes                                                         |
| ------------------------------------------------------------- | ------ | ----------- | ----------- | ------------------------------------------------------------- |
| **Two-machine Litestream warm-standby** (different region)    | 📋     | L           | +$10–20/mo  | Manual failover via anycast                                   |
| **DMS integration #1** — Tekion or Dealertrack                | 📋     | XL          | $20–40K     | Largest unlock for ACV growth                                 |
| **Credit pull integration** (700Credit or RouteOne soft pull) | 📋     | L           | $15–25K     | F&I workflow accelerator                                      |
| **E-signature** (DocuSign or Dropbox Sign)                    | 📋     | M           | $10–15K     | Wires onto existing jspdf output                              |
| **F&I Sentinel integration readiness**                        | 📋     | L           | $10–20K     | Schema first; full integration when contract volume justifies |
| **SOC 2 Type I** (Vanta or Drata + platform-partner auditor)  | 📋     | XXL elapsed | **$10–22K** | 4–6 months elapsed; unlocks 100+ store accounts               |
| **TOTP 2FA + SSO** (Google Workspace / M365)                  | 📋     | L           | $5–10K      | Required for any superadmin role                              |
| **Onboarding tour** (5-step + persistent checklist)           | 📋     | M           | $15–20K     | Activation rate ≥ 50 %                                        |
| **Linear-grade UX polish bundle** (see §5 Phase C)            | 📋     | XXL         | $100–150K   | Sustained design+eng investment                               |
| **Status page** (instatus or statuspage.io)                   | 📋     | XS          | $20–50/mo   | Required for enterprise conversations                         |
| **Multi-store / dealer-group schema**                         | 📋     | L           | $10–15K     | Add `dealer_group` parent collection                          |

### 2.4 Reference — not committed (P3)

Listed for completeness; revisit only when there's pull.

- 💤 Liveblocks multi-user presence — priced per MAC; revisit when 3+ dealerships request it
- 💤 Custom commissioned illustration set ($5–15 K) — `lucide-react` + careful sizing gets 90 %
- 💤 Sound effects on save — Linear has it; survey-driven, gate behind toggle
- ❌ Migrate off PocketBase to Postgres — no ROI until 10s of QPS sustained
- ❌ React → other framework — no
- ❌ Real-time multi-region writes — needs Turso/LibSQL or Postgres; not worth the rewrite

---

## §3 Strategic foundations

These are the cross-cutting decisions that determine how everything else looks and feels. Investments here multiply across the rest of the roadmap.

### 3.1 Brand identity

| Item                                                                                       | Status | Effort    | Cost    |
| ------------------------------------------------------------------------------------------ | ------ | --------- | ------- |
| Wordmark + logomark (commission or commission a designer for)                              | 📋     | M elapsed | $2–8 K  |
| Favicon (`/favicon.svg` + apple-touch-icon + manifest)                                     | 📋     | XS        | $0      |
| Meta tags — `description`, `theme-color`, OG, Twitter card                                 | 📋     | XS        | $0      |
| Single brand color decision (Apple/Google-style **or** Twitter dark — not both)            | 📋     | S         | $0      |
| Public marketing landing surface (`/` with story, screenshots, pricing CTA, "book a demo") | 📋     | L         | $5–10 K |
| Branded login screen (logo, tagline, trust signals)                                        | 📋     | S         | $0–2 K  |

> Today the browser tab shows a blank globe. Sharing any URL renders a naked link in Slack/iMessage. The first 200 ms of any visit is fixable for under a day's work.

### 3.2 Design system unification

Today the repo has _three_ parallel design systems coexisting in different files:

- Tailwind `x-black` / `x-blue` Twitter-clone tokens in `tailwind.config.ts`
- `--color-primary-50…900` tokens in `index.css` (Apple/Google-aspirational)
- Raw hex values scattered through `.tsx` components

The single-source-of-truth move in 2026:

- **Tailwind v4 is already in use.** `index.css` uses `@import "tailwindcss"`. v4 makes JavaScript config files unnecessary — all tokens live in a `@theme { … }` block and become CSS variables automatically.
- **Delete `tailwind.config.ts`.** The legacy `x-*` palette is dead weight.
- **Promote `index.css`'s `--color-primary-*` to canonical.** Use `bg-primary-500` (Tailwind utility) and `var(--color-primary-500)` (raw CSS) interchangeably. One source.

### 3.3 Component primitive layer — shadcn/ui

Confirmed 2026 default for production SaaS. Radix accessibility + Tailwind + designer-customizable. Mantine wins only for "very dense data-intensive B2B dashboards" — our Owner Console flirts with that bucket but the modal stack stays shadcn + occasional Tremor charts.

Replace hand-rolled `Button`, `Input`, `Select`, `Modal`, `Dialog`, `Toast`, `Tabs`, `Tooltip`, `DropdownMenu`. Migrate incrementally — start with `Button` + `Dialog` (highest blast radius).

### 3.4 Typography & spacing discipline

- **6-step type scale**: caption / body / body-bold / h3 / h2 / h1 / display. Tokens in `index.css`. Lint anything that uses raw `text-sm`/`text-base`/`text-lg` outside the type-scale primitives.
- **6-step spacing scale**: `1 / 2 / 4 / 6 / 8 / 12`. Lint others out.
- **Tabular numerals** on every financial column: `font-variant-numeric: tabular-nums lining-nums; letter-spacing: -0.01em;`. Use one `.financial-cell` class everywhere.

### 3.5 Microcopy & voice

Hire a UX writer for 3 weeks of voice + tone guide + pass over every visible string. Without this, "Hertz Car Sales" appears where the dealer code should, button labels mix sentence-case and title-case, error messages tell you _what_ went wrong but never _what to do next_. Cost: $10–15 K. Highest "feels built by adults" lift per dollar spent.

---

## §4 Technical hardening

### 4.1 Backend (PocketBase + Fly)

| Item                                                              | Status     | Effort       | Cost       | Notes                                                  |
| ----------------------------------------------------------------- | ---------- | ------------ | ---------- | ------------------------------------------------------ |
| Fly `/api/health` check                                           | ✅ shipped | —            | —          | 30 s interval, in `fly.toml`                           |
| Memory 512 → 1024 MB                                              | 📋         | XS           | +$4/mo     | Removes "is this OOM?" from incident triage            |
| Litestream replication → Cloudflare R2                            | 📋         | S            | <$5/mo     | Live WAL streaming; ~seconds of RPO                    |
| Two-machine warm standby (Litestream v0.5+ live SQLite-to-SQLite) | 📋         | L            | +$10–20/mo | Manual failover via anycast; not active-active         |
| Slow-query / 5xx PB hook                                          | 📋         | S            | $0         | `pb_hooks/log.pb.js` — sibling to `dealer_guard.pb.js` |
| Dealer write-guard hook                                           | ✅ shipped | —            | —          | `pb_hooks/dealer_guard.pb.js`                          |
| `pb.filter()` parameterized queries                               | 📋         | S            | $0         | Replace 9+ `escapeFilterString` call sites             |
| Scheduled backup-restore drill                                    | 📋         | XS quarterly | $0         | Quarterly calendar invite                              |

> **❌ Don't migrate to Postgres yet.** SQLite-on-Fly handles 10s of QPS comfortably and that's plenty of headroom. The day you outgrow it is a happy problem.

### 4.2 Frontend architecture

| Item                                                                                                 | Status | Effort | Cost   | Notes                                                                                |
| ---------------------------------------------------------------------------------------------------- | ------ | ------ | ------ | ------------------------------------------------------------------------------------ |
| Break up `SuperAdminDashboard.tsx` (2,610 lines)                                                     | 📋     | L      | $7–10K | Move to `features/admin/` folder                                                     |
| Break up `App.tsx` (1,184 lines)                                                                     | 📋     | L      | $5–8K  | Routing + layout + shell separation                                                  |
| Break up `DealContext.tsx` (682 lines) — split into 3 focused contexts or move into React Query      | 📋     | L      | $5–7K  | Same data in both DealContext and useLenderProfiles/useSavedDeals/useInventory today |
| Feature-folder layout (`features/inventory`, `features/deals`, `features/lenders`, `features/admin`) | 📋     | L      | $5–8K  | 53 flat components → 8–10 feature folders                                            |
| Kill `as any` / `@ts-ignore` (~10 sites)                                                             | 📋     | XS     | $0     | One reviewed `asRecord<T>` helper in `lib/pocketbase.ts`                             |
| Drop `Icons.tsx` (1,032 LOC) → `lucide-react`                                                        | 📋     | S      | $0     | Half the icon bundle; consistent stroke                                              |

### 4.3 AI proxy (already shipped)

All complete this quarter. Documented in §1 and `backend/DEPLOYMENT.md`.

> **🧠 Lesson learned (Vercel ESM bundling).** Vercel's `@vercel/node` bundler in `type:module` projects emits ESM. Node ESM resolution requires explicit `.js` extensions on relative imports — without them, the bundled function throws `ERR_MODULE_NOT_FOUND` at startup. TypeScript with `moduleResolution: bundler` + `allowImportingTsExtensions` accepts `.js` extensions that resolve to `.ts` source. Lesson: in this project, **every relative import in `api/_lib/*.ts` must end in `.js`** even though the file on disk is `.ts`.

### 4.4 Observability

| Item                                                                        | Status | Effort | Cost                                         | Notes                                                  |
| --------------------------------------------------------------------------- | ------ | ------ | -------------------------------------------- | ------------------------------------------------------ |
| Sentry frontend                                                             | 📋 P0  | XS     | $0 (5K events/mo free); $26/mo for Team plan | Wire in `index.tsx`                                    |
| PostHog product analytics                                                   | 📋     | S      | $0 (1M events/mo free)                       | `posthog.identify(user.id, {dealer, role})` + 5 events |
| Status page (instatus or statuspage.io)                                     | 📋     | XS     | $20–50/mo                                    | Subscribe-to-incidents required for enterprise         |
| On-call (PagerDuty or Opsgenie)                                             | 📋     | XS     | $0–20/mo                                     | Sentry → page → phone                                  |
| Runbooks (PB down / DB restore / customer locked out / OOM / AI rate-limit) | 📋     | M      | $0                                           | Five markdown files in `docs/runbooks/`                |

### 4.5 CI / DX

| Item                                                           | Status     | Effort    | Cost |
| -------------------------------------------------------------- | ---------- | --------- | ---- |
| `validate-migrations` job                                      | ✅ shipped | —         | —    |
| PR-gate CI (lint + type-check + test on `pull_request`)        | 📋 P0      | XS        | $0   |
| Pre-commit hooks (husky + lint-staged)                         | 📋 P0      | XS        | $0   |
| Renovate or Dependabot with auto-merge for patches             | 📋         | XS        | $0   |
| CODEOWNERS + PR template + Conventional Commits + `commitlint` | 📋         | S         | $0   |
| ADR folder (`docs/adr/`)                                       | 📋         | S ongoing | $0   |
| In-app changelog (`/changelog` route)                          | 📋         | M         | $0   |

---

## §5 UX & design quality

Three phases. Phase A is non-negotiable; Phase B is the credibility gate; Phase C is the Linear-grade upgrade.

### Phase A — essential (in §2.1–§2.2 timeline)

| Item                                                                             | Status | Effort | Notes                                                           |
| -------------------------------------------------------------------------------- | ------ | ------ | --------------------------------------------------------------- |
| State primitives (`<EmptyState>`, `<DataLoading>`, `<DataError onRetry>`)        | 📋     | M      | Used by every fetch path; today users see blank screens         |
| Accessibility pass (axe-core in CI, eslint-plugin-jsx-a11y)                      | 📋     | M      | Target: 0 errors; today 17/53 components have a11y attrs        |
| `react-hook-form` + `@hookform/resolvers/zod` + a `<Form>` primitive             | 📋     | M      | App already uses zod; reroll validation/errors/dirty/reset once |
| Tabular numerals + opentype features on financial cells                          | 📋     | XS     | 2-day FE task; $3K                                              |
| Toasts via `sonner` (replace `lib/toast.ts`)                                     | 📋     | XS     | 4 KB; saves ~80 lines of custom code                            |
| Form labels associated with every input (or `aria-label`)                        | 📋     | XS     | Linter catches this                                             |
| Focus rings standardized (`focus-visible:ring-2 ring-primary-500 ring-offset-2`) | 📋     | XS     | One token; apply project-wide                                   |
| Skip nav (`<SkipNavLink>`) verified to target `<main>` with `tabIndex={-1}`      | 📋     | XS     | Already imported; just confirm                                  |

### Phase B — credibility (Q2/Q3 2026)

| Item                                                                                 | Status | Effort | Notes                                                                  |
| ------------------------------------------------------------------------------------ | ------ | ------ | ---------------------------------------------------------------------- |
| Optimistic UI on every mutation                                                      | 📋     | L      | `onMutate` + `onError` rollback. Linear feels instant because of this. |
| Motion design with `motion` (v12) + native View Transitions API                      | 📋     | L      | Curves + durations from motion designer ($150/hr consult, 1 week)      |
| `cmdk` command palette (Cmd-K)                                                       | 📋     | L      | Action registry pattern; surface recent/frequent                       |
| Information-density pass with senior designer                                        | 📋     | L      | 8 px grid; right-align numbers; reduce primary-color noise             |
| `@tanstack/react-table` for inventory + saved deals (sort/filter/density/sticky/CSV) | 📋     | L      | Pairs with already-installed `react-virtual`                           |
| Currency / VIN / phone input masking (`react-number-format` + `imask` + custom VIN)  | 📋     | M      | F&I tooling must auto-format $25,000.00 not 25000                      |

### Phase C — Linear-grade (Q4 2026 +; needs design talent)

| Item                                                                                                                                                                        | Status | Effort    | Cost (USD)                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- | -------------------------------- |
| Choreographed motion across the app                                                                                                                                         | 📋     | XL        | $30–40 K                         |
| Real custom design language (senior designer, 4 months)                                                                                                                     | 📋     | XXL       | **$100 K** designer + ~$80 K eng |
| Custom illustrations (8–15 set, commissioned)                                                                                                                               | 📋     | L elapsed | $5–15 K                          |
| Real onboarding tour with persistent checklist                                                                                                                              | 📋     | L         | $15–20 K                         |
| Cross-route page transitions (View Transitions API)                                                                                                                         | 📋     | M         | $7 K                             |
| Inline cell editing with keyboard nav + Cmd-Z undo                                                                                                                          | 📋     | L         | $20 K                            |
| Layered shadows + deliberate gradients + backdrop-blur                                                                                                                      | 📋     | M         | $15 K                            |
| Microcopy voice guide + pass                                                                                                                                                | 📋     | M         | $10–15 K                         |
| Realtime presence ("Sarah is viewing this deal") via PocketBase subs + [Liveblocks](https://liveblocks.io) or lighter [PartyKit](https://partykit.io) on Cloudflare Workers | 💤     | L         | $14–40 K                         |
| Branded PDF templates worthy of customer trust                                                                                                                              | 📋     | M         | $20 K                            |

### 5.6 Product-depth touches (small but signal real domain knowledge)

These are bonus items that don't fit a single phase but materially affect how a dealer GM evaluates the product.

- **Smart defaults that show industry knowledge.** Default APR pulled from current Fed average. Default term suggested based on vehicle age. Default tax rate from dealer state. Default doc fee from state caps. Each one whispers "this product knows my business." Half a week of engineering per defaultable field.
- **Saved filters in the sidebar.** URL state for filters is stage one (✅ shipping with the tab fix). "Saved filters as named presets in the sidebar" is stage two — power users live here.
- **Recent searches / recently-viewed deals.** Surface in command palette (when §5 Phase B lands) and on the dashboard. Cheap to implement, high perceived intelligence.
- **Hire-source references for §3 microcopy + §5 illustrations:** [Working Not Working](https://workingnotworking.com), [Dribbble](https://dribbble.com), [Designer Hangout](https://designerhangout.co). Free illustration sources: [popsy.co](https://popsy.co). Reference icon sets if going beyond `lucide-react`: [Phosphor](https://phosphoricons.com), [Iconoir](https://iconoir.com).

> **🪞 Reality check.** shadcn/ui gets to "competent and accessible." Top-tier UI (Linear/Stripe/Vercel) takes a senior product designer for at least a quarter — $100 K of design + $80 K of engineering. There's no shortcut. Until the designer-screenshot test in §12 passes, you are at "really good Series-A," not top-tier.

### 5.4 Responsive / mobile

Only 22 of 54 components use Tailwind breakpoint classes. Salespeople will use this on an iPad on the lot.

- Mobile audit at 375×812 on every screen
- Hide non-essential table columns on mobile
- Bottom nav (4-icon bar) at `md:`-and-below
- 44×44 px minimum tap targets (Apple HIG)
- PWA manifest ("Add to Home Screen")

### 5.5 Performance

Current measurements:

- `index-*.js` 1.06 MB ungzipped (305 KB gzipped) — Recharts + jspdf + html2canvas + tesseract.js all on first paint
- `index-*.css` 159 KB
- No route-based code splitting

Plan:

- Lazy-load PDF (`jspdf` + `html2canvas`) on "Download PDF" click — saves ~400 KB from first paint
- Lazy-load OCR (`tesseract.js` ~250 KB JS + ~5 MB language data) on "Scan rate sheet"
- Route-split admin views; SuperAdminDashboard becomes its own chunk
- React Query `staleTime` tuning: inventory + lender profiles change rarely, set 5 min
- Lighthouse budgets in CI: block PRs that regress FCP > 2 s or initial JS > 1.5 MB

---

## §6 Auto-finance domain depth

Top-tier industry tools (CDK, Reynolds, Dealertrack, RouteOne) signal depth via integrations. Today the app is closed-loop. Below is the prioritized integration ladder.

### 6.1 DMS integrations

2026 market share is roughly:

| Rank | Vendor                                            | Share          | Integration priority                                               |
| ---- | ------------------------------------------------- | -------------- | ------------------------------------------------------------------ |
| 1    | CDK Global + Cox Automotive + Reynolds & Reynolds | ~80 % combined | High ACV; hardest APIs                                             |
| 2    | Tekion                                            | Growing        | **Start here** — modern API; dealers actively evaluating new tools |
| 3    | Dealertrack (Cox Automotive)                      | Second-biggest | More open API than CDK                                             |
| 4    | CDK Drive / CDK ONE                               | #1 share       | Proprietary, hardest to integrate                                  |
| 5    | DealerCenter                                      | Independents   | Lower ACV, easier sales                                            |

**Prioritize Tekion + Dealertrack first** — best ROI per integration-month.

### 6.2 Credit, book value, e-sign

- **Credit pull**: 700Credit, Equifax (via partner), RouteOne for soft-pull pre-approvals
- **Book values**: KBB, Black Book, MMR, J.D. Power — at least two for cross-checking
- **VIN decode**: NHTSA vPIC API (free, official) as fallback to J.D. Power
- **E-signature**: DocuSign or Dropbox Sign — wires onto existing jspdf output

### 6.3 Compliance — TILA / Reg Z 2026

- TILA exemption threshold $73,400 (was $71,900) effective Jan 1, 2026
- New 2026 requirements: every TILA-required disclosure stored with timestamp + digital confirmation
- AI-driven decisioning requires documented risk assessments
- Customers have a new right-to-delete records

**Implication for this app**: every saved deal record needs an immutable disclosure-snapshot artifact. The shipped `audit_log` collection is the right substrate — extend `action` enum to include `tila_disclosure_shown`.

### 6.4 F&I Sentinel readiness (Q3 2026 target)

F&I Sentinel integrated with both Dealertrack and RouteOne in January 2026 to validate F&I products at contract origination. Becoming table-stakes within 12 months. Build the integration surface area now (clean deal JSON schema, contract event hooks) so plugging in is a week, not a quarter.

### 6.5 Reporting suite (table stakes)

Front-end gross, back-end gross, F&I product attach rate, days-to-close, PVR — every dealership GM lives on these. A `/reports` tab with weekly/monthly/YTD rollups is required before charging mid-tier prices.

### 6.6 Multi-store / dealer-group support

Many dealer groups own 5–50 stores under one umbrella. Today's `dealer` is one-deep. Add a `dealer_group` parent collection before the first multi-store customer.

---

## §7 Trust, security & compliance

### 7.1 Identity & access

| Item                                  | Status | Notes                                                                  |
| ------------------------------------- | ------ | ---------------------------------------------------------------------- |
| TOTP 2FA via PB `_otps`               | 📋     | Required for any superadmin role                                       |
| SSO (Google Workspace / M365)         | 📋     | Most dealerships are Google for Business or M365 — unlocks fleet sales |
| Email verification on signup          | 📋     | Verify PB setting is on; `lib/auth.ts` may not enforce                 |
| Rate-limit + lockout on login         | 📋     | PB has built-ins — tune to 5 attempts / 15 min / IP                    |
| Password policy                       | 📋     | Min 12 chars; breach-check against `haveibeenpwned` k-anon             |
| Session TTLs                          | 📋     | Idle 12 h, absolute 30 d                                               |
| Per-role permission matrix documented | 📋     | superadmin / dealer admin / manager / salesperson                      |
| "View as" / impersonation (logged)    | 📋     | Today's `setSuperadminDealerOverride` is read-only                     |
| Superuser IP allowlist (PB 0.38+)     | 💤     | Wait until upgrade past 0.38                                           |

### 7.2 Multi-tenancy

- ✅ **Dealer write-guard hook** (`dealer_guard.pb.js`) — closed
- 📋 **`pb.filter()` parameterized** queries (kill `escapeFilterString`)
- ✅ **Audit log** (`audit_log` append-only) — closed; extend `action` enum as needed
- 📋 **PII inventory** — document everything stored about end customers and which collection holds it (GDPR/CCPA right-to-delete)

### 7.3 Hardening

- 📋 Content Security Policy via `<meta http-equiv="Content-Security-Policy">` or Vercel header rule
- 📋 Secret rotation runbook — `FLY_API_TOKEN`, `VERCEL_TOKEN`, `PB_SERVICE_PASSWORD`, provider keys — quarterly
- 📋 Add `PB_INTERNAL_URL` / `PB_SERVICE_EMAIL` / `PB_SERVICE_PASSWORD` to Vercel (ship blocker)

### 7.4 SOC 2 path

| Step                                   | Cost (2026 USD) | Source                            |
| -------------------------------------- | --------------- | --------------------------------- |
| Platform (Vanta / Drata / Secureframe) | $7.5–15 K/yr    | Secureleap 2026                   |
| Platform-partner auditor               | $2.5–7.5 K      | Secureleap 2026                   |
| **Total Type I all-in**                | **$10–22 K**    | (was $20–50 K in older estimates) |
| Type II observation window             | +$15–30 K       | Defer until customer requires it  |

> Don't aim for Type II until a customer explicitly requires it. Type I unlocks ≥100-store accounts.

### 7.5 Legal surface

- 📋 Privacy policy at `/privacy` (Termly draft, ~$500 or have a lawyer)
- 📋 Terms of service at `/terms`
- 📋 DPA template (Vanta provides templates)
- 📋 Subprocessor list (public page — Fly, Vercel, OpenAI/Anthropic/Gemini, PocketBase, Stripe, etc., updated on change; GDPR Article 28)

---

## §8 Go-to-market & commercial

### 8.1 Pricing benchmark

| Tier                                           | Per dealership / month | What's included                                              |
| ---------------------------------------------- | ---------------------- | ------------------------------------------------------------ |
| Independent / starter                          | $89–$300               | Inventory + simple desking                                   |
| **LTV Desking PRO target band**                | **$399–$799**          | Above "side project" signaling; below DMS-integrated pricing |
| Mid-tier (CRM + inventory + digital marketing) | $500–$1,000            | Competitive parity                                           |
| Enterprise (full suite + AI + integrations)    | $1,000–$3,000          | Requires DMS integration                                     |

NADA reports dealerships spend ~2–3 % of gross profit on technology. Below $300/mo signals "side project." Above $1,500/mo without DMS integration is hard to justify.

### 8.2 Billing & commerce

| Item                                                                | Status | Effort |
| ------------------------------------------------------------------- | ------ | ------ |
| Stripe Billing (subscriptions, seat counts, plan upgrades, dunning) | 📋     | M      |
| Stripe Tax                                                          | 📋     | XS     |
| Pricing page at `/pricing` (even if "Contact sales")                | 📋     | S      |
| 14-day free trial, no credit card required                          | 📋     | S      |
| Hand-off to sales for >5-store accounts                             | 📋     | S      |

### 8.3 Customer support & onboarding

| Item                                                                                          | Status | Effort |
| --------------------------------------------------------------------------------------------- | ------ | ------ |
| Intercom or Crisp chat widget                                                                 | 📋     | XS     |
| Monitored support email                                                                       | 📋     | XS     |
| Help center (Notion / GitBook / HelpScout Docs) with ≥ 20 articles                            | 📋     | M      |
| Onboarding flow: dealer info → upload inventory → set up lender → save deal → invite teammate | 📋     | L      |
| Persistent checklist in sidebar; track completion in `users.onboardingProgress` JSON          | 📋     | M      |
| Weekly digest email ("This week your team ran 47 deals, average gross $2,140")                | 📋     | M      |
| Email-on-stuck-deal nudges                                                                    | 📋     | M      |

### 8.4 Marketing surface

- 📋 Public landing at `/` (move app to `/app`)
- 📋 Screenshots, customer logos / quotes, pricing CTA, "book a demo"
- 📋 OG/Twitter card previews
- 📋 SEO basics: meta tags, sitemap, robots.txt
- 📋 Blog (technical credibility) — markdown in `/content/blog`

---

## §9 Operational readiness

### 9.1 SLOs (publish three numbers, measure against them)

| SLO                    | Target    | Measurement                                          |
| ---------------------- | --------- | ---------------------------------------------------- |
| API p95 latency        | < 300 ms  | Sentry performance + Fly metrics                     |
| Monthly uptime         | ≥ 99.9 %  | Status page derived                                  |
| Deal-save success rate | ≥ 99.95 % | PostHog event `deal_save_succeeded` / total attempts |

### 9.2 Runbooks (start with 5)

Create `docs/runbooks/` with markdown for:

1. **PB won't start** — typical causes (bad migration, OOM, volume mount fail); rollback path
2. **Fly machine OOM** — how to spot, immediate mitigation, scaling change
3. **DB corrupt — restore from R2** — exact `litestream restore` command sequence
4. **Customer locked out — superadmin recovery** — Owner Console + PB Admin steps
5. **AI provider rate-limited** — switch default provider via Owner Console; check `aiDefaults`

### 9.3 Disaster recovery

| Concept                        | Target                                        |
| ------------------------------ | --------------------------------------------- |
| RPO (recovery point objective) | ≤ 60 seconds (Litestream live WAL streaming)  |
| RTO (recovery time objective)  | ≤ 30 minutes (run restore + verify)           |
| Backup verification            | Quarterly restore drill on a separate Fly app |

### 9.4 Logging & alerting

- Sentry frontend errors → email at first; PagerDuty when revenue is on the line
- `pb_hooks/log.pb.js` slow-query + 5xx → structured JSON to stdout → Fly recent-logs view
- PostHog tracks the funnel; weekly review of drop-off

---

## §10 Cost / team / timeline

### Canonical cost summary

| Tier                                         | Time        | Cost (2026 USD) | Outcome                                   |
| -------------------------------------------- | ----------- | --------------- | ----------------------------------------- |
| **Today**                                    | —           | $0              | Functional MVP with partial polish        |
| **Credible Series-A SaaS** (90-day TL;DR)    | 8–12 weeks  | **$30–60 K**    | No sales-call embarrassment               |
| **Linear-grade polish** (§5 Phase C)         | 4–6 months  | **$200–400 K**  | Designer-tweet-able screenshots           |
| **Category leader** (§6 domain integrations) | 6–12 months | **$300–800 K**  | DMS + credit + compliance differentiation |

These assume contract talent. Full-time hires cost ~30 % more burdened. An equity-based design co-founder is the cheapest path; finding one is rare.

### Team you'd actually need

In hire-priority order:

| Role                        | Engagement                      | Rate / cost            | Notes                                            |
| --------------------------- | ------------------------------- | ---------------------- | ------------------------------------------------ |
| **Senior product designer** | 4 months contract or co-founder | $100–150/hr or $25K/mo | Hire first — they inform every other decision    |
| **Senior FE engineer**      | 6 months full-time              | $200/hr or $28K/mo     | Implements §4 + §5 across the board              |
| **Motion designer**         | 1 week consult                  | $150/hr                | Seeds the motion grammar for the FE to implement |
| **Illustrator**             | Fixed-bid set                   | $5–15 K                | Empty states + onboarding + marketing            |
| **UX writer**               | 3 weeks elapsed                 | $80–150/hr             | Voice & tone guide + visible-string pass         |

### Research-revised numbers vs. older estimates

| Item                                    | Older estimate | 2026 actual                                                      |
| --------------------------------------- | -------------- | ---------------------------------------------------------------- |
| Senior product designer hourly          | $175/hr        | **$100–150/hr** (Salary.com, Glassdoor)                          |
| SOC 2 Type I all-in                     | $20–50 K       | **$10–22 K** (Secureleap 2026, Cavanex 2026)                     |
| Sentry "free tier good enough to start" | accurate       | 5 K events/mo · 30-day retention; Team is $26/mo for 50 K events |
| PostHog "free tier is generous"         | accurate       | 1 M events/mo · 5 K session recordings · 100 K errors            |

---

## §11 Launch checklist

Concrete gates before charging customers. Every box must be ✅ before the first paid invoice.

### Trust & legal

- [ ] Privacy policy at `/privacy`
- [ ] Terms of service at `/terms`
- [ ] DPA template available on request
- [ ] Subprocessor list at `/subprocessors`
- [ ] Email-verified signup (PB setting on)
- [ ] Password policy enforced (min 12 chars + breach check)
- [ ] Audit log live ✅
- [ ] Dealer write-guard hook live ✅
- [ ] Secrets rotation runbook documented
- [ ] CSP header in place

### Reliability

- [ ] At least one off-volume backup taken AND restored to a scratch Fly app
- [ ] Sentry frontend wired ✅
- [ ] Fly health check live ✅
- [ ] Status page live (instatus / statuspage.io)
- [ ] Runbook for PB down, DB restore, customer locked out
- [ ] On-call schedule (even if solo, email-to-phone via Sentry alerts)

### UX baseline

- [ ] Favicon + apple-touch-icon + manifest
- [ ] Meta description + OG card + Twitter card
- [ ] Empty / loading / error states on every data-fetching view
- [ ] axe-core: 0 errors on every primary view
- [ ] Lighthouse mobile ≥ 80 on inventory / saved-deal / login
- [ ] All forms have proper labels
- [ ] All toasts have `aria-live="polite"` (or `assertive` for errors)
- [ ] Skip nav works (keyboard tab from URL bar lands on `<main>`)
- [ ] Tab state survives refresh ✅
- [ ] Tabular numerals on every financial column

### Commercial

- [ ] Stripe checkout wired (test mode)
- [ ] Pricing page at `/pricing`
- [ ] Support email monitored
- [ ] Help center with ≥ 10 articles covering top workflows
- [ ] Onboarding flow tested end-to-end with a real outside user

### Engineering

- [ ] PR-gate CI green on `main`
- [ ] Pre-commit hooks installed
- [ ] No `as any` / `@ts-ignore` in `lib/api.ts`
- [ ] `pb.filter()` parameterized throughout
- [ ] Renovate or Dependabot enabled

---

## §12 Definition of done — top-tier criteria

Concrete pass/fail. If all are true, you're at Linear-grade.

1. ✅ **Lighthouse mobile score ≥ 95** across Performance / Accessibility / Best Practices / SEO
2. ✅ **First Contentful Paint < 1.2 s** on throttled 4G
3. ✅ **Cumulative Layout Shift = 0** on every primary view
4. ✅ **All interactive elements** pass keyboard nav and have visible focus rings
5. ✅ **WCAG 2.2 AA contrast** on every text/background combination
6. ✅ **Empty / loading / error / success** states wired on every data-fetching view
7. ✅ **Cmd-K** opens a working command palette covering ≥ 80 % of in-app actions
8. ✅ **Mutations apply instantly** to UI (verified by toggling wifi off — optimistic update appears)
9. ✅ **OG / Twitter share previews** render correctly when pasted into iMessage, Slack, Twitter
10. ✅ **Designer-screenshot test:** pick 10 random views, screenshot them, ask three designers on Designer Hangout / Dribbble whether the product looks "Linear-quality." Threshold: 7 + yes.

> **🪞 Reality check.** Until #10 is consistently yes, you're not top-tier — you're at "really good Series-A." Which is fine and ships customers. Just be honest about which one you've actually shipped.

---

## §13 Risk register

| Risk                                                           | Likelihood | Impact | Mitigation                                                                          | Status     |
| -------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------- | ---------- |
| Single-region Fly machine outage                               | M          | H      | Litestream + warm-standby in second region (§4.1)                                   | 📋         |
| SuperAdminDashboard grows past maintainability                 | H          | M      | Break up this quarter (§4.2)                                                        | 📋         |
| AI provider rate-limit during launch surge                     | M          | M      | Multi-provider fallback already in `aiDefaults`; Owner Console can switch           | ✅ partial |
| AI key compromise via Vercel env leak                          | L          | H      | Keys in PB (not env); audit log on every change ✅; quarterly rotation              | ✅ partial |
| F&I Sentinel becomes table-stakes Q3 2026                      | M          | H      | Schema ready; integration deferred (§6.4)                                           | 📋         |
| TILA disclosure not stored immutably                           | M          | H      | Extend `audit_log` `action` enum (§6.3)                                             | 📋         |
| SOC 2 demanded by first enterprise prospect before we're ready | M          | M      | Start Vanta/Drata when first 100-store conversation opens; ~$10–22 K                | 📋         |
| Vercel function 4.5 MB body cap hit by large lender PDFs       | M          | M      | Client-side PDF compression first; Blob direct-upload if needed (§4.3)              | 📋         |
| `escapeFilterString` injection (any future bug)                | L          | H      | Replace with `pb.filter()` (§7.2)                                                   | 📋         |
| OOM on 512 MB Fly machine under AI proxy load                  | M          | M      | Bump to 1 GB (§2.1, +$4/mo)                                                         | 📋         |
| Customer complains about missing F&I compliance feature        | M          | M      | Compliance consultant review before first paid customer                             | 📋         |
| Lost laptop = lost flyctl auth = locked out of prod deploys    | L          | M      | GH Actions deploy workflow ✅; backup token in 1Password                            | ✅         |
| All AI keys revoked simultaneously (unlikely but high-impact)  | L          | H      | Multi-provider; default-provider Owner Console switch; document recovery in runbook | 📋         |
| Frontend ESM bundling regression breaks Vercel function        | L          | M      | Lesson documented in §4.3 + decision log; `.js` extensions required                 | ✅         |

---

## §14 Decision log

Short ADR-style entries. Each captures the choice + rationale + tradeoff. New decisions go on top.

### 2026-05-16 · Vercel function imports must use `.js` extensions

**Context.** Production AI proxy returned `FUNCTION_INVOCATION_FAILED` despite a green build.
**Decision.** Every relative import in `api/_lib/*.ts` and `api/ai/*.ts` ends in `.js` (not bare or `.ts`).
**Rationale.** Project has `"type": "module"` in `package.json`. Vercel's `@vercel/node` emits ESM. Node ESM resolution requires explicit `.js` extensions on relative imports.
**Tradeoff.** TypeScript handles `.js`-pointing-at-`.ts` via `moduleResolution: bundler` + `allowImportingTsExtensions`. Cost: convention to maintain forever.

### 2026-05-16 · AI keys stored in PocketBase, not env vars

**Context.** Original setup had `OPENAI_API_KEY` etc. as Vercel env vars.
**Decision.** Provider keys live in a superadmin-only `ai_provider_keys` PB collection. Vercel function fetches them per request via `_superusers` service auth.
**Rationale.** Owner-controllable from Owner Console UI. Survives infrastructure migrations. No env-var drift between environments. Single source of truth.
**Tradeoff.** Adds a PB round-trip per cold-start. Mitigated by 60 s cache.

### 2026-05-16 · AI proxy on Vercel serverless, not PocketBase JSVM hook

**Context.** Could have implemented the AI proxy inside `pb_hooks/`.
**Decision.** Vercel serverless function at `api/ai/[...path].ts`.
**Rationale.** Fluid Compute timeout (300 s, up to 800 s) fits PDF extraction. Goja (PB JSVM) can't run `@google/genai` SDK without hand-rolling HTTPS. Vercel reuses existing TS code 1:1.
**Tradeoff.** Slightly more complex deploy story (two platforms). Vercel 4.5 MB body cap is a soft ceiling; mitigated by client-side PDF compression if hit.

### 2026-04-xx · Read-side RBAC + write-side `dealer_guard.pb.js` hook

**Context.** Read-time rules close the unauthed-read surface; client-supplied `dealer` values on writes still trusted.
**Decision.** PB hook rewrites `dealer` to `auth.dealer` on every create/update of dealer-scoped collections. Superadmin exempt.
**Rationale.** Defense in depth; a compromised frontend can't cross tenants.
**Tradeoff.** Adds one JS function call per write. Negligible.

### 2026-04-xx · PocketBase 0.22.20 → 0.26.5

**Context.** Needed typed Field constructors and JSVM `app` API for new migrations.
**Decision.** Bumped `PB_VERSION` in Dockerfile.
**Rationale.** Modern field types (`URLField`, `JSONField`), better JSVM API.
**Tradeoff.** `_admins → _superusers` rename + old plain-object `fields.add({...})` form rejected. Caused a ~5 min outage when one migration used the old form. Documented in DEPLOYMENT.md.

### Foundational choices (older but worth restating)

| Decision                                  | Rationale                                                                            | Tradeoff                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| **PocketBase** as backend                 | SQLite + auto-migrations + JSVM hooks + admin UI = solo-founder velocity             | Single-writer SQLite → single-region for now |
| **Fly** as host                           | Volume-based persistence, rolling deploys, cheap                                     | Single-region SQLite limits HA story         |
| **Vercel** for frontend + AI proxy        | Already deploys frontend; Fluid Compute fits AI; serverless keeps keys close to PB   | Cold starts (mitigated by 60 s cache)        |
| **React Query** for server state          | Optimistic UI substrate; cache layer                                                 | One more concept for new contributors        |
| **shadcn/ui** (planned, not yet migrated) | Radix a11y + Tailwind + designer-customizable                                        | Eng time to migrate hand-rolled primitives   |
| **Litestream** (not LiteFS)               | Fly sunset LiteFS Cloud in Oct 2024; Litestream v0.5+ supports live SQLite-to-SQLite | Manual failover, not automatic               |

---

## Appendix A — Executed history

Reference material from the May 2026 backend deploy + AI proxy work. Trimmed from ~280 lines of narrative.

### A.1 The RBAC + PB-upgrade deploy

Three migrations shipped: `1747400000_create_system_settings.js`, `1747400001_lender_profiles_enrichment_fields.js`, `1747400002_tighten_api_rules.js`. Headline change was the third — flipped every dealer-scoped collection from PB defaults to `@request.auth.dealer = dealer` filtering and closed unauthenticated reads on `dealers`, `lender_profiles`, and `dealer_settings`.

The deploy also picked up a PB binary upgrade 0.22.20 → 0.26.5 because the Dockerfile pin took effect (the live binary was older than the pin).

**Incident during the run.** First attempt failed on migration 1 with `TypeError: could not convert to core.Field` because the migration used 0.22's plain-object `collection.fields.add({name, type, ...})` shape. PB exited; API 502'd for ~5 min. Fix: rewrote migrations 0 and 1 to use typed constructors (`new URLField`, `new TextField`, `new JSONField`, `new EmailField`, `new BoolField`). Mig 2 was already 0.26-compatible. Fix commit redeployed cleanly in 41 s.

**Side workaround.** Local flyctl 0.4.52 hit a third-party-discharge-token error on every app-scoped operation. Worked around by writing `.github/workflows/deploy-backend-fly.yml` so future deploys go through CI using the existing `FLY_API_TOKEN` GH secret.

### A.2 The Vercel function ESM saga

After moving AI provider keys into PB and standing up the Vercel function for production AI, the function returned `FUNCTION_INVOCATION_FAILED` despite a green build. Diagnostic ping endpoints isolated the failure:

| Diagnostic                                                   | Result |
| ------------------------------------------------------------ | ------ |
| `/api/ping` (no imports)                                     | ✅ 200 |
| `/api/ping-pb` (imports `pocketbase`)                        | ✅ 200 |
| `/api/ping2` with `import { greet } from "./ping-helper"`    | ❌ 500 |
| `/api/ping2` with `import { greet } from "./ping-helper.js"` | ✅ 200 |

The fix was adding `.js` extensions to every relative import in the function's transitive import chain. The lesson is now in §4.3 and the decision log (§14).

### A.3 The "refresh sends you back to Inventory" bug

Reported by user; root cause was `activeTab` as plain `useState` in `App.tsx`. Every refresh re-mounted and snapped back to `"inventory"`. Fix synced tab with a URL search param via `useSearchParams`. Sample-data ephemerality was a separate diagnosis (load-sample wrote to memory only, never to PB) — option A (persist samples to PB on click) is the right call; not yet implemented.

---

## Appendix B — Sources

### Stack & tooling

- [Tailwind CSS v4.0 release notes](https://tailwindcss.com/blog/tailwindcss-v4)
- [Motion v12 React docs](https://motion.dev/docs/react)
- [View Transitions API baseline](https://developer.chrome.com/docs/web-platform/view-transitions)
- [TanStack Query — Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- [cmdk on GitHub](https://github.com/pacocoursey/cmdk)
- [shadcn/ui vs Mantine 2026 comparison](https://saasindie.com/blog/mantine-vs-shadcn-ui-comparison)
- [Fly.io: All-In on Server-Side SQLite + Litestream](https://fly.io/blog/all-in-on-sqlite-litestream/)
- [Litestream v0.5.0 — Fly blog](https://fly.io/blog/litestream-v050-is-here/)
- [PocketBase FAQ + going-to-production](https://pocketbase.io/docs/going-to-production/)
- [Vercel Fluid Compute pricing](https://vercel.com/docs/functions/usage-and-pricing)
- [Vercel function limits](https://vercel.com/docs/functions/limitations)
- [Cloudflare R2 docs](https://developers.cloudflare.com/r2/)

### Auto-finance market & compliance

- [Automotive News — DMS giants face challengers](https://www.autonews.com/dealers/dms-disrupted-not-just-2-giants-now/)
- [Auto Finance News — F&I Sentinel integrates with Dealertrack + RouteOne](https://www.autofinancenews.net/allposts/technology/fi-sentinel-rolls-out-automated-validation-through-dealertrack-routeone/)
- [CFPB 12 CFR Part 1026 — Regulation Z](https://www.consumerfinance.gov/rules-policy/regulations/1026/)
- [Dealership compliance standards 2026](https://chriscollinsinc.com/sdr/dealership-compliance-standards-a-complete-guide-2026/)
- [Capterra dealership software comparisons](https://www.capterra.com/p/178701/Dealership-Software/)

### SaaS infra costs

- [Sentry pricing](https://sentry.io/pricing/)
- [PostHog pricing](https://posthog.com/pricing)
- [Secureleap SOC 2 tools comparison 2026](https://www.secureleap.tech/blog/soc-2-tools-vanta-drata-secureframe-guide-2025)
- [Cavanex SOC 2 cost breakdown 2026](https://cavanex.com/blog/soc-2-compliance-cost-2026)
- [Salary.com — Senior Product Designer hourly](https://www.salary.com/research/salary/listing/senior-product-designer-hourly-wages)
- [Glassdoor — Senior Product Designer pay](https://www.glassdoor.com/Salaries/senior-product-designer-salary-SRCH_KO0,23.htm)
