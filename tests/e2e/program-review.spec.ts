import { test, expect } from "@playwright/test";
import { authenticateAs, loginViaApi } from "./fixtures/auth";
import { appBackendUrl, USE_REAL_BACKEND } from "./fixtures/backend";

test.describe("Lender source review", () => {
  test.skip(!USE_REAL_BACKEND, "Requires disposable local PocketBase");

  test("an expired draft needs current source review, and that review persists after reload", async ({
    page,
    request,
  }) => {
    const auth = await loginViaApi(request, "admin");
    const headers = { Authorization: auth.token };
    const name = `Synthetic Source QA ${Date.now()}`;
    const records = `${appBackendUrl()}/api/collections/lender_profiles/records`;
    const created = await request.post(records, {
      headers,
      data: {
        dealer: auth.record.dealer,
        name,
        active: true,
        isSample: false,
        reviewRequired: true,
        sourceReference: "Synthetic QA program v1",
        expiresOn: "2000-01-01",
        bookValueSource: "Trade",
        tiers: [{ name: "Synthetic", minFico: 600, maxLtv: 200, maxTerm: 96 }],
      },
    });
    expect(created.ok()).toBeTruthy();
    const program = await created.json();
    try {
      await authenticateAs(page, request, "admin");
      await page.goto("/lenders");
      await page.getByRole("button", { name: `Show tiers for ${name}`, exact: true }).click();
      await page
        .getByRole("button", { name: `Edit full program for ${name}`, exact: true })
        .click();
      const modal = page.getByRole("dialog", { name: `Edit ${name}`, exact: true });
      await modal.getByRole("button", { name: "Mark program verified", exact: true }).click();
      await expect(modal.getByRole("alert")).toContainText("expired");
      await modal.getByLabel("Valid through (if specified)").fill("2099-12-31");
      await modal.getByRole("button", { name: "Mark program verified", exact: true }).click();
      await expect(modal.getByText(/Reviewed \d/)).toBeVisible();
      await modal.getByRole("button", { name: "Save program", exact: true }).click();
      await expect(modal).not.toBeVisible();
      await expect
        .poll(async () => {
          const response = await request.get(`${records}/${program.id}`, { headers });
          const record = await response.json();
          return {
            reviewRequired: record.reviewRequired,
            sourceReference: record.sourceReference,
            expiresOn: record.expiresOn,
            reviewed: !!record.verifiedAt,
          };
        })
        .toEqual({
          reviewRequired: false,
          sourceReference: "Synthetic QA program v1",
          expiresOn: "2099-12-31",
          reviewed: true,
        });
      await page.reload();
      await page.getByRole("button", { name: `Show tiers for ${name}`, exact: true }).click();
      await page
        .getByRole("button", { name: `Edit full program for ${name}`, exact: true })
        .click();
      await expect(modal.getByText(/Reviewed \d/)).toBeVisible();
      await modal.getByLabel("Source document / version").fill("Synthetic QA program v2");
      await expect(
        modal.getByRole("button", { name: "Mark program verified", exact: true })
      ).toBeVisible();
      await modal.getByRole("button", { name: "Save program", exact: true }).click();
      await expect
        .poll(
          async () =>
            (await (await request.get(`${records}/${program.id}`, { headers })).json())
              .reviewRequired
        )
        .toBe(true);
    } finally {
      const cleanup = await request.delete(`${records}/${program.id}`, { headers });
      expect(cleanup.ok()).toBeTruthy();
    }
  });
});
