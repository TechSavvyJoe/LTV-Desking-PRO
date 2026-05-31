# LTV Desking PRO — UI Redesign Brief

**Audience:** AI coding agent (Claude Code, Cursor, Antigravity, GPT-5, etc.) tasked with executing a visual identity refactor on this codebase.

**Goal:** Refactor the visual layer of the entire application from "consumer tech startup" (saturated gradients, glassmorphism, bouncy hover transforms, rounded-xl/2xl everywhere) to **"what Tekion would build if they hired a Stripe designer"** — institutional, restrained, dealership-grade F&I software.

**Scope:** Tailwind classes, CSS tokens, and small component-internal Tailwind class swaps. **No functional changes. No prop-API changes. No new dependencies.** Component call sites stay identical.

**Estimated effort:** ~8 hours of focused work for an AI agent with file access.

---

## Section 1 — Product context

**LTV Desking PRO** is automotive dealership F&I (finance & insurance) software. End users are:

- **Dealership owners / GMs** — viewing aggregate metrics, managing users, configuring system settings
- **F&I managers** — structuring deals, matching lenders, calculating payments, generating deal sheets
- **Salespeople** — viewing inventory, running quick LTV / payment calculations

Demographic skew: 35–65 years old, often non-technical, sitting across desks from customers signing $30K+ contracts. **The visual language must signal "trustworthy financial tool" — closer to a CPA's office or a private bank UI than a Discord-style consumer app.**

**Stack:**

- React 19 + Vite + TypeScript (`strict` + `noUncheckedIndexedAccess`)
- Tailwind CSS v4 (`@import "tailwindcss"` syntax)
- react-router-dom v7
- @tanstack/react-query
- PocketBase backend (live at `https://ltv-desking-pro-api.fly.dev`)
- Vercel for frontend + serverless `/api/ai/*` functions

**Live URL:** `https://ltvdeskingpro.vercel.app`

---

## Section 2 — Competitor reference targets

Look at these for the right aesthetic; they are the bar this redesign should clear:

| Tool                             | Why it's a reference                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tekion**                       | The "modern dealership SaaS." Navy + white, one orange accent, no gradients, dense tables. The closest direct competitor.                               |
| **CDK Drive / Reynolds**         | The incumbent enterprise DMS. Even more conservative — corporate navy, gray, white. The "trusted boring" end of the spectrum.                           |
| **Dealertrack (Cox Automotive)** | Conservative blue/white. Status-only color (green/amber/red).                                                                                           |
| **Plaid Admin**                  | The modern reference for "institutional but polished" — solid navy, white surfaces, status colors used only where state matters, restrained typography. |
| **Stripe Dashboard (pre-2023)**  | The "discipline" target — one strong primary color, no gradients on functional elements, sentence-case everywhere, dense data UI.                       |

**Anti-references (NOT what we want):** Linear, Vercel dashboard, Notion, Discord, any consumer-tech-app gradient + glassmorphism aesthetic.

---

## Section 3 — Current state inventory

### What works (do not change)

- **Information architecture** — Owner Console has Overview / Dealers / Users / Settings tabs. Dealer view has Inventory / Lender Programs / Saved Deals / Finance Tools tabs. Both are correct.
- **Numbered section headers** (1 Customer & Deal Info, 2 Global Deal Structure) — the concept is good, only the colored-circle styling is wrong.
- **Click-to-copy on every numeric cell** in inventory tables — power-user-grade detail. Preserve.
- **Impersonation flow** — "Viewing as Bob Maxey Ford" banner with "Exit impersonation" button is excellent UX. Preserve the function, change the visual treatment.
- **13-column inventory table** — Year, Make, Model, Stock #, Miles, Price, Book (Trade), Front LTV, Front Gross, Amt to Fin, OTD LTV, Payment, VIN. F&I-correct.
- **Pagination controls** — Rows: 15/25/50/100/All, Previous/Next, jump-to-page.
- **Footer** with Privacy / Terms / Support links and copyright.
- **Skip-nav link**, aria-live toasts, tabular numerals (`.financial-cell` utility class) — keep all a11y.
- **`<DataLoading>` / `<DataError>` / `<EmptyState>` primitives** in `components/common/states.tsx` — they exist; just wire them into views that show bare zeros today (Lender Programs 0, Saved Deals 0).

### What's currently shipped backend-side (do not touch, do not duplicate)

- AI proxy at `api/ai/[...path].ts` — works, do not modify.
- `pb_hooks/dealer_guard.pb.js` — write-time RBAC defense in depth.
- `audit_log` collection — append-only superadmin reads, used by AI Provider key management.
- `ai_provider_keys` collection — superadmin-only, keys live here, fetched per-request via `server/ai/keyResolver.ts` with 60s cache.
- Litestream + R2 backups wired in CI.
- Sentry frontend errors, password policy + haveibeenpwned, `pb.filter()` for safe queries.
- `validate-migrations` job in `.github/workflows/deploy-backend-fly.yml` — boots ephemeral PB on every backend push.

---

## Section 4 — The diagnosis: eleven "tech-startup tells" present in the codebase

Each is grounded in a specific file + line. The redesign must address every one.

### 1. Three-stop gradients on the primary button

