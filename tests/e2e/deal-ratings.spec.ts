import { test, expect } from "@playwright/test";
import { authenticateAs, loginViaApi } from "./fixtures/auth";
import { appBackendUrl, USE_REAL_BACKEND } from "./fixtures/backend";

// Synthetic, local-only records. This verifies UI → rules → saved JSON → restored desk.
test.describe("Explainable dealership ratings", () => {
  test.skip(!USE_REAL_BACKEND, "Requires the disposable seeded PocketBase database");

  test("manager inputs produce meaningful numbers, stay VIN-specific and survive saving", async ({
    page,
    request,
  }) => {
    await authenticateAs(page, request, "manager");
    await page.goto("/desk");
    await page.getByRole("button", { name: "Kia Telluride LX", exact: true }).click();
    const customer = `Synthetic Rating QA ${Date.now()}`;
    await page.getByLabel("Customer", { exact: true }).fill(customer);
    await page.getByLabel("FICO", { exact: true }).fill("720");
    await page.getByLabel("Income / mo").fill("6500");
    await page.getByLabel("Payment budget ($/mo)").fill("900");
    await page.getByLabel("Interest rate (%)", { exact: true }).fill("8.9");
    await page.getByRole("button", { name: "72 months", exact: true }).click();
    await page.getByRole("button", { name: "Trade, taxes & advanced inputs", exact: true }).click();
    await page.getByLabel("Monthly debt", { exact: true }).fill("500");
    await page.getByLabel("Vehicle condition", { exact: true }).selectOption("used");
    await page.getByRole("button", { name: "Trade, taxes & advanced inputs", exact: true }).click();
    await page.getByText("Set profit inputs", { exact: true }).click();
    await page.getByLabel("All-in unit cost ($)").fill("38000");
    await page.getByLabel("Total product cost ($)").fill("0");
    await page.getByLabel("Expected reserve / flat ($)").fill("0");
    await page.getByLabel("Minimum total gross ($)").fill("2500");
    const rating = page.getByRole("region", { name: "Explainable deal ratings" });
    await expect(rating.getByText("100% · 12/12 checks", { exact: true })).toBeVisible();
    await expect(rating.getByText("120.0%", { exact: true })).toBeVisible();
    await expect(rating.getByText("3/3 checked · 10 pending", { exact: true })).toBeVisible();
    await expect(rating.locator(".desk-gross-breakdown")).toContainText("$3,000");
    await expect(page.getByText("Strong approval", { exact: true })).toHaveCount(0);

    // Another unit cannot reuse the selected unit's confirmed cost.
    await page.getByRole("button", { name: "Jeep Grand Cherokee Limited", exact: true }).click();
    await expect(page.getByLabel("All-in unit cost ($)")).toHaveValue("");
    await expect(rating.getByText("Inputs needed.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Kia Telluride LX", exact: true }).click();
    await expect(page.getByLabel("All-in unit cost ($)")).toHaveValue("38000");

    const savedResponse = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/collections/saved_deals/records")
    );
    await page.getByRole("button", { name: "Save deal", exact: true }).click();
    const res = await savedResponse;
    expect(res.ok()).toBeTruthy();
    const saved = await res.json();
    try {
      expect(saved.vehicleData.assessment).toMatchObject({
        version: "rules-v1",
        readiness: 100,
        totalGross: 3000,
        profitTargetPercent: 120,
      });
      expect(saved.customerFilters).toMatchObject({ maxPayment: 900, monthlyDebt: 500 });
      expect(saved.dealData.profitInputs.allInUnitCosts[saved.vehicleData.vin]).toBe(38000);
      await page.getByRole("link", { name: /^Pipeline/ }).click();
      const row = page.getByRole("row", { name: `Deal for ${customer}` });
      await row.getByRole("button", { name: /^Show details/ }).click();
      await page.getByRole("button", { name: "Open in desk →", exact: true }).click();
      await expect(page.getByLabel("Customer", { exact: true })).toHaveValue(customer);
      await expect(page.getByLabel("Payment budget ($/mo)")).toHaveValue("900");
      await page.getByText("Set profit inputs", { exact: true }).click();
      await expect(page.getByLabel("All-in unit cost ($)")).toHaveValue("38000");
      await expect(rating.getByText("100% · 12/12 checks", { exact: true })).toBeVisible();
    } finally {
      const { token } = await loginViaApi(request, "admin");
      const cleanup = await request.delete(
        `${appBackendUrl()}/api/collections/saved_deals/records/${saved.id}`,
        { headers: { Authorization: token } }
      );
      expect(cleanup.ok()).toBeTruthy();
    }
  });

  for (const viewport of [
    { width: 1024, height: 650 },
    { width: 390, height: 844 },
  ]) {
    test(`detail tabs remain scrollable at ${viewport.width}×${viewport.height} in both themes`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize(viewport);
      await authenticateAs(page, request, "manager");
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await page.goto("/desk");
      await expect(
        page.getByRole("button", { name: "Kia Telluride LX", exact: true })
      ).toBeVisible();
      if (viewport.width < 901)
        await page.getByRole("button", { name: "View deal", exact: true }).click();
      for (let theme = 0; theme < 2; theme++) {
        for (const tab of ["Lenders", "Add-ons"]) {
          await page.getByRole("tab", { name: tab, exact: true }).click();
          await expect(
            page.getByRole("button", { name: "Save deal", exact: true })
          ).toBeInViewport();
        }
        await page.getByRole("tab", { name: "Matrix", exact: true }).click();
        const lastCell = page.getByRole("button", { name: /^96 months, \$5,000 down/ });
        await lastCell.scrollIntoViewIfNeeded();
        await expect(lastCell).toBeInViewport();
        const panel = page.locator(".desk-inspector");
        const dims = await panel.evaluate((el) => ({
          height: el.clientHeight,
          content: el.scrollHeight,
          overflow: getComputedStyle(el).overflowY,
        }));
        expect(dims.overflow).toBe("auto");
        await expect(page.getByRole("button", { name: "Save deal", exact: true })).toBeInViewport();
        // Short tabs can fit without scrolling; expanded analysis must still reach its last input.
        await page.getByRole("tab", { name: "Summary", exact: true }).click();
        await page.getByText("Why this rating", { exact: false }).click();
        await page.getByText("Set profit inputs", { exact: true }).click();
        const lastInput = page.getByLabel("Minimum total gross ($)");
        await lastInput.scrollIntoViewIfNeeded();
        await expect(lastInput).toBeInViewport();
        const scroll = await panel.evaluate((el) => ({
          height: el.clientHeight,
          content: el.scrollHeight,
          top: el.scrollTop,
        }));
        expect(scroll.content).toBeGreaterThan(scroll.height);
        expect(scroll.top).toBeGreaterThan(0);
        await expect(page.getByRole("button", { name: "Save deal", exact: true })).toBeInViewport();
        await page.getByText("Why this rating", { exact: false }).click();
        await page.getByText("Set profit inputs", { exact: true }).click();
        // Closing the drawer exposes the theme button without clicking behind a dialog.
        if (viewport.width < 901)
          await page
            .getByRole("dialog", { name: "Deal inspector" })
            .getByRole("button", { name: "Close deal inspector", exact: true })
            .click();
        await page.getByRole("button", { name: /Switch to (dark|light) theme/ }).click();
        if (viewport.width < 901)
          await page.getByRole("button", { name: "View deal", exact: true }).click();
      }
      expect(errors).toEqual([]);
    });
  }
});
