# LTV Desking PRO

Precision deal structuring, lender intelligence, and desking in one refined workspace.

**LTV Desking PRO** is a retail-finance desking companion for dealership F&I teams. It combines live payment/LTV estimates, explainable deal checks, dealer-supplied lender program extraction and inventory-wide rule matching. The current tax engine models a Michigan dealership; it does not replace a DMS, lender decision, national tax service or contracting platform.

The [launch handoff](docs/LAUNCH_REVIEW_2026-10-08.md) records verified fixes and remaining rollout gates. Nationwide launch readiness has not been established.

## Tech Stack

| Layer        | Technology                                                                |
| ------------ | ------------------------------------------------------------------------- |
| **Frontend** | React 19, TypeScript, Vite                                                |
| **State**    | TanStack React Query, React Context                                       |
| **Backend**  | PocketBase (SQLite) plus local Vite AI API routes                         |
| **AI**       | Server-side OpenAI/ChatGPT, Anthropic Claude, and Google Gemini switching |
| **PDF**      | html2canvas + jsPDF (client-side)                                         |
| **Deploy**   | Vercel (frontend), Fly.io (backend)                                       |

## Features

- **Real-time LTV Calculations** — Front-end LTV, OTD LTV, gross profit, and monthly payments update instantly as deal parameters change
- **Upload rate sheet** — Extract draft tiers and restrictions from dealer-supplied PDFs; source review is required before the program can count as a fit
- **Model Switching** — Choose current top, balanced, and fast OpenAI/ChatGPT, Anthropic, and Gemini models per workflow
- **Multi-Lender Matching** — Compare entered facts with configured lender rules; missing facts, source-review holds and supplied expiration dates can keep a program pending. A fit is not lender approval
- **Deal Structuring Modal** — Full deal worksheet with down payment, trade equity, backend products, and term selection
- **Inventory Management** — Admin-scoped CSV/XLSX import, VIN lookup, explicit new/used/certified condition per VIN, sorting and favorites
- **PDF Deal Sheets** — Download a two-page Letter-size deal jacket with structure, backend products, lender paths, assumptions, and disclosures
- **Multi-Tenant** — PocketBase enforces dealer isolation; superadmins can switch between dealerships
- **Dark Mode** — Full light/dark theme support
- **⌘K Command Palette** — Search saved deals and inventory by customer, stock # or VIN, run actions, and jump to any screen from the keyboard
- **Guided Setup** — A first-run checklist on the desk walks a new dealership through inventory import, lender programs, and its first saved deal

## Quick Start

### Prerequisites

- Node.js 24 LTS
- PocketBase 0.39.6 instance (local or hosted)

### Setup

1. **Clone and install:**

   ```bash
   git clone <repo-url>
   cd LTV-Desking-PRO
   npm install
   ```

2. **Configure environment:**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your keys:

   ```env
   OPENAI_API_KEY="your-openai-key"
   ANTHROPIC_API_KEY="your-anthropic-key"
   GEMINI_API_KEY="your-gemini-key"
   VITE_POCKETBASE_URL="http://localhost:8090"
   ```

3. **Start the backend** (if running locally):

   ```bash
   cd backend
   docker build -t ltv-pb .
   docker run -p 8090:8080 -e ALLOW_NO_BACKUP=1 -v pb_data:/pb/pb_data ltv-pb
   ```

   `ALLOW_NO_BACKUP=1` is for deliberate local development only. Fly production
   requires the four `LITESTREAM_*` R2 settings and refuses to serve without
   supervised replication.

4. **Start the frontend:**
   ```bash
   npm run dev
   ```

## Project Structure

