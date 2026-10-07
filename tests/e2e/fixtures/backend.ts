/**
 * Shared e2e backend settings.
 *
 * LOCAL_PB_URL honors PB_PORT — the same variable tests/helpers/seed-test-db.ts
 * uses to pick its port — so `PB_PORT=8095` alone keeps the seed helper, the
 * API fixtures and the frontend dev server pointed at one backend.
 */
export const LOCAL_PB_URL = `http://127.0.0.1:${process.env.PB_PORT || "8090"}`;

/**
 * Real-backend mode. Mirrors playwright.config.ts, which disables its mock
 * web server for either variable.
 */
export const USE_REAL_BACKEND = !!process.env.E2E_REAL_BACKEND || !!process.env.USE_SEED_BACKEND;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * The PocketBase URL the e2e run is configured for — ONE precedence shared by
 * playwright.config.ts (the dev server's VITE_POCKETBASE_URL) and the API
 * fixtures, so the app and the fixtures can never split across two backends:
 * E2E_PB_URL, then VITE_POCKETBASE_URL, then PB_URL, then the PB_PORT-aware
 * local default. No safety check here: the mocked run may point the dev
 * server at a placeholder host it never reaches.
 */
export function configuredBackendUrl(): string {
  const url =
    process.env.E2E_PB_URL || process.env.VITE_POCKETBASE_URL || process.env.PB_URL || LOCAL_PB_URL;
  return url.replace(/\/+$/, "");
}

/**
 * configuredBackendUrl(), for API calls that authenticate seeded accounts.
 *
 * Refuses any non-local host unless E2E_ALLOW_REMOTE_PB=1: seeded test
 * credentials must never be posted to a real deployment, and on dev machines
 * .env.local points VITE_POCKETBASE_URL at production. Resolved lazily (only
 * when a real-backend test actually authenticates), so mocked runs that set
 * VITE_POCKETBASE_URL to a placeholder are unaffected.
 */
export function appBackendUrl(): string {
  const url = configuredBackendUrl();
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host) && process.env.E2E_ALLOW_REMOTE_PB !== "1") {
    throw new Error(
      `Refusing to authenticate seeded e2e accounts against non-local PocketBase "${host}". ` +
        "Point VITE_POCKETBASE_URL / E2E_PB_URL at the local seeded stack, or set E2E_ALLOW_REMOTE_PB=1 for a disposable remote test instance."
    );
  }
  return url;
}
