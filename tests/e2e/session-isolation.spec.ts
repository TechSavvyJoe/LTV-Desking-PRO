import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { appBackendUrl, USE_REAL_BACKEND } from "./fixtures/backend";
import { STORAGE_KEYS } from "../../constants";

// Uses only the explicitly local seeded PocketBase and Vite test stack.
async function login(request: APIRequestContext, role: "manager" | "sales") {
  const response = await request.post(
    `${appBackendUrl()}/api/collections/users/auth-with-password`,
    {
      data: {
        identity: `${role}.a@dealera.com`,
        password: role === "manager" ? "ManagerPassword123!" : "SalesPassword123!",
      },
    }
  );
  expect(response.ok()).toBe(true);
  return response.json() as Promise<{ token: string; record: Record<string, unknown> }>;
}

async function installIdentity(page: Page, auth: Awaited<ReturnType<typeof login>>) {
  await page.evaluate(async (nextAuth) => {
    const modulePath = "/lib/pocketbase.ts";
    const { pb } = await import(modulePath);
    pb.authStore.save(nextAuth.token, nextAuth.record);
  }, auth);
  await expect(page.locator("#desk-customer")).toBeVisible();
}

async function populateManagerState(page: Page) {
  await page.locator("#desk-customer").fill("Synthetic private draft");
  await page.evaluate(
    async ({ dealKey, filtersKey }) => {
      localStorage.setItem(dealKey, JSON.stringify({ profitInputs: { unitCost: 12345 } }));
      localStorage.setItem(filtersKey, JSON.stringify({ monthlyIncome: 5000 }));
      const modulePath = "/lib/queryClient.ts";
      const { queryClient } = await import(modulePath);
      queryClient.setQueryData(["synthetic-private-session"], { buyRate: 6 });
    },
    { dealKey: STORAGE_KEYS.DEAL_DATA, filtersKey: STORAGE_KEYS.FILTERS }
  );
}

test.describe("Private browser session isolation", () => {
  test.skip(!USE_REAL_BACKEND, "Requires the explicitly local seeded PocketBase and Vite stack");

  test("manager to sales login clears private memory, storage and role-filtered cache", async ({
    page,
    request,
  }) => {
    const manager = await login(request, "manager");
    const sales = await login(request, "sales");
    await page.goto("/desk");
    await installIdentity(page, manager);
    await populateManagerState(page);
    await installIdentity(page, sales);
    await expect(page.locator("#desk-customer")).toHaveValue("");
    const privateState = await page.evaluate(
      async ({ dealKey, filtersKey }) => {
        const modulePath = "/lib/queryClient.ts";
        const { queryClient } = await import(modulePath);
        return {
          deal: localStorage.getItem(dealKey),
          filters: localStorage.getItem(filtersKey),
          privateCache: queryClient.getQueryData(["synthetic-private-session"]),
        };
      },
      { dealKey: STORAGE_KEYS.DEAL_DATA, filtersKey: STORAGE_KEYS.FILTERS }
    );
    // The new provider may write its clean defaults immediately after mounting.
    expect(privateState.deal ?? "").not.toContain("12345");
    expect(privateState.filters ?? "").not.toContain("5000");
    expect(privateState.privateCache).toBeUndefined();
  });

  test("rejected session clears private browser state before the next login", async ({
    page,
    request,
  }) => {
    const manager = await login(request, "manager");
    const sales = await login(request, "sales");
    await page.goto("/desk");
    await installIdentity(page, manager);
    await populateManagerState(page);
    await page.route("**/api/collections/inventory/records*", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: '{"status":401,"message":"Synthetic rejected session"}',
      })
    );
    await page.evaluate(async () => {
      const modulePath = "/lib/pocketbase.ts";
      const { pb } = await import(modulePath);
      await pb
        .collection("inventory")
        .getList(1, 1)
        .catch(() => null);
    });
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(
      "Your session ended. Sign in again. Private browser drafts were cleared."
    );
    expect(
      await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.DEAL_DATA)
    ).toBeNull();
    await page.unroute("**/api/collections/inventory/records*");
    await installIdentity(page, sales);
    await expect(page.locator("#desk-customer")).toHaveValue("");
  });
});
