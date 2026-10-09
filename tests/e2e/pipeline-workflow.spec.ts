import { test, expect } from "@playwright/test";
import { authenticateAs, loginViaApi } from "./fixtures/auth";
import { appBackendUrl, USE_REAL_BACKEND } from "./fixtures/backend";

test.describe("Dealer pipeline workflow", () => {
  test.skip(!USE_REAL_BACKEND, "Requires disposable local PocketBase");

  test("a delayed save is single-flight and searchable, with manual status persisted", async ({
    page,
    request,
  }) => {
    await authenticateAs(page, request, "manager");
    await page.goto("/desk");
    await page.getByRole("button", { name: "Kia Telluride LX", exact: true }).click();
    const customer = `Synthetic Pipeline QA ${Date.now()}`;
    await page.getByLabel("Customer", { exact: true }).fill(customer);
    let writes = 0;
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/collections/saved_deals/records", async (route) => {
      if (route.request().method() === "POST") {
        writes++;
        await paused;
      }
      await route.continue();
    });
    const savedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/collections/saved_deals/records")
    );
    await page.getByRole("button", { name: "Save deal", exact: true }).click();
    await expect.poll(() => writes).toBe(1);
    const busy = page.getByRole("button", { name: "Saving…", exact: true });
    await expect(busy).toBeDisabled();
    // Even a synthetic activation while the response is held cannot queue a second save.
    await busy.evaluate((button) => (button as HTMLButtonElement).click());
    expect(writes).toBe(1);
    release();
    const response = await savedResponse;
    expect(response.ok()).toBeTruthy();
    const saved = await response.json();
    try {
      await page.getByRole("link", { name: /^Pipeline/ }).click();
      await page.getByRole("searchbox", { name: "Find a deal" }).fill(customer);
      const row = page.getByRole("row", { name: `Deal for ${customer}` });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: /^Show details/ }).click();
      await page.getByRole("combobox", { name: "Dealer-entered status" }).selectOption("submitted");
      await expect(page.getByRole("combobox", { name: "Dealer-entered status" })).toBeEnabled();
      const { token } = await loginViaApi(request, "manager");
      await expect
        .poll(async () => {
          const record = await request.get(
            `${appBackendUrl()}/api/collections/saved_deals/records/${saved.id}`,
            { headers: { Authorization: token } }
          );
          return (await record.json()).status;
        })
        .toBe("submitted");
      await page.getByRole("combobox", { name: "Deal status" }).selectOption("funded");
      await expect(page.getByRole("heading", { name: "No matching deals" })).toBeVisible();
      await page.getByRole("button", { name: "Clear filters" }).click();
      await expect(row).toBeVisible();
      expect(writes).toBe(1);
    } finally {
      release();
      const { token } = await loginViaApi(request, "admin");
      const cleanup = await request.delete(
        `${appBackendUrl()}/api/collections/saved_deals/records/${saved.id}`,
        { headers: { Authorization: token } }
      );
      expect(cleanup.ok()).toBeTruthy();
    }
  });
});
