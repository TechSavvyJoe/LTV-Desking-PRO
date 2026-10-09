import { test, expect } from "@playwright/test";
import { authenticateAs } from "./fixtures/auth";
import { USE_REAL_BACKEND } from "./fixtures/backend";

const REAL_BACKEND_REQUIRED =
  "Browser smoke tests require the seeded backend (E2E_REAL_BACKEND=1 or USE_SEED_BACKEND=1).";

const routeReady: Record<string, { selector?: string; heading?: RegExp }> = {
  "/desk": { selector: '[data-screen-label="Dealer desk"]' },
  "/pipeline": { selector: '[data-screen-label="Pipeline"]', heading: /^Pipeline$/ },
  "/inventory": { selector: '[data-screen-label="Inventory"]' },
  "/lenders": { selector: '[data-screen-label="Lenders"]' },
  "/reports": { selector: '[data-screen-label="Reports"]' },
  "/tools": { heading: /finance tools/i },
};

test.describe("Cross-browser smoke (seeded backend)", () => {
  test("renders all six dealer routes without browser console errors", async ({
    page,
    request,
  }) => {
    test.skip(!USE_REAL_BACKEND, REAL_BACKEND_REQUIRED);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await authenticateAs(page, request, "sales");
    for (const [route, ready] of Object.entries(routeReady)) {
      await page.goto(route);
      if (ready.selector) await expect(page.locator(ready.selector)).toBeVisible();
      if (ready.heading)
        await expect(page.getByRole("heading", { name: ready.heading })).toBeVisible();
      await expect(page.locator("main")).toBeVisible();
    }

    expect(errors, "The six dealer routes should not emit browser errors").toEqual([]);
  });

  test("reprices add-ons and keeps phone desk terms reachable in both themes", async ({
    page,
    request,
  }) => {
    test.skip(!USE_REAL_BACKEND, REAL_BACKEND_REQUIRED);
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticateAs(page, request, "sales");
    await page.goto("/desk");
    await expect(page.locator('[data-screen-label="Dealer desk"]')).toBeVisible();
    await page.getByRole("button", { name: "View deal", exact: true }).click();

    const selectedVehicle = page.locator(".desk-inspector-title-row h3");
    await expect(selectedVehicle).toBeVisible();
    const vehicleBefore = await selectedVehicle.innerText();
    const financed = page
      .locator(".desk-summary-metrics > div")
      .filter({ hasText: "Financed" })
      .locator("strong");
    const amountBefore = Number((await financed.innerText()).replace(/[^0-9.-]/g, ""));

    await page.getByRole("tab", { name: "Add-ons" }).click();
    await page.getByRole("button", { name: /Service contract/ }).click();
    await expect(page.locator(".desk-backend-total strong")).toHaveText("$2,495");
    await expect
      .poll(async () => Number((await financed.innerText()).replace(/[^0-9.-]/g, "")))
      .toBe(amountBefore + 2495);
    await expect(selectedVehicle).toHaveText(vehicleBefore);
    await page
      .getByRole("dialog", { name: "Deal inspector", exact: true })
      .getByRole("button", { name: "Close deal inspector", exact: true })
      .click();

    for (const scheme of ["light", "dark"] as const) {
      const switchToScheme = page.getByRole("button", { name: `Switch to ${scheme} theme` });
      if (await switchToScheme.count()) await switchToScheme.click();
      expect(
        await page.locator("html").evaluate((element) => element.classList.contains("dark"))
      ).toBe(scheme === "dark");
      const more = page.getByRole("button", {
        name: "Trade, taxes & advanced inputs",
        exact: true,
      });
      if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
      const monthlyDebt = page.locator("#desk-monthly-debt");
      await monthlyDebt.scrollIntoViewIfNeeded();
      await expect(monthlyDebt).toBeInViewport();
    }
  });

  test("downloads a valid deal-sheet PDF with the standard PDF signature", async ({
    page,
    request,
  }) => {
    test.skip(!USE_REAL_BACKEND, REAL_BACKEND_REQUIRED);
    await authenticateAs(page, request, "sales");
    await page.goto("/desk");
    await expect(page.locator('[data-screen-label="Dealer desk"]')).toBeVisible();
    await page.getByRole("button", { name: /Deal sheet/i }).click();
    const dealSheet = page.getByRole("dialog", { name: "Deal sheet", exact: true });
    await expect(dealSheet).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dealSheet.getByRole("button", { name: "Download PDF" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    const path = await download.path();
    expect(path).toBeTruthy();
    const { readFile } = await import("node:fs/promises");
    const bytes = await readFile(path!);
    expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  test("exposes accessible pipeline actions and labeled desk filters", async ({
    page,
    request,
  }) => {
    test.skip(!USE_REAL_BACKEND, REAL_BACKEND_REQUIRED);
    await authenticateAs(page, request, "sales");
    await page.goto("/pipeline");
    await expect(page.locator('[data-screen-label="Pipeline"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pipeline", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start new deal" })).toBeVisible();

    await page.goto("/desk");
    await expect(page.locator('[data-screen-label="Dealer desk"]')).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Customer", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "FICO", exact: true })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Search inventory", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Trade, taxes & advanced inputs" })
    ).toBeVisible();
  });
});
