# LTV & Desking Pro

Precision deal structuring, lender intelligence, and desking in one refined workspace.

**LTV & Desking Pro** is a full-stack automotive finance management platform built for dealership F&I teams. It combines real-time LTV calculations, AI-powered lender rate sheet extraction, and multi-lender eligibility matching into a single, fast workspace.

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite |
| **State** | TanStack React Query, React Context |
| **Backend** | PocketBase (SQLite) on Fly.io |
| **AI** | Google Gemini (rate sheet extraction), Perplexity Sonar (lender research) |
| **PDF** | html2canvas + jsPDF (client-side) |
| **Deploy** | Vercel (frontend), Fly.io (backend) |

## Features

- **Real-time LTV Calculations** — Front-end LTV, OTD LTV, gross profit, and monthly payments update instantly as deal parameters change
- **AI Lender Upload** — Upload PDF rate sheets and Gemini extracts all lender tiers, LTV limits, FICO ranges, and restrictions
- **Multi-Lender Matching** — See which lenders approve a deal based on credit score, income, vehicle age, and mileage
- **Deal Structuring Modal** — Full deal worksheet with down payment, trade equity, backend products, and term selection
- **Inventory Management** — CSV import, VIN lookup, inline editing, and favorites tracking
- **PDF Deal Sheets** — Generate branded deal summaries for customers or lender submissions
- **Multi-Tenant** — PocketBase enforces dealer isolation; superadmins can switch between dealerships
- **Dark Mode** — Full light/dark theme support

## Quick Start

### Prerequisites

- Node.js 18+
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
   VITE_GEMINI_API_KEY="your-gemini-key"
   VITE_POCKETBASE_URL="http://localhost:8090"
   VITE_PERPLEXITY_API_KEY="your-perplexity-key"  # Optional
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
│   ├── api.ts               # PocketBase CRUD operations
│   ├── auth.ts              # Login, register, password reset
│   ├── pocketbase.ts        # PocketBase client & types
│   ├── queryClient.ts       # TanStack Query configuration
│   └── toast.ts             # Global toast notification system
├── services/
│   ├── aiProcessor.ts       # Gemini & Perplexity lender extraction
│   ├── calculator.ts        # Financial calculations engine
│   ├── lenderMatcher.ts     # Lender eligibility matching
│   ├── pdfGenerator.ts      # PDF generation
│   └── validator.ts         # Input validation
├── backend/
│   ├── Dockerfile           # PocketBase server container
│   ├── fly.toml             # Fly.io backend deployment
│   └── pb_migrations/       # Database schema migrations
└── vite.config.ts           # Vite build config with chunking strategy
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run type-check` | TypeScript strict check |
| `npx vitest run` | Run test suite |

## Deployment

- **Frontend**: Deploy to Vercel — `vercel.json` handles SPA routing
- **Backend**: Deploy to Fly.io — `cd backend && fly deploy`

## License

Proprietary — All rights reserved.
