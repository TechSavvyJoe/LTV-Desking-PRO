# LTV Desking PRO Backend Deployment Guide

## Prerequisites

1. **Fly.io CLI** - Install with:

   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Fly.io Account** - Sign up at https://fly.io

3. **GitHub Repository** - Ensure your code is pushed to GitHub

---

## Initial Deployment

### Step 1: Authenticate with Fly.io

```bash
fly auth login
```

### Step 2: Create the Fly.io App

```bash
cd backend
fly launch --no-deploy
```

- App name: `ltv-desking-pro-api`
- Region: `ord` (Chicago) or your preferred region
- Don't deploy yet when prompted

### Step 3: Create Persistent Volume

```bash
fly volumes create ltv_desking_data --size 1 --region ord
```

### Step 4: Deploy

```bash
fly deploy
```

---

## Environment Setup

### Set GitHub Secrets

In your GitHub repository settings, add these secrets:

1. `FLY_API_TOKEN` - Get from: `fly tokens create deploy`

### Set GitHub Variables

Add these variables:

1. `POCKETBASE_URL` - Your Fly.io app URL (e.g., `https://ltv-desking-pro-api.fly.dev`)

---

## Post-Deployment Setup

### 1. Access PocketBase Admin

Visit: `https://ltv-desking-pro-api.fly.dev/_/`

Create your admin account on first access.

### 2. Create First Dealer

In PocketBase Admin:

1. Go to Collections → dealers
2. Create a new record:
   - name: "Demo Dealership"
   - code: "DEMO001"
   - active: true

### 3. Create First User

1. Go to Collections → users
2. Create admin user linked to dealer

---

## Applying Migrations

PocketBase auto-runs any JS file in `pb_migrations/` on boot. Migrations are tracked in PocketBase's internal `_migrations` table — each file runs exactly once.

After committing new migrations, redeploy the backend:

```bash
cd backend
fly deploy
```

Watch the logs to confirm migrations applied:

```bash
fly logs -a ltv-desking-pro-api
```

You should see lines like `Applied X.js`. If a migration fails, PocketBase aborts startup — fix the file and redeploy.

Current migrations in this repo:

