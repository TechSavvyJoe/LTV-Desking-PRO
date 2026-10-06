import type { APIRequestContext, Page } from "@playwright/test";
import { appBackendUrl } from "./backend";

/**
 * Reusable real-backend auth fixture.
 *
 * Authenticates a seeded account through the PocketBase REST API and seeds the
 * browser's `pocketbase_auth` localStorage entry (the key + `{ token, record }`
 * shape the PocketBase JS SDK's LocalAuthStore reads) before the first
 * navigation, so `page.goto("/desk")` lands authenticated without the login UI.
 *
 * Authenticates against appBackendUrl() — the same backend the app under test
 * uses (playwright.config.ts precedence, E2E_PB_URL as an explicit override),
 * so the injected token is valid for the app. Non-local hosts are refused
 * unless E2E_ALLOW_REMOTE_PB=1.
 * Seeded accounts come from tests/helpers/seed-test-db.ts.
 */

export const SEEDED_ACCOUNTS = {
  sales: { identity: "sales.a@dealera.com", password: "SalesPassword123!" },
  manager: { identity: "manager.a@dealera.com", password: "ManagerPassword123!" },
  admin: { identity: "admin.a@dealera.com", password: "AdminPassword123!" },
} as const;

export type SeededRole = keyof typeof SEEDED_ACCOUNTS;

interface PocketBaseAuthResponse {
  token: string;
  record: Record<string, unknown>;
}

export async function loginViaApi(
  request: APIRequestContext,
  role: SeededRole
): Promise<PocketBaseAuthResponse> {
  const response = await request.post(
    `${appBackendUrl()}/api/collections/users/auth-with-password`,
    {
      data: SEEDED_ACCOUNTS[role],
      headers: { "Content-Type": "application/json" },
    }
  );
  if (!response.ok()) {
    throw new Error(`PocketBase auth failed for ${role}: ${await response.text()}`);
  }
  return (await response.json()) as PocketBaseAuthResponse;
}

/**
 * Authenticates `role` and registers an init script that writes the SDK's
 * auth entry into localStorage on every document load in `page`.
 */
export async function authenticateAs(
  page: Page,
  request: APIRequestContext,
  role: SeededRole
): Promise<void> {
  const { token, record } = await loginViaApi(request, role);
  await page.addInitScript(
    (auth) => {
      try {
        window.localStorage.setItem("pocketbase_auth", JSON.stringify(auth));
      } catch {
        // storage unavailable — the app will fall back to the login page
      }
    },
    { token, record }
  );
}
