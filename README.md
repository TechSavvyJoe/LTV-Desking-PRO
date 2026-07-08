# LTV & Desking Pro

Precision deal structuring, lender intelligence, and desking in one refined workspace.

**LTV & Desking Pro** is a full-stack automotive finance management platform built for dealership F&I teams. It combines real-time LTV calculations, AI-powered lender rate sheet extraction, and multi-lender eligibility matching into a single, fast workspace.

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
- **AI Lender Upload** — Upload PDF rate sheets and the selected server-side model extracts lender tiers, LTV limits, FICO ranges, and restrictions
- **Model Switching** — Choose current top, balanced, and fast OpenAI/ChatGPT, Anthropic, and Gemini models per workflow
- **Multi-Lender Matching** — See which lenders approve a deal based on credit score, income, vehicle age, and mileage
- **Deal Structuring Modal** — Full deal worksheet with down payment, trade equity, backend products, and term selection
- **Inventory Management** — CSV import, VIN lookup, inline editing, and favorites tracking
- **PDF Deal Sheets** — Generate branded deal summaries for customers or lender submissions
- **Multi-Tenant** — PocketBase enforces dealer isolation; superadmins can switch between dealerships
- **Dark Mode** — Full light/dark theme support

## Quick Start

### Prerequisites

- Node.js 20+
- PocketBase instance (local or hosted)

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
   docker run -p 8090:8080 -v pb_data:/pb/pb_data ltv-pb
   ```

4. **Start the frontend:**
   ```bash
   npm run dev
   ```

## Project Structure

```
├── App.tsx                  # Root application with tab routing
├── index.tsx                # React entry point
├── types.ts                 # Core domain types (Vehicle, DealData, LenderProfile)
├── constants.ts             # Default data, sample inventory, lender profiles
├── components/
│   ├── auth/                # Login, Register
│   ├── admin/               # SuperAdmin dashboard
│   ├── common/              # Button, Modal, Input, VirtualizedTable, etc.
│   ├── pdf/                 # PDF templates for deal sheets
│   ├── DealControls.tsx     # Customer info & deal structure inputs
│   ├── DealStructuringModal.tsx
│   ├── FavoritesTable.tsx   # Favorites with inline editing & lender matching
│   ├── Header.tsx           # App header with dealer switcher
│   └── InventoryTable.tsx   # Main inventory grid
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
│   ├── Dockerfile           # PocketBase server container
│   ├── fly.toml             # Fly.io backend deployment
│   └── pb_migrations/       # Database schema migrations
├── playwright.config.ts     # Playwright e2e config (webServer + chromium)
├── tests/
│   └── e2e/                 # Minimal e2e skeleton (auth.spec.ts)
└── vite.config.ts           # Vite build config with chunking strategy
```

## Scripts

| Command                 | Description                         |
| ----------------------- | ----------------------------------- |
| `npm run dev`           | Start development server            |
| `npm run build`         | Production build                    |
| `npm run preview`       | Preview production build locally    |
| `npm run lint`          | ESLint baseline                     |
| `npm run format:check`  | Prettier format check               |
| `npm run type-check`    | TypeScript strict check             |
| `npm test -- --run`     | Run unit test suite (vitest)        |
| `npm run test:coverage` | Run tests + coverage report         |
| `npm run test:e2e`      | Run Playwright E2E tests (skeleton) |
| `npm run audit`         | Run npm audit (moderate severity)   |

## Testing & Ops Hygiene

- Unit tests: `services/*.test.ts`, `lib/*.test.ts`, security/edge suites.
- E2E: `tests/e2e/auth.spec.ts` (desk, auth, inventory import, AI lender, deal save, lender match, PDF); `playwright.config.ts` with webServer. Runs in CI.
- Coverage: `npm run test:coverage` (v8 + thresholds configured; artifact in CI).
- Audit: `npm run audit` + dedicated CI step. Current status (see docs/runbooks/secrets-rotation.md): safe `npm audit fix` applied; `npm audit --audit-level=moderate` reports 0 vulnerabilities. CI includes a dry-run audit-fix report.
- CI (`.github/workflows/check.yml`): type/lint/test/coverage (v8 + thresholds + artifact)/audit + e2e (Playwright + report artifact) on every PR. Enhanced coverage + e2e hygiene.
- Runbooks: see `docs/runbooks/README.md` (expanded index: breach response, dealer offboarding, plus quarterly dep audit notes). PostHog (deal_saved / lender_matched / pdf_generated / inventory_uploaded / sample_loaded + identify) + Sentry wired and gated.

## Deployment

- **Frontend**: Deploy to Vercel — `vercel.json` handles SPA routing
- **Backend**: Deploy to Fly.io — `cd backend && fly deploy`

## License

Proprietary — All rights reserved.