```
├── App.tsx                  # Root routing and authenticated app entry
├── index.tsx                # React entry point
├── types.ts                 # Core domain types (Vehicle, DealData, LenderProfile)
├── constants.ts             # Default data, sample inventory, lender profiles
├── components/
│   ├── auth/                # Login, Register
│   ├── admin/               # Dealer admin and platform owner consoles
│   ├── common/              # Button, Modal, Input, VirtualizedTable, etc.
│   ├── desk/                # Terms rail, inventory grid, deal jacket, PDF modal
│   ├── legal/               # Privacy and terms drafts for counsel review
│   ├── pdf/                 # Two-page deal sheet and supporting PDF templates
│   ├── screens/             # Desk-adjacent route screens
│   └── shell/               # Responsive navigation and dealer switcher
├── context/
│   └── DealContext.tsx      # Global state: inventory, deals, settings
├── hooks/                   # useDebounce, useLocalStorage, useTheme, etc.
├── lib/
│   ├── aiModelRegistry.ts   # Current provider/model catalog and defaults
│   ├── api.ts               # PocketBase CRUD operations
│   ├── auth.ts              # Login, register, password reset
│   ├── confirm.ts           # App-native confirmation dialog bridge
│   ├── pocketbase.ts        # PocketBase client & types
│   ├── queryClient.ts       # TanStack Query configuration
│   └── toast.ts             # Global toast notification system
├── server/
│   └── ai/                  # Local /api/ai routes, provider clients, tests
├── services/
│   ├── aiProcessor.ts       # Browser client for local server-side AI routes
│   ├── calculator.ts        # Financial calculations engine
│   ├── lenderMatcher.ts     # Lender eligibility matching
│   ├── pdfGenerator.ts      # PDF generation
│   └── validator.ts         # Input validation
├── backend/
│   ├── Dockerfile           # Pinned PocketBase + Litestream container
│   ├── fly.toml             # Fly.io backend deployment
│   ├── pb_hooks/            # Tenant, user, visibility, logging, and rule guards
│   └── pb_migrations/       # Database schema migrations
├── playwright.config.ts     # Playwright e2e config (webServer + chromium)
├── tests/
│   ├── e2e/                 # Full-stack Chromium workflow coverage
│   └── helpers/             # Fresh PocketBase seed/runtime harness
└── vite.config.ts           # Vite build config with chunking strategy
```

## Scripts

| Command                 | Description                       |
| ----------------------- | --------------------------------- |
| `npm run dev`           | Start development server          |
| `npm run build`         | Production build                  |
| `npm run preview`       | Preview production build locally  |
| `npm run lint`          | ESLint baseline                   |
| `npm run format:check`  | Prettier format check             |
| `npm run type-check`    | TypeScript strict check           |
| `npm test -- --run`     | Run unit test suite (vitest)      |
| `npm run test:coverage` | Run tests + coverage report       |
| `npm run test:e2e`      | Run Playwright E2E tests          |
| `npm run audit`         | Run npm audit (moderate severity) |

## Testing & Ops Hygiene

- Unit tests: `services/*.test.ts`, `lib/*.test.ts`, security/edge suites.
- E2E: `tests/e2e/auth.spec.ts` (desk, auth, inventory import, AI lender, deal save, lender match, PDF); `playwright.config.ts` with webServer. Runs in CI.
- Coverage: `npm run test:coverage` (v8 + thresholds configured; artifact in CI).
- Audit: `npm run audit` + dedicated CI step. Current status (2026-09-18, see docs/runbooks/secrets-rotation.md): `npm audit` reports **0 vulnerabilities at every severity** after the vitest 4→5 upgrade (the last open advisories were dev-only in the vitest/mocker chain). CI includes a dry-run audit-fix report; re-verify after any dependency change.
- Model governance: [`docs/MODEL_CARD.md`](docs/MODEL_CARD.md) documents the `rules-v1` twelve-check readiness assessment, denominators, private-input boundaries and estimate limitations. Legacy approval heuristics remain uncalibrated compatibility fields. Update the card when the assessment or matching rules change.
- Accessibility: [`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md) is the WCAG 2.2 AA conformance summary; `tests/e2e/a11y.spec.ts` runs axe-core on every pull request into `main` and on pushes to `main`, and fails the build on serious/critical violations (on other branch pushes the e2e/axe steps are skipped).
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components, data model, tenant/field-confidentiality model and its known debt, recovery posture, scale limits, and the decisions to revisit.
- CI (`.github/workflows/check.yml`): type/lint/test/coverage (v8 + thresholds + artifact)/audit + e2e (Playwright + report artifact) on every PR. Enhanced coverage + e2e hygiene.
- Runbooks: see `docs/runbooks/README.md` (expanded index: breach response, dealer offboarding, plus quarterly dep audit notes). PostHog (deal_saved / lender_matched / pdf_generated / inventory_uploaded / sample_loaded + identify) + Sentry wired and gated.

## Deployment

- **Frontend**: `.github/workflows/deploy-vercel.yml` builds once and deploys a
  prebuilt artifact to Vercel. Automatic `main` Git deploys are disabled in
  `vercel.json` to prevent racing production aliases; branch previews remain on.
- **Backend**: `.github/workflows/deploy-backend-fly.yml` validates a fresh
  migration boot, snapshots the Fly volume, deploys, and verifies health plus
  supervised Litestream startup.

## License

Proprietary — All rights reserved.
