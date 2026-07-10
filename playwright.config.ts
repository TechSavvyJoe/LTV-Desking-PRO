import { defineConfig, devices } from "@playwright/test";

const E2E_REAL = !!process.env.E2E_REAL_BACKEND || !!process.env.USE_SEED_BACKEND;
const PB_URL = process.env.VITE_POCKETBASE_URL || process.env.PB_URL || "http://127.0.0.1:8090";
const FRONTEND_PORT = process.env.E2E_BASE_PORT || "3000";
const BASE_URL = process.env.E2E_BASE_URL || `http://127.0.0.1:${FRONTEND_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // Increased timeouts for real flows (PDF gen, import parsing, calc renders) + backend seed latency
  timeout: E2E_REAL ? 90_000 : 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Accept downloads for PDF generation tests
    acceptDownloads: true,
    // Extra context for real backend runs
    ...(E2E_REAL ? { ignoreHTTPSErrors: true } : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Future: add firefox/webkit for matrix if needed; kept minimal for speed
  ],
  webServer: E2E_REAL
    ? undefined
    : {
        // When using seed helper + real backend (E2E_REAL_BACKEND=1), start PB + seed OUTSIDE (see CI + seed-test-db.ts)
        // and run vite with VITE_POCKETBASE_URL set. Do not auto start dev if external target.
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        // Give Vite more time to boot on slower machines/CI
        timeout: 120 * 1000,
        env: {
          VITE_POCKETBASE_URL: PB_URL,
        },
      },
  // Seed helper integration for backend:
  //   E2E_REAL_BACKEND=1 E2E_KEEP_PB_RUNNING=1 node tests/helpers/seed-test-db.ts
  //   Then: VITE_POCKETBASE_URL=http://127.0.0.1:8090 npm run test:e2e
  // In CI: workflow downloads PB, starts it, seeds via helper (with KEEP), sets envs, runs e2e.
  // Mocks are disabled automatically in specs when E2E_REAL_BACKEND set.
  // This enables true e2e/integration against seeded data for load desk, import, AI, save, lender, PDF.
});
