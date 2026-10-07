# LTV Desking PRO — system design

_Last reviewed 2026-10-06. This is the document a dealership's IT or compliance
reviewer asks for before a pilot: what the system is made of, where the data
lives, how tenants and confidential fields are kept apart, what happens when a
machine dies, and which decisions we expect to revisit._

## 1. What the system does, and under what constraints

**Functional.** A dealership desks a car deal: pick a unit from inventory, set
terms (down, term, APR, customer FICO/income), see the payment and
loan-to-value reprice live, see which lender programs the structure fits, and
save the deal to a pipeline. Admins import inventory (CSV/XLSX from the DMS)
and lender programs (AI extraction from rate sheets, reviewed before save),
manage users and dealership details, and read reports. Platform superadmins
operate many dealerships from one console.

**Non-functional.**

| Requirement           | Target                                                                               | How it is met                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant isolation      | A user never reads or writes another dealership's rows                               | PocketBase API rules on every collection + `dealer_guard.pb.js` forcing the dealer on writes                                                                  |
| Field confidentiality | Sales staff never see unit cost, front-end gross, buy rates or dealer reserve        | `field_visibility.pb.js` (serialization) + `field_filter_guard.pb.js` (filter/sort/realtime oracle); see §5                                                   |
| Repricing latency     | Every keystroke reprices the whole lot in well under 100 ms on a showroom laptop     | Rules engine runs in the browser over the dealer's own inventory (hundreds to low thousands of units); staged memoization in `hooks/useProcessedInventory.ts` |
| Availability          | Business hours, one region (US); minutes of downtime are tolerable, data loss is not | Single Fly machine with Litestream continuous replication; see §6                                                                                             |
| Accessibility         | WCAG 2.2 AA                                                                          | Design tokens, ARIA patterns, axe gate in CI (`docs/ACCESSIBILITY.md`)                                                                                        |
| Auditability          | Who changed what, when                                                               | `deal_events`, `audit_log`, `log.pb.js`                                                                                                                       |
| Cost                  | Solo-founder budget                                                                  | PocketBase on one small VM, Vercel hobby/pro tier, metered AI with per-dealer quotas                                                                          |

**Constraints.** One engineer. Existing stack is React + PocketBase; no
appetite for a second database or a Kubernetes-shaped operation. Dealership
data volumes are small (a store carries 50–500 units; a group carries low
thousands), so SQLite is not the bottleneck — operational simplicity is.

## 2. Components

```
 ┌──────────────────────────┐        ┌──────────────────────────────┐
 │  Browser (React 19 SPA)  │        │  Vercel Functions (Node 24)  │
 │  Vite · React Query      │  HTTPS │  /api/ai/*  AI proxy         │
 │  rules engine (client)   │◄──────►│  role check · per-dealer     │
 │  Sentry · PostHog        │        │  quota · schema validation   │
 └─────────────┬────────────┘        └──────────────┬───────────────┘
               │ PocketBase SDK (REST + SSE realtime)│ service account
               ▼                                     ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  PocketBase 0.39 (Fly.io, ord, 1 machine, 1 vCPU / 1 GB)         │
 │  SQLite  ·  28 migrations  ·  8 JSVM hooks  ·  API rules        │
 │  Litestream ──► object storage (continuous WAL replication)     │
 └─────────────────────────────────────────────────────────────────┘
               │
               ▼  outbound only, from the Vercel proxy
 ┌─────────────────────────────┐
 │  AI providers (OpenAI,      │
 │  Anthropic, Gemini) — keys  │
 │  live server-side only      │
 └─────────────────────────────┘
```

- **SPA** (`components/`, `services/`, `hooks/`, `context/`). Owns the user
  experience and the **rules engine**: `services/lenderMatcher.ts` (tier
  eligibility), `services/lenderFit.ts`, `services/approvalScorer.ts`,
  `services/calculator.ts` (payment, LTV, tax by state). Data access is
  React Query over the PocketBase SDK with realtime invalidation.
- **AI proxy** (`api/_lib/ai/`). The only place provider keys exist. Routes:
  `lender-extract`, `lender-enrich` (admin/superadmin only), `deal-analysis`,
  `models`, `provider-keys`, `test-key`. Enforces auth, role, per-dealer rate
  limits (`ai_rate_limit.pb.js` on the PocketBase side), Zod validation and
  **range checks** (`schemas.ts`): an implausible value is dropped into
  `rangeFlags` and the tier is marked `needsReview`, which the rules engine
  treats as _pending — never an approval path_ until a human verifies it.
