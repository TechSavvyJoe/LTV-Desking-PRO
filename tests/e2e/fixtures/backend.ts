/**
 * Default URL of the local seeded PocketBase for e2e runs.
 *
 * Honors PB_PORT — the same variable tests/helpers/seed-test-db.ts uses to
 * pick its port — so `PB_PORT=8095` alone keeps the seed helper, the API
 * fixtures and the frontend dev server pointed at one backend. Explicit
 * E2E_PB_URL / VITE_POCKETBASE_URL still win where each caller reads them.
 */
export const LOCAL_PB_URL = `http://127.0.0.1:${process.env.PB_PORT || "8090"}`;