**File:** `components/common/Button.tsx`

```tsx
// Current primary variant:
"bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600
 text-white shadow-md shadow-blue-500/20
 hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5
 active:scale-[0.98]
 before:absolute before:inset-0 before:rounded-[inherit]
 before:bg-gradient-to-b before:from-white/15 before:to-transparent"
```

**Five distinct effects stacked on one button:** gradient + colored shadow glow + lift on hover + press bounce + glass-shine overlay. Each individually feels modern; together they read as consumer app.

### 2. Glassmorphism inputs

**File:** `components/common/Input.tsx`

```tsx
"border-[1.5px] rounded-xl       // 12px corners + non-standard 1.5px border
 bg-white dark:bg-slate-800/80"  // 80%-opacity dark bg = glassmorphism
```

`rounded-xl` (12px) reads as iPhone consumer app. Dealer software uses 4–6px corners and 1px borders.

### 3. Amber-yellow favorite hover + blue-indigo "Structure Deal"

**File:** `components/InventoryTable.tsx` (~line 114, 133)

```tsx
// Favorite (star) button hover:
"hover:bg-gradient-to-br hover:from-amber-50 hover:to-yellow-50
 dark:hover:from-amber-900/20 dark:hover:to-yellow-900/20
 rounded-lg transition-all duration-200 hover:scale-105"

// Structure Deal button:
"bg-gradient-to-r from-blue-500 to-indigo-500
 hover:from-blue-600 hover:to-indigo-600
 rounded-lg shadow-sm hover:shadow-md hover:scale-105"
```

Amber-yellow gradient + scale bounce on a single-character star icon. Blue-indigo gradient + scale bounce on the row's primary action.

### 4. KPI cards with rainbow gradient strips

**File:** `components/admin/SuperAdminDashboard.tsx` (~line 83–98)

```tsx
"relative overflow-hidden bg-slate-900/80 border border-slate-800
 rounded-2xl p-5 shadow-lg hover:border-slate-700 transition-colors"

// Top-edge stripe per card, in different colors:
<div className={`absolute top-0 left-4 right-4 h-px bg-gradient-to-r ${a.stripe}`} />

// Icon background pill:
<div className={`w-11 h-11 rounded-xl flex items-center justify-center ${a.iconBg}`}>
```

Four KPI cards each with a different-colored gradient strip on top (blue / green / purple / orange) → reads as rainbow.

### 5. Blue→violet onboard-dealer modal icon

**File:** `components/admin/SuperAdminDashboard.tsx` (~line 371–374)

```tsx
<div className="w-full max-w-2xl bg-slate-900 ring-1 ring-slate-800 rounded-2xl shadow-2xl overflow-hidden">
  <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4
                  bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950/40">
    <div className="w-9 h-9 rounded-xl
                    bg-gradient-to-br from-blue-500 to-violet-500
                    flex items-center justify-center ring-1 ring-white/10
                    shadow-lg shadow-blue-500/20">
```

**Blue→violet** on a dealership-onboarding modal is the single most off-brand decision in the codebase. Modal header also has a gradient.

### 6. Settings modal: nested cards

**File:** `components/SettingsModal.tsx`

Modal: `rounded-2xl` (16px corners) + `backdrop-blur-sm`. Each settings section is its own bordered card → **three nested levels of containment** (modal → section card → field group). Decorative containment, no hierarchy benefit.

### 7. Saturated purple impersonation banner

**File:** `App.tsx` (search for "Viewing as")

Current: `bg-gradient-to-r from-purple-600 to-violet-600`. Reads as a "celebration" banner, not a "you are impersonating, be careful" system message.

### 8. Three competing palettes coexist

- `tailwind.config.ts` — Twitter X-clone palette (`x-black`, `x-blue`, `x-text-primary`, `x-text-secondary`)
- `index.css` `:root` block — `--color-primary-50` through `--color-primary-900` (blues), plus gradients, glassmorphism vars, "Apple-style" shadows
- Individual components — hardcoded Tailwind utilities like `from-blue-500 to-indigo-600`, `bg-violet-500`, `text-emerald-400`

None of these talk to each other. The Tailwind config tokens are dead weight (Twitter palette is unused in components); the CSS-var tokens are defined but rarely referenced by components; and components freely use raw Tailwind colors.

### 9. ALL-CAPS tracking labels

Throughout SuperAdminDashboard (`TOTAL DEALERS`, `ACTIVE DEALERS`, `TOTAL USERS`, `TOTAL DEALS`, `QUICK ACTIONS`) and InventoryTable (`STOCK #`, `MILES`, `PRICE`, `BOOK (TRADE)`, etc.).

This is 2018-era SaaS dashboard styling. Modern professional UI uses sentence-case ("Total dealers", "Stock #").

### 10. Multi-color avatar gradients

**File:** `components/admin/SuperAdminDashboard.tsx`

Avatar circles with gradient fills (blue → purple, etc.). Should be solid muted slate with white initials.

### 11. Numbered section badges in saturated colors

**File:** `App.tsx` (the "1" and "2" before "Customer & Deal Info" and "Global Deal Structure")

Solid blue / green colored circles, ~28px. Reads as textbook/tutorial UI, not professional tool.