- **PocketBase**. Auth (`users` with `role` ∈ sales/manager/admin/superadmin
  and a `dealer` relation), collections, API rules, and JSVM hooks:
  `authorization_rules`, `dealer_guard`, `users_guard`, `deal_attribution`,
  `field_visibility`, `field_filter_guard`, `ai_rate_limit`, `log`.
- **Delivery.** GitHub Actions: `check.yml` (format, types, lint, unit,
  coverage, build, Playwright incl. a seeded real PocketBase on PRs/main),
  `codeql.yml`, `deploy-vercel.yml`, `deploy-backend-fly.yml`, plus
  operational workflows (`recover-fly`, `rotate-pb-service-account`,
  `set-fly-secrets`, `fly-diag`).

## 3. Data model

| Collection         | Owner    | Notes                                                                                                                                                                                                                                     |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dealers`          | platform | Tenant root. `code` is the signup/dealer code.                                                                                                                                                                                            |
| `users` (auth)     | dealer   | `role`, `dealer`, `active`. `users_guard` clamps role changes and blocks deactivated logins.                                                                                                                                              |
| `inventory`        | dealer   | Units. **Confidential:** `unitCost` (and derived gross).                                                                                                                                                                                  |
| `lender_profiles`  | dealer   | Program + `tiers` JSON (FICO/LTV/term/mileage/year limits, `needsReview`, `rangeFlags`). **Confidential:** `reservePct` and every tier's `baseInterestRate` / `rateAdder` / markup fields. `isSample` marks seeded illustrative programs. |
| `saved_deals`      | dealer   | Customer, structure (`dealData`), `vehicleData` snapshot, `calculatedData` snapshot, status.                                                                                                                                              |
| `deal_events`      | dealer   | Append-only event log per deal (`deal_attribution` stamps the actor).                                                                                                                                                                     |
| `dealer_settings`  | dealer   | Fees, taxes, LTV thresholds, backend product defaults.                                                                                                                                                                                    |
| `audit_log`        | platform | Privileged actions.                                                                                                                                                                                                                       |
| `ai_provider_keys` | platform | Encrypted provider keys; read only by the proxy's service account.                                                                                                                                                                        |
| `system_settings`  | platform | Signups kill-switch, announcement banner.                                                                                                                                                                                                 |

All dealer-owned collections carry a `dealer` relation; API rules read
`@request.auth.dealer`. Rule state is asserted at boot and on a cron by
`authorization_rules.pb.js` so a migration mistake fails loudly.

## 4. Key flows

**Desk a deal.** Login → React Query loads the dealer's inventory, lender
programs and settings (realtime-subscribed) → every edit of the terms rail
re-runs `computeProcessedInventory` (score → filter → sort → paginate, each
stage memoized) → the focused unit's inspector shows payment, LTV, the
approval gauge and lender paths → _Save_ writes `saved_deals` and a
`deal_events` row; the pipeline screen is a projection of those rows.

**Import lender programs.** Admin uploads a rate sheet → SPA posts to
`/api/ai/lender-extract` → proxy verifies role + quota → provider returns
structured tiers → `schemas.ts` range-checks (`rangeFlags`, `needsReview`) →
admin reviews in the import modal and saves → `lender_profiles`. Flagged tiers
stay _pending_ on every desk until corrected or marked verified.

**Role-gated reads.** Sales requests `lender_profiles` → API rule allows the
dealer's rows → `field_visibility` strips `reservePct` and tier rate fields
(reading JSON fields as text — the JSVM exposes JSON as a byte array) →
`field_filter_guard` rejects (403) any `?filter=`/`?sort=`/realtime filter that
names a confidential field, so the values cannot be recovered by probing.

## 5. Security model and its known debt

Three layers, in order of trust:

1. **API rules** (record level) — tenant isolation. Verified on a seeded
   PocketBase in CI by `tests/e2e/field-visibility.spec.ts` and
   `backend/pb_hooks/runtimeHardening.test.ts`.
2. **Hooks** (field level) — confidentiality of cost/rate fields for roles
   below manager; platform superusers exempt so the dashboard never
   round-trips a stripped record.
3. **Client** — the rules engine's _pending_ status and the UI's role-aware
   affordances are usability, not security; nothing the browser hides is
   relied on for confidentiality.

**Debt, stated plainly:** layer 2 enforces confidentiality by _name matching_
(a protected-field list in two hooks) because PocketBase has no field-level
rules. It is proven on the production version with negative controls, but
every new confidential field must be added by hand, and the untagged list
guard touches every collection.

**Durable design (recommended before the second paying group):** move the
confidential fields into sibling collections with their own rules:

```
inventory (1) ──── (1) inventory_costs      { unit, unitCost, pack }
lender_profiles (1) ─ (1) lender_rates     { profile, reservePct, tierRates: {...} }
```

`inventory_costs.listRule/viewRule = @request.auth.role ?= 'manager' …` and
likewise for `lender_rates`; the SPA fetches them only for privileged roles and
joins client-side. Then `field_visibility`/`field_filter_guard` shrink to the
`saved_deals` snapshots (which should also stop embedding cost: persist a
`costSnapshotId` instead). Migration path: add collections and backfill in one
migration; dual-write from the admin editors for one release; switch reads;
drop the old fields. Cost: ~2 days plus the e2e proof.

Other items in the same bucket: 2FA for admin/superadmin, login lockout and
session TTL (PocketBase supports MFA/OTP since 0.23 — enable per role); a
support mailbox on a registered domain (`VITE_SUPPORT_EMAIL`).

## 6. Reliability and operations

- **Topology.** One Fly machine (`ord`, `auto_stop_machines = off`,
  `min_machines_running = 1`). SQLite lives on the machine's volume;
  **Litestream** streams the WAL to object storage continuously.
- **Recovery.** Lose the machine → `recover-fly.yml` recreates it and
  Litestream restores the latest replica. RPO is seconds (WAL shipping
  interval); RTO is the time to boot a machine and restore (minutes). There is
  **no hot standby**: a Fly region incident is downtime, not data loss.
- **Deploys.** Vercel for the SPA + proxy (preview per PR, promote on main);
  `deploy-backend-fly.yml` for PocketBase (the Dockerfile ships `pb_hooks` and
  `pb_migrations`; migrations run on boot).
- **Telemetry.** Sentry (SPA + proxy, with a per-error support reference
  shown to users), PostHog product analytics, PocketBase request logs.
- **Gaps.** No synthetic uptime check or on-call paging; no status page;
  provider outages surface only as failed extractions. Add an external
  uptime monitor on `/api/health` and the Vercel URL, and alert routing, before
  pilots sign.

## 7. Scale

Sizing is per dealership, and dealerships are small: a 300-unit lot with 15
lender programs reprices in tens of milliseconds in the browser; PocketBase
serves a few requests per user action. One 1 GB machine comfortably serves
dozens of dealerships; the first real limit is SQLite write contention under
many concurrent importers, far beyond pilot scale. Scaling steps, in order:
bigger Fly machine → read-heavy caching in React Query (already) → separate
import workers → Postgres only if a group with hundreds of stores signs.

## 8. Trade-offs made deliberately

| Decision              | Chosen                                               | Alternative     | Why                                                                                                 |
| --------------------- | ---------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| Rules engine location | Browser                                              | Server          | Instant repricing, no server cost per keystroke; confidentiality is enforced server-side regardless |
| Database              | SQLite + Litestream                                  | Postgres        | Zero ops for the data volumes involved; durable design in §5 keeps the move open                    |
| Field confidentiality | Hooks (now) → sibling collections (next)             | Hide in UI only | UI hiding is not security; hooks are proven but hand-maintained                                     |
| AI provider keys      | Server-side only, metered per dealer                 | Keys in browser | Keys never reach clients; cost control per tenant                                                   |
| Realtime              | PocketBase SSE, bare topics                          | Polling         | Simple; filtered subscriptions are guarded                                                          |
| Rate-sheet trust      | Range-checked + human review, pending until verified | Trust the model | A dropped minimum bound would widen a program; fail closed                                          |

## 9. What to revisit as it grows

1. Sibling collections for confidential fields (§5) — before the second group.
2. 2FA/lockout/session TTL for admin roles — before the first pilot with real
   customer data.
3. Hot standby or a second region once downtime has a dollar figure.
4. External uptime monitoring and alert routing — now.
5. `DealContext` is a single large provider; split by concern (deal terms,
   inventory, lenders, UI state) when a second large screen lands.
6. A 50-state tax engine and TILA disclosure snapshots are product gaps, not
   architecture — but the `saved_deals.calculatedData` snapshot is where a
   signed disclosure will have to live, so keep that snapshot immutable.