| File                                               | What it does                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1746999000`-`1746999005` baselines                | Idempotent baseline migrations for `dealers`, `users` (field additions), `inventory`, `lender_profiles` (pre-enrichment), `saved_deals`, `dealer_settings`. Skip if the target collection already exists (production case); create from scratch on a fresh DB (CI case). Lets CI reproduce production schema from zero. |
| `1747400000_create_system_settings.js`             | Creates the singleton `system_settings` collection used by the Owner Console Settings tab. Public read, superadmin write. Seeds one default row.                                                                                                                                                                        |
| `1747400001_lender_profiles_enrichment_fields.js`  | Adds `website`, `portalUrl`, `generalNotes`, `enrichmentSources` fields to `lender_profiles` so the AI rate-sheet enrichment pipeline can persist its output.                                                                                                                                                           |
| `1747400002_tighten_api_rules.js`                  | Locks every dealer-scoped collection (`dealers`, `inventory`, `lender_profiles`, `saved_deals`, `dealer_settings`, `users`) so users only see their own dealership's data. Superadmin sees everything.                                                                                                                  |
| `1747500000_backfill_email_visibility.js`          | Flips `emailVisibility=true` on every existing user record so the Owner Console can see emails. PB auth collections hide email by default.                                                                                                                                                                              |
| `1747600000_create_ai_provider_keys.js`            | Creates the singleton `ai_provider_keys` collection (superadmin-only RBAC). Stores OpenAI / Anthropic / Gemini keys edited from the Owner Console.                                                                                                                                                                      |
| `1747600001_add_ai_defaults_to_system_settings.js` | Adds `aiDefaults` (default provider + per-task model) to `system_settings`.                                                                                                                                                                                                                                             |
| `1747600002_create_audit_log.js`                   | Creates append-only `audit_log` collection. Records every AI key update, removal, and test attempt (actor, action, target, details). Superadmin-only read.                                                                                                                                                              |
| `1747810006_reassert_dealer_scoped_rules.js`       | Repairs missing dealer-scoped fields and reasserts PocketBase 0.26-compatible rules for dealer data, deals, and users.                                                                                                                                                                                                  |
| `1747810007_seed_empty_dealer_samples.js`          | Initializes only empty dealer tenants with 35 sample vehicles, 13 illustrative lender profiles, and desk defaults. Existing inventory, lender programs, and settings are never modified.                                                                                                                                |

## AI server architecture

The AI proxy serves `/api/ai/*` and exists in two places:

| Environment               | Where the proxy runs                                | How it gets keys                                                                                                                                        |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local dev (`npm run dev`) | Vite middleware (`server/ai/vitePlugin.ts`)         | `keyResolver.ts` → PB `ai_provider_keys` collection if PB creds are set, else local `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` env vars. |
| Production                | Vercel serverless function at `api/ai/[...path].ts` | Same `keyResolver.ts` → PB. Authenticates to PB using a `_superusers` account via `PB_SERVICE_EMAIL` / `PB_SERVICE_PASSWORD` env vars on Vercel.        |

Both code paths share `server/ai/routes.ts` — the Vercel function is a thin wrapper. Keys live in PB at rest; the proxy reads them per-request (cached 60s).

### Production setup

1. Create a PocketBase `_superusers` row that the AI proxy will use:
   - PB Admin UI → `_superusers` → New
   - Set a strong password
2. On Vercel, set the following Project Environment Variables (Production scope):
   - `PB_INTERNAL_URL` = `https://ltv-desking-pro-api.fly.dev`
   - `PB_SERVICE_EMAIL` = the superuser email above
   - `PB_SERVICE_PASSWORD` = the superuser password
3. Deploy the frontend. Vercel will auto-build `api/ai/[...path].ts` as a Node serverless function.
4. In the Owner Console → Settings → AI Providers, add provider keys. Click **Test** on each to verify the key works against the provider.

### Request size limit (Vercel)

Vercel Node functions cap the request body at ~4.5 MB. Lender PDFs above ~3 MB (base64 expands ~33%) will fail the lender-extract route with HTTP 413.

If you hit this:

1. **Compress the PDF client-side first** — most rate sheets compress 60-80% via a single Ghostscript pass; could be wired into `AiLenderManagerModal.tsx`.
2. **Direct upload to Vercel Blob, then pass a URL** — function downloads the file server-side, bypassing the request-body cap. Requires the `@vercel/blob` package + signed-upload endpoint.
3. **Run the AI proxy as a Fly sidecar** — no platform body cap. Bigger lift; only worth it if (1) and (2) aren't enough.

### Function timeout

`api/ai/[...path].ts` sets `maxDuration: 300` (Fluid Compute default). Lender extract with Gemini grounding can take 60-120 s on large PDFs; this leaves headroom. Hobby plan tops out at 60s — production must be on Pro or higher.

### Authentication

Every `/api/ai/*` request except `GET /api/ai/models` requires a PocketBase bearer token in `Authorization: Bearer <token>`. The frontend's `services/aiProcessor.ts` attaches it automatically from `pb.authStore.token`. `/api/ai/test-key` additionally requires `role = "superadmin"`. Auth is validated via `pb.collection("users").authRefresh()` on every request (no caching — revocation must be honored).

## PocketBase hooks

JS hook files in `backend/pb_hooks/` are loaded by PocketBase on boot. Current hooks:

| File                 | What it does                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dealer_guard.pb.js` | Defense-in-depth on writes. On every create/update of an `inventory`, `lender_profiles`, `saved_deals`, or `dealer_settings` record, the `dealer` field is overwritten with the auth user's `dealer`. Superadmins are exempt. Closes the gap where the read-side RBAC rules block cross-dealer reads but write rules trusted client-supplied `dealer` values. |

### Fresh-environment caveat for `1747400002_tighten_api_rules.js`

PocketBase v0.26 has an in-process schema cache that doesn't see auth-collection fields added earlier in the same `pocketbase serve` boot. The first time a brand-new PB instance applies the user-fields baseline immediately followed by the rules migration, PB's rule parser will fail with `failed to resolve field "dealer"` even though the field exists in SQLite.

To work around this, `1747400002_tighten_api_rules.js` skips itself when no `dealers` records exist (fresh-DB signal). If you ever bootstrap a new environment:

1. Let the baseline migrations run on first boot.
2. Seed at least one dealer record (e.g., create one through the PB Admin UI or via the app's onboarding wizard once a superadmin is set up).
3. Restart PB. On the second boot, the rules migration will re-evaluate — but because it's already recorded in `_migrations`, it won't re-run. Manually apply the per-dealer rules through the PB Admin UI on each collection, OR temporarily clear the `_migrations` row for it and restart.

Production was unaffected because the rules migration was deployed in a separate Fly release than the user-fields setup, so PB had restarted in between.

## Database Schema

| Collection      | Purpose                               |
| --------------- | ------------------------------------- |
| dealers         | Multi-tenant dealer organizations     |
| users           | User accounts with dealer association |
| inventory       | Vehicle inventory per dealer          |
| lender_profiles | Lender configurations per dealer      |
| saved_deals     | Structured deals per dealer           |
| dealer_settings | Dealer-specific settings              |

---

## Multi-Dealer Architecture

```
Dealer A (DEALER_A_CODE)
├── Users (sales, managers, admin)
├── Inventory
├── Lender Profiles
├── Saved Deals
└── Settings

Dealer B (DEALER_B_CODE)
├── Users (sales, managers, admin)
├── Inventory
├── Lender Profiles
├── Saved Deals
└── Settings
```

All data is isolated by dealer. Users can only see data for their dealer.

---

## Useful Commands

```bash
# View logs
fly logs

# SSH into container
fly ssh console

# Scale up
fly scale memory 1024

# Check status
fly status
```

---

## Troubleshooting

**"Volume not found"**

```bash
fly volumes list
fly volumes create ltv_desking_data --size 1 --region <your-region>
```

**"Connection refused"**

- Check if app is running: `fly status`
- Check logs: `fly logs`

**"Database locked"**

- SQLite is single-writer; this is normal during heavy writes