---

## Section 5 — The "Dealer Trust" design language

Decisions locked in by stakeholder:

- **Light mode is the default surface.** Dark mode stays as a toggle for users who prefer it.
- **Brand palette: navy primary + one muted accent.** No purples, no violets, no indigos. One amber for warnings only.

### Section 5.1 — Design tokens

Replace the `:root` and `.dark` blocks in `index.css` with this. **Do not preserve the existing `--gradient-*` or `--glass-*` tokens** — they're symptoms of the old aesthetic.

```css
:root {
  /* Surfaces */
  --color-bg: #ffffff;
  --color-bg-subtle: #f8fafc; /* slate-50  — cards, panels */
  --color-bg-muted: #f1f5f9; /* slate-100 — hover / nested */
  --color-border: #e2e8f0; /* slate-200 */
  --color-border-strong: #cbd5e1; /* slate-300 */

  /* Text */
  --color-text: #0f172a; /* slate-900 */
  --color-text-muted: #475569; /* slate-600 */
  --color-text-subtle: #94a3b8; /* slate-400 */

  /* Brand — ONE navy, no purples or violets */
  --color-primary: #1e40af; /* blue-800 — actions, links, focus */
  --color-primary-hover: #1e3a8a; /* blue-900 */
  --color-primary-subtle: #dbeafe; /* blue-100 — selected row bg, focus tint */

  /* Accent — one muted steel-blue for secondary actions */
  --color-accent: #475569; /* slate-600 */
  --color-accent-hover: #334155; /* slate-700 */
  --color-accent-subtle: #e2e8f0; /* slate-200 */

  /* Status — used SPARINGLY, only where state must be communicated */
  --color-success: #15803d; /* green-700 */
  --color-success-subtle: #dcfce7; /* green-100 */
  --color-warning: #b45309; /* amber-700 */
  --color-warning-subtle: #fef3c7; /* amber-100 */
  --color-danger: #b91c1c; /* red-700 */
  --color-danger-subtle: #fee2e2; /* red-100 */

  /* Geometry — tighter corners */
  --radius-sm: 4px; /* badges, pills */
  --radius: 6px; /* inputs, buttons */
  --radius-md: 8px; /* cards, KPI tiles */
  --radius-lg: 10px; /* modals */

  /* Shadows — neutral, no colored glows */
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow: 0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-md: 0 4px 8px -2px rgba(15, 23, 42, 0.08);

  /* Motion — short, color-only transitions */
  --duration-fast: 120ms;
  --duration: 180ms;
}

.dark {
  --color-bg: #0f172a; /* slate-900 */
  --color-bg-subtle: #1e293b; /* slate-800 */
  --color-bg-muted: #334155; /* slate-700 */
  --color-border: #334155; /* slate-700 */
  --color-border-strong: #475569; /* slate-600 */

  --color-text: #f1f5f9; /* slate-100 */
  --color-text-muted: #94a3b8; /* slate-400 */
  --color-text-subtle: #64748b; /* slate-500 */

  --color-primary: #3b82f6; /* blue-500 — slightly lighter for dark bg */
  --color-primary-hover: #60a5fa; /* blue-400 */
  --color-primary-subtle: #1e3a8a; /* blue-900 */

  --color-accent: #94a3b8; /* slate-400 */
  --color-accent-hover: #cbd5e1; /* slate-300 */
  --color-accent-subtle: #334155; /* slate-700 */

  --color-success: #4ade80; /* green-400 */
  --color-success-subtle: #14532d; /* green-900 */
  --color-warning: #fbbf24; /* amber-400 */
  --color-warning-subtle: #78350f; /* amber-900 */
  --color-danger: #f87171; /* red-400 */
  --color-danger-subtle: #7f1d1d; /* red-900 */
}
```

### Section 5.2 — Rules

1. **Zero gradients in tokens.** If any token needs a `linear-gradient`, you've defined the wrong token.
2. **Zero purple/violet/indigo/teal/cyan.** The only brand color is navy. The only secondary is muted slate.
3. **One amber.** Reserved for `--color-warning` and the impersonation banner stripe. Never decorative.
4. **No backdrop-blur on functional surfaces.** Modals, cards, panels — all opaque.
5. **No colored shadow glows.** Shadows are neutral slate alpha only.
6. **No hover transforms.** No `scale-105`, no `translate-y-*`. Hover changes background or border color, nothing else.

### Section 5.3 — Typography scale

Use Tailwind's existing scale, just apply these patterns consistently:

| Use case             | Class                                                            | Notes                                 |
| -------------------- | ---------------------------------------------------------------- | ------------------------------------- |
| Page title (h1)      | `text-2xl font-semibold tracking-tight text-[var(--color-text)]` | One per page                          |
| Section heading (h2) | `text-lg font-semibold text-[var(--color-text)]`                 | Sentence case                         |
| Subsection (h3)      | `text-sm font-semibold text-[var(--color-text)]`                 | Sentence case                         |
| Card label           | `text-xs font-medium text-[var(--color-text-muted)]`             | Sentence case, NOT uppercase tracking |
| KPI value            | `text-3xl font-semibold tabular-nums text-[var(--color-text)]`   |                                       |
| Body                 | `text-sm text-[var(--color-text)]`                               | Default                               |
| Muted body           | `text-sm text-[var(--color-text-muted)]`                         | Secondary info                        |
| Caption              | `text-xs text-[var(--color-text-subtle)]`                        | Timestamps, hints                     |
| Financial cell       | `text-sm tabular-nums`                                           | All numeric table cells               |

