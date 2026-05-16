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

| File | What it does |
|---|---|
| `1747400000_create_system_settings.js` | Creates the singleton `system_settings` collection used by the Owner Console Settings tab. Public read, superadmin write. Seeds one default row. |
| `1747400001_lender_profiles_enrichment_fields.js` | Adds `website`, `portalUrl`, `generalNotes`, `enrichmentSources` fields to `lender_profiles` so the AI rate-sheet enrichment pipeline can persist its output. |
| `1747400002_tighten_api_rules.js` | Locks every dealer-scoped collection (`dealers`, `inventory`, `lender_profiles`, `saved_deals`, `dealer_settings`, `users`) so users only see their own dealership's data. Superadmin sees everything. |

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
