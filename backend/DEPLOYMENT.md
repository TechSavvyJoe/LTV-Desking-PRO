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
fly volumes create ltv_desking_data --size 1 --region ord --snapshot-retention 14
```

### Step 4: Configure R2 before the first boot

`start.sh` fails closed when R2 is not configured. Complete the bucket and
bucket-scoped token setup in [`../docs/runbooks/r2-backup-setup.md`](../docs/runbooks/r2-backup-setup.md),
then set all four Litestream values before deploying:

```bash
: "${R2_ACCOUNT_ID:?set the Cloudflare account ID}"
: "${R2_WRITE_ACCESS_KEY_ID:?set the R2 read/write access key ID}"
: "${R2_WRITE_SECRET_ACCESS_KEY:?set the R2 read/write secret key}"
fly secrets set -a ltv-desking-pro-api \
  LITESTREAM_BUCKET=ltv-desking-pro-backups \
  LITESTREAM_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  LITESTREAM_ACCESS_KEY_ID="$R2_WRITE_ACCESS_KEY_ID" \
  LITESTREAM_SECRET_ACCESS_KEY="$R2_WRITE_SECRET_ACCESS_KEY" \
  ALLOW_NO_BACKUP=0 \
  ALLOW_FRESH_DB=1
```

`ALLOW_FRESH_DB=1` is required only because this brand-new environment has no
database and no R2 generation yet. Do not use it for a restore.

### Step 5: Bootstrap once, then restore fail-closed startup

```bash
fly deploy
curl -fsS https://ltv-desking-pro-api.fly.dev/api/health
fly secrets unset ALLOW_FRESH_DB -a ltv-desking-pro-api
```

The secret removal restarts the machine. Confirm the second boot restores normal
supervised replication and remains healthy before creating production data.

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
| `1747900000_authorization_lifecycle_hardening.js`  | Creates the locked `api_service_accounts` auth collection, adds `active`/`scope`, and grants `scope = "ai_proxy"` only the provider-key operations required by the Vercel AI proxy.                                                                                                                                     |

## AI server architecture

The AI proxy serves `/api/ai/*` and exists in two places:

| Environment               | Where the proxy runs                                | How it gets keys                                                                                                                                        |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local dev (`npm run dev`) | Vite middleware (`server/ai/vitePlugin.ts`)         | `keyResolver.ts` → PB `ai_provider_keys` collection if PB creds are set, else local `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` env vars. |
| Production                | Vercel serverless function at `api/ai/[...path].ts` | Same `keyResolver.ts` → PB. Authenticates through the dedicated `api_service_accounts` auth collection with `scope = "ai_proxy"`.                       |

Both code paths share `server/ai/routes.ts` — the Vercel function is a thin wrapper. Keys live in PB at rest; the proxy reads them per-request (cached 60s).

When `AI_KEYS_MASTER` is set on the Vercel AI proxy, keys are stored as
AES-256-GCM envelopes (`enc:v1:…`) in PocketBase. Dual-read still accepts
legacy plaintext until the next Owner Console write. See
[`../docs/runbooks/secrets-rotation.md`](../docs/runbooks/secrets-rotation.md)
and [`../docs/runbooks/ai-data-retention.md`](../docs/runbooks/ai-data-retention.md).

### Production setup

1. Add at least one provider key in Owner Console → Settings → AI Providers.
   Rotation requires a configured provider so it can prove the deployed Vercel
   function read the PocketBase key through the narrow identity.
2. Configure GitHub Actions secrets `FLY_API_TOKEN`, `VERCEL_TOKEN`,
   `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`.
3. Run `gh workflow run rotate-pb-service-account.yml --ref main`.
4. The workflow creates a new generated, active record in
   `api_service_accounts` with `scope = "ai_proxy"`, stages Vercel without moving production aliases,
   verifies `/api/ai/models`, promotes the deployment, verifies the canonical
   alias, and only then deletes prior `ai_proxy` identities.
5. The workflow maintains these Vercel Project Environment Variables (Production scope):
   - `PB_INTERNAL_URL` = `https://ltv-desking-pro-api.fly.dev`
   - `PB_SERVICE_COLLECTION` = `api_service_accounts`
   - `PB_SERVICE_EMAIL` = the generated narrow record email
   - `PB_SERVICE_PASSWORD` = the generated narrow record password
6. Set `AI_KEYS_MASTER` (64 hex chars from `openssl rand -hex 32`) on Vercel
   Production so new provider-key writes are envelope-encrypted. Re-save each
   key once after enabling the secret.
7. Confirm Anthropic ZDR / Gemini paid-tier retention settings
   ([`../docs/runbooks/ai-data-retention.md`](../docs/runbooks/ai-data-retention.md)).

Never put a `_superusers` credential in Vercel. The rotation's generated
bootstrap superuser exists only long enough to manage the collection and is
deleted in an `always()` cleanup step. The collection and exact
`ai_provider_keys` rules are source controlled by
`1747900000_authorization_lifecycle_hardening.js`; rotation verifies that live
shape and refuses to mint credentials when it has drifted.

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

| File                        | What it does                                                                      |
| --------------------------- | --------------------------------------------------------------------------------- |
| `dealer_guard.pb.js`        | Force-stamps the authenticated dealer on tenant-scoped writes.                    |
| `deal_attribution.pb.js`    | Forces `user` to the auth actor on create; blocks sales re-attribution on update. |
| `users_guard.pb.js`         | Blocks role/dealer escalation and deactivated-user authentication.                |
| `field_visibility.pb.js`    | Removes dealer cost/gross fields from sales-role responses.                       |
| `authorization_rules.pb.js` | Idempotently reasserts the full collection-rule contract (incl. `deal_events`).   |
| `ai_rate_limit.pb.js`       | Atomic cross-instance AI quota endpoint (`/api/ltv/ai-rate-limit`).               |
| `log.pb.js`                 | Structured slow-request and 5xx logging.                                          |

### Single-machine deploy outage window

Production is one Fly machine + one volume. A normal `fly deploy` or secret
restart produces an API outage of roughly **30–90 seconds** while Litestream and
PocketBase come healthy. There is no hot standby. See
[`../docs/runbooks/alerting.md`](../docs/runbooks/alerting.md).

### Fresh-environment caveat for `1747400002_tighten_api_rules.js`

PocketBase v0.26 has an in-process schema cache that doesn't see auth-collection fields added earlier in the same `pocketbase serve` boot. The first time a brand-new PB instance applies the user-fields baseline immediately followed by the rules migration, PB's rule parser will fail with `failed to resolve field "dealer"` even though the field exists in SQLite.

The forward repair migration `1747810006_reassert_dealer_scoped_rules.js`, the
seed helper's second migration pass, and the runtime authorization rule hook
(`pb_hooks/authorization_rules.pb.js`) now close this same-boot gap. The backend deployment workflow boots a fresh database,
verifies every migration and required field, then reboots it to prove idempotency
before Fly deployment.

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
REGION=ord
fly volumes create ltv_desking_data --size 1 --region "$REGION"
```

**"Connection refused"**

- Check if app is running: `fly status`
- Check logs: `fly logs`

**"Database locked"**

- SQLite is single-writer; this is normal during heavy writes