**Rule:** every label and heading is sentence-case ("Total dealers", "Stock #"). Find every instance of `uppercase tracking-wider` in the codebase and convert.

---

## Section 6 — Component specs

### 6.1 — `components/common/Button.tsx`

Rewrite the variant classes to:

```tsx
const variantClasses = {
  primary: `
    bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]
    text-white border border-transparent
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]
    disabled:opacity-50
  `,
  secondary: `
    bg-white dark:bg-[var(--color-bg-subtle)]
    hover:bg-[var(--color-bg-muted)]
    text-[var(--color-text)]
    border border-[var(--color-border-strong)]
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]
    disabled:opacity-50
  `,
  danger: `
    bg-[var(--color-danger)] hover:bg-red-800
    text-white border border-transparent
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-danger)]
    disabled:opacity-50
  `,
  ghost: `
    bg-transparent hover:bg-[var(--color-bg-muted)]
    text-[var(--color-text-muted)] hover:text-[var(--color-text)]
    border border-transparent
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]
  `,
  success: `
    bg-[var(--color-success)] hover:bg-green-800
    text-white border border-transparent
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-success)]
  `,
};

const baseClasses = `
  relative inline-flex items-center justify-center font-medium
  rounded                                            /* 6px */
  transition-colors duration-[var(--duration-fast)]
  focus:outline-none
  disabled:cursor-not-allowed
`;

const sizeClasses = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
  icon: "p-2 text-sm",
};
```

**Remove:**

- 3-stop gradient `from-blue-500 via-blue-600 to-indigo-600`
- Colored shadow glows (`shadow-blue-500/20`, `shadow-blue-500/30`)
- `hover:-translate-y-0.5`, `hover:shadow-lg`
- `active:scale-[0.98]`
- The `before:absolute before:bg-gradient-to-b before:from-white/15` shine overlay
- The `via-rose-600` red-to-rose gradient on danger
- The `from-emerald-500 to-teal-600` gradient on success

The prop API stays the same: `variant`, `size`, `children`, `isLoading`, `aria-label`. Call sites don't change.

### 6.2 — `components/common/Input.tsx`

Replace `baseClasses` and `stateClasses`:

```tsx
const baseClasses = `
  w-full
  bg-white dark:bg-[var(--color-bg-subtle)]
  border rounded                                       /* 1px, 6px */
  text-[var(--color-text)]
  placeholder-[var(--color-text-subtle)]
  transition-colors duration-[var(--duration-fast)]
  focus:outline-none
  disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-bg-subtle)]
`;

const stateClasses = error
  ? `border-[var(--color-danger)]
     focus:border-[var(--color-danger)]
     focus:ring-2 focus:ring-[var(--color-danger-subtle)]`
  : `border-[var(--color-border)]
     hover:border-[var(--color-border-strong)]
     focus:border-[var(--color-primary)]
     focus:ring-2 focus:ring-[var(--color-primary-subtle)]`;

const sizeClasses = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-3 py-2 text-sm",
  lg: "px-4 py-2.5 text-base",
};
```

**Changes:**

- `border-[1.5px]` → `border` (1px)
- `rounded-xl` (12px) → `rounded` (6px)
- `bg-white dark:bg-slate-800/80` → opaque dark surface
- `py-2.5 text-base` (default `md`) → `py-2 text-sm` (denser, smaller)

### 6.3 — Table (`components/common/Table.tsx`, `components/InventoryTable.tsx`)

Replace table chrome with:

```tsx
// Table wrapper
"border border-[var(--color-border)] rounded-md overflow-hidden"

// Header row
"bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)]"

// Header cell
"px-3 py-2 text-xs font-medium text-[var(--color-text-muted)]
 first:pl-4 last:pr-4"   // sentence case in JSX, e.g. "Stock #"

// Body row
"border-b border-[var(--color-border)] last:border-0
 hover:bg-[var(--color-primary-subtle)]
 transition-colors duration-[var(--duration-fast)]"

// Body cell (text)
"px-3 py-2 text-sm text-[var(--color-text)]
 first:pl-4 last:pr-4"

// Body cell (numeric)
"px-3 py-2 text-sm tabular-nums text-right text-[var(--color-text)]
 first:pl-4 last:pr-4"

// Zebra stripe (optional)
"even:bg-[var(--color-bg-subtle)]/30"
```

**InventoryTable specific fixes:**

- Favorite (star) button: remove the amber-yellow gradient hover and `hover:scale-105`. Use:

  ```tsx
  "p-1.5 rounded text-[var(--color-text-muted)]
   hover:text-[var(--color-warning)] hover:bg-[var(--color-warning-subtle)]
   transition-colors"
  ```

  (Yellow only shows when the star is _active/filled_ — solid color, no gradient.)

- "Structure Deal" button: drop the gradient + scale. Apply the standard Button `primary` variant in `size="sm"`.

