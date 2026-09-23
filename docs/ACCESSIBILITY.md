# Accessibility Conformance Summary — LTV Desking PRO

**Target standard:** WCAG 2.2, Level AA
**Last reviewed:** 2026-09-18 · **Owner:** product/engineering

This is a conformance summary, not a formal VPAT. A VPAT 2.5 (WCAG edition) can be produced from this document on request — it maps the same evidence to the standard success-criterion-by-success-criterion table procurement teams expect, which this page intentionally keeps out of for readability.

## What "AA" means for this product

LTV Desking PRO is an internal dealership tool (desk, pipeline, inventory, lenders, reports, finance tools) plus a public login/registration surface. Conformance is pursued for both the public auth pages and the authenticated app shell, in both the light and dark themes the app ships (theme is a first-class, user-facing toggle, not a cosmetic extra).

## Automated coverage

- **axe-core accessibility gate** — `tests/e2e/a11y.spec.ts` runs `@axe-core/playwright` against `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa` rule tags on every pull request into `main` and on pushes to `main` (`.github/workflows/check.yml`'s single `check` job, via `npm run test:e2e`) — on other branch pushes the e2e/axe steps are skipped and only type-check/lint/unit/coverage/audit run. It scans the login page in both light mode and dark mode (the app toggles dark mode with a `dark` class on `<html>`) and **fails the build on any `serious` or `critical` impact violation**; the full violation payload is attached to the Playwright report for every run so failures are debuggable without re-running locally. Authenticated routes (`/desk`, `/pipeline`, `/inventory`, `/lenders`, `/reports`, `/tools`) are scanned by the same gate once a reusable auth fixture exists in the e2e suite — today they're explicitly skipped with a stated reason rather than silently omitted.
- **Static analysis gates** — ESLint (`npm run lint`) and Prettier run on every commit (`.husky/pre-commit`) and in CI. These catch structural problems (invalid JSX, unused disable directives, formatting drift), not accessibility rules — there is no `eslint-plugin-jsx-a11y` rule set yet (see Known gaps), so the axe gate is the only automated accessibility check.
- **Unit-tested ARIA patterns** — the command palette (`components/shell/CommandPalette.test.tsx`), the roving-tabindex tabs hook (`hooks/useRovingTabs.test.tsx`), and the first-run checklist (`components/shell/GettingStarted.test.tsx`) assert their roles, names, `aria-selected`/`aria-activedescendant` wiring, and keyboard behavior in `vitest`.
- **Type-checking** (`tsc --noEmit`) and unit tests (`vitest`) guard the calculation and rendering logic that produces the content axe evaluates.

Automated tooling (axe, linters) reliably catches roughly a third of WCAG success criteria — missing labels, contrast, invalid ARIA, missing landmarks. The rest requires human verification, below.

## What is manually verified

- **Keyboard navigation** — every interactive control (tabs, dialogs, the command palette, deal terms rail, lender ladder) is operable via Tab/Shift+Tab, Enter/Space, and Escape without a mouse.
- **Screen-reader live regions for toasts** — `components/common/Toast.tsx` renders both a `role="status" aria-live="polite"` region and a `role="alert" aria-live="assertive"` region so success and error toasts are announced without stealing focus.
- **Reduced-motion support** — `@media (prefers-reduced-motion: reduce)` rules in `index.css` and an explicit `matchMedia` check in `components/DealCharts.tsx` disable non-essential animation and chart transitions for users who request it at the OS level.
- **Focus trapping and restore in modals** — `components/common/Modal.tsx` and `ConfirmDialog.tsx` use `useFocusTrap`/`useRestoreFocus` (`hooks/useKeyboard.ts`) so focus is contained inside an open dialog and returns to the triggering element on close.
- **24×24 minimum target sizes (WCAG 2.5.8)** — compact controls (e.g. the Toast dismiss affordance) are explicitly sized to meet the ≥24×24px target without inflating the visual pill.
- **Form labels and `aria-describedby` on errors** — form inputs (`components/common/Input.tsx`, `InputGroup.tsx`) and dialogs link error/help text via `aria-describedby` rather than relying on visual proximity alone.

These are re-checked manually during design/redesign passes (most recently the neutral light-first palette) and spot-checked before releases; they are not yet asserted by an automated test, which is the honest gap this document is naming.

## Known gaps (stated honestly)

- **Data-dense tables** (inventory grid, lender ladder, reports) have not had a full screen-reader table-navigation pass (row/column headers via `scope`/`aria-*` for the most complex grids); some rely on visual layout more than semantic table structure.
- **Charts** (`components/DealCharts.tsx`, Recharts) convey precise values primarily through hover/focus tooltips; there is no full text-equivalent (data table or summary) fallback for every chart yet, so screen-reader and low-vision users relying on non-hover access get less detail than sighted mouse users.
- **PDF exports** (deal sheets, favorites lists) are generated client-side via `jsPDF`/`html2canvas` (`services/pdfGenerator.ts`) and are **not tagged PDF/UA** — they are visually faithful but not yet screen-reader navigable as structured documents.
- **Authenticated-route automated coverage** is not yet wired up (see above) — manual verification is the only current signal for `/desk`, `/pipeline`, `/inventory`, `/lenders`, `/reports`, and `/tools`.
- **No accessibility lint rules** — `eslint-plugin-jsx-a11y` is not installed, so label/ARIA mistakes are caught by axe at e2e time rather than at edit time.

## Feedback and contact

If you encounter an accessibility barrier using LTV Desking PRO, or need this summary in an alternate format, contact us at the support address configured for this deployment (`SUPPORT_EMAIL` in `constants.ts`, sourced from `VITE_SUPPORT_EMAIL`).
