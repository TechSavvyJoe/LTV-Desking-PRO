import { test, expect } from "@playwright/test";
import { authenticateAs, loginViaApi } from "./fixtures/auth";
import { appBackendUrl, USE_REAL_BACKEND } from "./fixtures/backend";

test.describe.configure({ mode: "serial" });

test("an unset persisted tax override keeps Michigan tax after a reload", async ({
  page,
  request,
}) => {
  test.skip(!USE_REAL_BACKEND, "Requires the disposable seeded PocketBase database.");
  const { token } = await loginViaApi(request, "sales");
  const response = await request.get(`${appBackendUrl()}/api/collections/dealer_settings/records`, {
    headers: { Authorization: token },
  });
  expect(response.ok()).toBe(true);
  const settings = (await response.json()).items[0];
  expect(settings.customTaxRate).toBe(0);
  expect(settings.customTaxRateEnabled).toBe(false);
  await authenticateAs(page, request, "sales");
  await page.addInitScript(() => {
    localStorage.setItem(
      "ltvDealData_v2",
      JSON.stringify({
        downPayment: 0,
        tradeInValue: 0,
        tradeInPayoff: 0,
        backendProducts: 0,
        loanTerm: 72,
        interestRate: 8.9,
        stateFees: 31,
        rebate: 0,
        notes: "",
        buyerState: "MI",
      })
    );
    localStorage.setItem(
      "ltvDeskUi_v1",
      JSON.stringify({ v: 1, focusVin: null, sort: { key: null, direction: "asc" } })
    );
  });
  for (let visit = 0; visit < 2; visit++) {
    if (visit === 0) await page.goto("/desk");
    else await page.reload();
    await page.getByRole("button", { name: "Mercedes-Benz GLC 300", exact: true }).click();
    await page.getByRole("button", { name: "Deal sheet", exact: true }).click();
    await expect(
      page
        .getByRole("dialog", { name: "Deal sheet", exact: true })
        .getByRole("row", { name: "Sales tax estimate + $2,358.24", exact: true })
    ).toBeVisible();
  }
});

test("an explicit zero tax override can be saved, reloaded and disabled", async ({
  page,
  request,
}) => {
  test.skip(!USE_REAL_BACKEND, "Requires the disposable seeded PocketBase database.");
  const { token } = await loginViaApi(request, "admin");
  const headers = { Authorization: token };
  const initial = await request.get(`${appBackendUrl()}/api/collections/dealer_settings/records`, {
    headers,
  });
  const original = (await initial.json()).items[0];
  await authenticateAs(page, request, "admin");
  try {
    await page.goto("/desk");
    await page.getByRole("button", { name: "Mercedes-Benz GLC 300", exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Use a custom tax rate", { exact: true }).check();
    await page.getByLabel("Custom tax rate (%)", { exact: true }).fill("0");
    const zeroSave = page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" &&
        r.url().includes("/api/collections/dealer_settings/records/")
    );
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    const saved = await zeroSave;
    expect(saved.ok()).toBe(true);
    expect(await saved.json()).toMatchObject({ customTaxRate: 0, customTaxRateEnabled: true });
    await page.reload();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByLabel("Use a custom tax rate", { exact: true })).toBeChecked();
    await expect(page.getByLabel("Custom tax rate (%)", { exact: true })).toHaveValue("0");
    await page.getByLabel("Use a custom tax rate", { exact: true }).uncheck();
    const clearSave = page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" &&
        r.url().includes("/api/collections/dealer_settings/records/")
    );
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    const cleared = await clearSave;
    expect(cleared.ok()).toBe(true);
    expect(await cleared.json()).toMatchObject({ customTaxRate: 0, customTaxRateEnabled: false });
    await page.reload();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByLabel("Use a custom tax rate", { exact: true })).not.toBeChecked();
  } finally {
    const restored = await request.patch(
      `${appBackendUrl()}/api/collections/dealer_settings/records/${original.id}`,
      {
        headers,
        data: {
          customTaxRate: original.customTaxRate,
          customTaxRateEnabled: original.customTaxRateEnabled,
        },
      }
    );
    expect(restored.ok()).toBe(true);
  }
});