- Column headers: convert from `STOCK #` / `BOOK (TRADE)` / `FRONT LTV` to sentence-case (`Stock #`, `Book (trade)`, `Front LTV`). Keep `LTV` and `OTD` as acronyms.

- Header cell text size: `text-xs font-medium` (was uppercase tracking).

- Cell padding: `px-3 py-2` (likely was `px-4 py-3`). Denser table = more data visible.

- Right-align all numeric columns: Price, Book (Trade), Front LTV, Front Gross, Amt to Fin, OTD LTV, Payment.

- Frozen-left first 3 columns (Year, Make, Model) using `sticky left-0 bg-white` on those cells.

### 6.4 — KPI cards (in `SuperAdminDashboard.tsx`)

```tsx
// Card
"relative bg-white dark:bg-[var(--color-bg-subtle)]
 border border-[var(--color-border)] rounded-md p-5
 shadow-sm
 hover:border-[var(--color-border-strong)]
 transition-colors duration-[var(--duration-fast)]"

// Label
"text-xs font-medium text-[var(--color-text-muted)]"   // sentence case

// Value
"text-3xl font-semibold tabular-nums text-[var(--color-text)] mt-1"

// Sub-line
"text-xs text-[var(--color-text-subtle)] mt-1"

// Icon — small, top-right corner, no colored pill background
"absolute top-5 right-5 text-[var(--color-text-subtle)]"
```

**Remove:**

- The top-edge gradient stripe (`<div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r ${a.stripe}" />`)
- The colored icon background pill (`${a.iconBg}`)
- `rounded-2xl` (16px) → `rounded-md` (8px)
- `shadow-lg` → `shadow-sm`
- The icon's per-card color variations

All four KPI cards should look identical except for label/value/icon content. Visual rhythm comes from typography and value, not from color.

### 6.5 — Avatars (`components/admin/SuperAdminDashboard.tsx`, user list)

Replace gradient-filled avatar circles with:

```tsx
// Default (muted)
"w-9 h-9 rounded-full
 bg-[var(--color-bg-muted)]
 text-[var(--color-text-muted)]
 flex items-center justify-center
 text-xs font-semibold"

// Accented (for current user, etc.)
"w-9 h-9 rounded-full
 bg-[var(--color-primary-subtle)]
 text-[var(--color-primary)]
 flex items-center justify-center
 text-xs font-semibold"
```

### 6.6 — Impersonation banner (`App.tsx`)

Search for `Viewing as`. Replace the wrapper classes:

```tsx
// Current: bg-gradient-to-r from-purple-600 to-violet-600
// New:
"bg-[var(--color-bg)] border-b-2 border-[var(--color-warning)]
 text-[var(--color-text)] px-6 py-2
 flex items-center justify-between text-sm"
```

Add a small amber dot/icon before the "Viewing as" text to reinforce the warning context:

```tsx
<span className="inline-block w-2 h-2 rounded-full bg-[var(--color-warning)] mr-2" aria-hidden />
```

The "Exit impersonation" button uses the standard `secondary` variant in `size="sm"`.

### 6.7 — Numbered section badges

Find every `Customer & Deal Info` / `Global Deal Structure` heading in `App.tsx`. Replace the colored-circle badge with a flat number prefix:

```tsx
// Current (something like):
<span className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold">1</span>
<h3>Customer & Deal Info</h3>

// New:
<h3 className="text-lg font-semibold text-[var(--color-text)]">
  <span className="text-[var(--color-text-subtle)] mr-2 tabular-nums">1.</span>
  Customer & Deal Info
</h3>
```

Or drop the numbers entirely if the section order is obvious — let the heading do the work.

### 6.8 — Modals (`SettingsModal.tsx`, "Onboard New Dealer", "Save Deal", "AI Lender Manager")

```tsx
// Backdrop
"fixed inset-0 bg-slate-950/60 flex justify-center items-center z-50 p-4"
// (Note: NO backdrop-blur)

// Modal container
"bg-[var(--color-bg)]
 border border-[var(--color-border)] rounded-lg shadow-md
 w-full max-w-2xl max-h-[90vh] flex flex-col
 text-[var(--color-text)]"

// Modal header
"px-6 py-4 border-b border-[var(--color-border)]"
// (No gradient header background.)

// Modal heading
"text-base font-semibold text-[var(--color-text)]"

// Modal subtitle
"text-xs text-[var(--color-text-muted)] mt-0.5"

// Modal body
"px-6 py-5 overflow-y-auto space-y-5"

// Modal footer (button row)
"px-6 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)]
 flex items-center justify-end gap-2"
```

**For `SettingsModal.tsx` specifically:** collapse the nested-card structure. Instead of each section being a `border rounded-lg p-4` card, use:

```tsx
<section>
  <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Deal defaults</h3>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{/* fields */}</div>
</section>
<hr className="my-5 border-[var(--color-border)]" />
<section>...</section>
```

### 6.9 — Status pills / badges

Wherever role badges, status pills, or count chips appear (e.g. `ADMIN`, `SALES`, `SUPERADMIN`, `Active`, `Pending`):

```tsx
// Status: active (green)
"inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs font-medium
 bg-[var(--color-success-subtle)] text-[var(--color-success)]"

// Status: warning (amber)
"inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs font-medium
 bg-[var(--color-warning-subtle)] text-[var(--color-warning)]"

// Role badge (neutral)
"inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium
 bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]"

// Count chip
"inline-flex items-center px-1.5 py-0 rounded-sm text-xs font-medium tabular-nums
 bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]"
```

**Sentence-case** the badge labels (`Admin`, `Sales`, `Superadmin`). All caps is fine ONLY for true acronyms like `LTV`, `OTD`, `APR`, `VIN`, `PTI`.

### 6.10 — Dealer-view header (`App.tsx`)

Current is ~120px tall with a huge "LTV & Desking Pro" h1, tagline, "Super Admin" badge, dealer selector, three buttons.

New target: ~56px tall, single row.

```tsx
<header className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
  <div className="px-6 h-14 flex items-center justify-between">
    <div className="flex items-center gap-3">
      <BrandMark size={28} />
      <span className="text-sm font-semibold text-[var(--color-text)]">LTV Desking PRO</span>
    </div>
    <div className="flex items-center gap-2">
      {/* dealer selector, desk mode toggle, settings, AI lender upload */}
    </div>
  </div>
</header>
```

Drop the tagline ("Precision deal structuring, lender intelligence...") — it belongs on a marketing site, not above every screen.

### 6.11 — "AI Lender Upload" button

Currently has blue-violet gradient + sparkle icon. Apply the standard Button `primary` variant. Keep the sparkle icon if you like (`✨`) but the button itself is solid navy.

---

## Section 7 — Layout density

Current spacing is consumer-app generous. Dealer software runs denser.

| Surface                     | Current      | Target      |
| --------------------------- | ------------ | ----------- |
| Page padding (mobile)       | `px-4 py-6`  | `px-4 py-4` |
| Page padding (desktop)      | `px-8 py-10` | `px-6 py-6` |
| Card-to-card gap            | `gap-6`      | `gap-3`     |
| Form row gap                | `gap-4`      | `gap-3`     |
| Input vertical padding (md) | `py-2.5`     | `py-2`      |
| Table row height            | ~52px        | ~36px       |
| Modal padding               | `p-6`        | `px-6 py-5` |

---

## Section 8 — Light mode as default

Change in `hooks/useTheme.ts`:

```ts
// Current behavior: defaults to dark.
// New: default to "light" unless localStorage has an explicit preference,
// OR the user's OS is set to dark via prefers-color-scheme.
```

The `<html class="dark">` should NOT be applied by default. Users can toggle to dark via the existing theme toggle.

---

## Section 9 — Implementation order (~8 hours total)

Execute in this order — earlier steps unblock or simplify later ones:

1. **Drop in the new design tokens** in `index.css`. Remove the entire `--gradient-*`, `--glass-*`, and `--shadow-glow-*` blocks. Replace with Section 5.1 above. (~1 hr)
2. **Delete `tailwind.config.ts`'s `x-*` palette.** The Twitter colors are unused, dead weight. Replace the file with a minimal config that just enables `darkMode: "class"`. (~10 min)
3. **Rewrite `components/common/Button.tsx`** per Section 6.1. Every button in the app updates from one file. (~45 min)
4. **Rewrite `components/common/Input.tsx`** per Section 6.2. (~30 min)
5. **Audit `components/InventoryTable.tsx`** per Section 6.3. Fix amber-yellow favorite hover, blue-indigo Structure Deal button, ALL-CAPS column headers, cell padding, numeric alignment. (~1 hr)
6. **Audit `components/admin/SuperAdminDashboard.tsx`** per Sections 6.4, 6.5, 6.8. Fix KPI rainbow stripes, recolor blue-violet onboard-dealer modal, drop modal gradient header, de-gradient avatars. (~1.5 hr)
7. **Audit `components/SettingsModal.tsx`** per Section 6.8 (modal pattern) — collapse nested cards. (~1 hr)
8. **Recolor impersonation banner** in `App.tsx` per Section 6.6. (~15 min)
9. **Refactor section number badges** in `App.tsx` per Section 6.7. (~20 min)
10. **Compact the dealer-view header** in `App.tsx` per Section 6.10. (~30 min)
11. **Sentence-case sweep project-wide** — find every `uppercase tracking-wider` or `tracking-wide uppercase` className and convert. Find every all-caps string literal in JSX (e.g. `"TOTAL DEALERS"`) and convert. ~30 min.
12. **Default to light mode** per Section 8. (~10 min)
13. **Run dev server** (`npm run dev`), navigate to every major view, screenshot, compare to the verification checklist (Section 11). (~45 min)

---

## Section 10 — Files to touch

Definite edits:

- `index.css` (token block, remove gradient/glass tokens)
- `tailwind.config.ts` (remove x-\* palette, minimal config)
- `hooks/useTheme.ts` (default to light)
- `components/common/Button.tsx`
- `components/common/Input.tsx`
- `components/common/Table.tsx`
- `components/common/Modal.tsx`
- `components/common/Toast.tsx` (audit for gradients)
- `components/InventoryTable.tsx`
- `components/admin/SuperAdminDashboard.tsx`
- `components/admin/DealerAdminDashboard.tsx`
- `components/SettingsModal.tsx`
- `components/DealStructuringModal.tsx`
- `components/AiLenderManagerModal.tsx`
- `components/LenderProfiles.tsx`
- `components/LenderProfileModal.tsx`
- `components/FavoritesTable.tsx`
- `components/SavedDeals.tsx`
- `components/FinanceTools.tsx`
- `components/DealControls.tsx`
- `components/ActionBar.tsx`
- `components/Header.tsx`
- `components/FloatingToolsPanel.tsx`
- `components/InventoryExpandedRow.tsx`
- `components/auth/Login.tsx`
- `components/auth/Register.tsx`
- `components/auth/OwnerLogin.tsx`
- `components/auth/AuthLayout.tsx`
- `App.tsx` (impersonation banner, section number badges, dealer-view header, route-level styling)

Files to **search for ALL-CAPS string literals + `uppercase tracking-*` className** in:

- All files in `components/` and `App.tsx`. Convert every label/heading to sentence-case unless it's a true acronym (`LTV`, `OTD`, `APR`, `VIN`, `PTI`, `JD`, `AI`, `CSV`, `URL`).

---

## Section 11 — Verification checklist

After implementation, manually verify each item via the dev server (`npm run dev` → http://localhost:3000):

### Login page (`/`)

- [ ] "LTV Desking PRO" wordmark is readable (not dark-on-dark)
- [ ] "Sign in" button is solid navy, no gradient, no glow
- [ ] No backdrop-blur on the form card
- [ ] No purple/violet anywhere

### Owner Console (`/admin`)

- [ ] All four KPI cards have IDENTICAL styling (no rainbow gradient stripes)
- [ ] Labels are sentence-case ("Total dealers", not "TOTAL DEALERS")
- [ ] Quick Actions buttons are solid colors, not gradients
- [ ] Recent users avatars are solid muted slate, not gradient
- [ ] Role badges ("Admin", "Sales", "Superadmin") are sentence-case
- [ ] Status pills ("Active") use solid bg color, no glow

### Dealer view (`/?tab=inventory`)

- [ ] Header is single-row, ~56px tall (no tagline)
- [ ] Impersonation banner: white bg + amber bottom border (NOT purple gradient)
- [ ] Section number prefix ("1." / "2.") is muted, not a colored circle
- [ ] Form fields have 6px corners (`rounded`), 1px borders, opaque background
- [ ] "AI Lender Upload" button is solid navy (NOT blue-to-violet gradient)
- [ ] Inventory table column headers are sentence-case
- [ ] Favorite star: hover changes color, no amber-yellow gradient, no scale animation
- [ ] "Structure Deal" button: solid navy, no scale on hover, no gradient
- [ ] Numeric columns are right-aligned with tabular numerals
- [ ] Table row hover is a subtle blue tint, no shadow, no scale

### Settings modal

- [ ] Modal is 10px corners, opaque background, no backdrop-blur
- [ ] No nested bordered cards — sections separated by `<hr>` only
- [ ] Modal header is plain (no gradient background)

### "Onboard New Dealer" modal

- [ ] Icon tile in header is solid color (NOT blue→violet gradient with shadow glow)
- [ ] Modal header has no gradient background

### Light mode is default

- [ ] First page load shows light theme
- [ ] Theme toggle still works to switch to dark
- [ ] localStorage preference is respected on reload

### Project-wide grep checks (all should return zero matches)

```bash
grep -rn "bg-gradient-to-" --include="*.tsx" components/ App.tsx | grep -v "// COMMENT"
grep -rn "from-violet" --include="*.tsx" components/
grep -rn "from-purple" --include="*.tsx" components/
grep -rn "hover:scale-" --include="*.tsx" components/
grep -rn "hover:-translate-y" --include="*.tsx" components/
grep -rn "shadow-blue-" --include="*.tsx" components/
grep -rn "rounded-2xl" --include="*.tsx" components/
grep -rn "uppercase tracking-" --include="*.tsx" components/
grep -rn "backdrop-blur" --include="*.tsx" components/
```

(A few `bg-gradient-to-*` may legitimately survive — e.g. on the `BrandMark` logomark if it has a gradient fill. Audit those manually.)

### Type-check + lint

- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes with `--max-warnings 0`

---

## Section 12 — What to NOT change

- **No prop API changes.** `<Button variant="primary" size="md">` keeps working. Internal classes change; the interface doesn't.
- **No new dependencies.** Don't install `shadcn/ui`, `framer-motion`, `lucide-react`, etc. Those are separate workstreams (see plan file). This brief is Tailwind classes + CSS tokens only.
- **No file moves.** Don't restructure `components/` into feature folders. That's a separate refactor.
- **No removal of accessibility features.** Keep `aria-live` on toasts, skip-nav, focus rings, label associations.
- **No changes to backend code** (`backend/`, `api/`, `server/`).
- **No changes to PB collections, migrations, or hooks.**
- **No changes to vercel.json, fly.toml, package.json deps, Dockerfile.**
- **Don't replace the `BrandMark` SVG.** It's hand-tuned; just verify it renders well on both light + dark backgrounds.

---

## Section 13 — Tooling constraints

- **Tailwind v4 is in use** (`@import "tailwindcss"` in `index.css`). Most tokens still live in `:root` (CSS variables) for now. Long-term, a follow-up should migrate them to `@theme {}` syntax, but for this redesign the `:root` block is the canonical token location.
- **React 19 + strict TypeScript** (`strict` + `noUncheckedIndexedAccess`). All changes must type-check.
- **ESLint must pass `--max-warnings 0`.** Don't introduce new warnings.
- **The build must complete** (`npm run build`). Bundle size shouldn't regress — and may improve slightly because gradient overlays and box-shadow glows compile to more CSS than solid colors do.

---

## Section 14 — Known risks

1. **Tailwind utilities like `bg-blue-500` still resolve to the default Tailwind palette**, not the new CSS-var primary. Use `bg-[var(--color-primary)]` in the rewritten components. A future migration to `@theme {}` will make `bg-primary` a real utility.
2. **`dark:` prefix classes** are used in ~22 files. Each one's dark-mode treatment may need a small revision to match the new dark palette. Audit each file you touch — don't blindly find-replace `dark:bg-slate-800/80` → `dark:bg-[var(--color-bg-subtle)]` without confirming it makes sense in context.
3. **Some components hard-code the old Tailwind colors inline** (e.g. `from-blue-500 to-indigo-600`, `bg-emerald-500`). These need find-and-replace, not a token swap.
4. **The `index.css` file has ~1494 lines** including a lot of utility classes and component-specific overrides. Don't blow it away — just replace the `:root` and `.dark` token blocks and remove the `--gradient-*` / `--glass-*` / `--shadow-glow-*` token declarations. Audit any utility classes in `index.css` that reference those (e.g. `.glass-card`) and either remove or repoint them.
5. **The "AI Lender Upload" button** has a sparkle emoji or icon — keep it as a content decoration on the button label, but remove any gradient styling on the button itself.
6. **The login page background image** (blurred car photo) — this is a design decision out of scope for this brief. Leave it as-is unless you have an opinion. If you do replace it, prefer a CSS gradient (e.g., `bg-gradient-to-br from-slate-900 to-slate-700`) or remove the image entirely for a clean solid background.

---

## Section 15 — Definition of done

The redesign is complete when:

1. Every checkbox in Section 11 is checked.
2. A screenshot of the Login page, Owner Console, Dealer view, and Settings modal shows: solid navy primary, no gradients, sentence-case labels, opaque surfaces, 6–10px corner radii.
3. The "Designer-screenshot test" — pick 5 random screens, screenshot them, and ask yourself honestly: _would Tekion / Plaid / Stripe-admin ship this?_ If yes on at least 4 of 5, done. If no on 2+, continue iterating.
4. The build passes (`npm run build`), the type-check passes (`npm run type-check`), and the lint passes (`npm run lint`).
5. **Manual smoke test:** log in as a superadmin in the live preview deploy, switch to dealer view, open inventory, open the Settings modal, open the AI Lender Manager modal, navigate to Saved Deals and Lender Programs. Every surface should feel consistent and institutional.

---

## Section 16 — Related context (not in scope, but informational)

Other production-readiness items that have **already shipped** (do not redo):

- AI proxy server-side (`api/ai/[...path].ts`, `server/ai/keyResolver.ts`, `server/ai/auth.ts`)
- `pb_hooks/dealer_guard.pb.js` (write-time RBAC defense)
- `audit_log` PB collection
- Lazy-loaded `jspdf` / `html2canvas` / `tesseract.js`
- Sentry frontend + PB slow-query hook
- Password policy + haveibeenpwned breach check
- `pb.filter()` parameterized queries
- `asRecord<T>` / `asRecordArray<T>` (killed `as any` escape hatches)
- Renovate auto-merge + 7 runbook stubs in `docs/runbooks/`
- Litestream + Cloudflare R2 backup ops workflows
- `validate-migrations` CI job (ephemeral PB boot + idempotency check)
- Brand surface: favicon, manifest, OG/Twitter cards, CSP + security headers
- Legal pages (`/privacy`, `/terms`) — explicitly placeholders pending lawyer review

Other items **still open** (separate workstream, not in this brief):

- shadcn/ui migration
- Framer-motion / Motion library for choreographed motion design
- Custom commissioned illustrations for empty states
- Command palette (cmdk)
- Optimistic UI on React Query mutations
- Onboarding tour
- Page transitions via View Transitions API
- F&I-domain integrations (DMS, KBB/Black Book, credit pulls, e-sig)
- SOC 2 prep, 2FA/SSO, full audit log expansion
- Stripe billing, pricing page, customer support widget

Full plan with all open items: `LTV-Desking-PRO/PRODUCTION_READINESS_PLAN.md`

---

## Section 17 — Handoff message

If you're an AI coding agent receiving this brief, your task is exactly Section 9 ("Implementation order"). Work through steps 1–13 in order. After each step, you may run `npm run dev` and visually inspect the change before continuing. Do not deviate from the spec without surfacing a question first.

When done, post a summary to the user listing: which checkboxes from Section 11 passed, which (if any) needed manual judgment calls and what you decided, and the final `npm run build` output.
