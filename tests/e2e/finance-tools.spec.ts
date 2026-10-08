import { test, expect } from "@playwright/test";
import { authenticateAs, loginViaApi } from "./fixtures/auth";
import { appBackendUrl, USE_REAL_BACKEND } from "./fixtures/backend";

test("lender analytics receives the desk programs and holds incomplete credit inputs", async ({
  page,
  request,
}) => {
  test.skip(!USE_REAL_BACKEND, "Requires seeded lender programs.");
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  // The default verified fixtures have rules but no buy rates. Temporarily
  // add a synthetic rate to one checked program to exercise actual quotes.
  const { token } = await loginViaApi(request, "admin");
  const headers = { Authorization: token };
  const programs = await request.get(`${appBackendUrl()}/api/collections/lender_profiles/records`, {
    headers,
  });
  expect(programs.ok()).toBe(true);
  const program = (await programs.json()).items.find(
    (row: { name: string }) => row.name === "Lake Trust CU"
  );
  const recordUrl = `${appBackendUrl()}/api/collections/lender_profiles/records/${program.id}`;
  const updated = await request.patch(recordUrl, {
    headers,
    data: {
      tiers: program.tiers.map((tier: Record<string, unknown>) => ({
        ...tier,
        baseInterestRate: 8.25,
      })),
    },
  });
  expect(updated.ok()).toBe(true);
  try {
    await authenticateAs(page, request, "manager");
    await page.goto("/desk");
    await page.getByRole("button", { name: "Mercedes-Benz GLC 300", exact: true }).click();
    await page.getByRole("button", { name: "Finance tools", exact: true }).click();
    await page.getByRole("tab", { name: "Analytics", exact: true }).click();
    await expect(page.getByText("No checked lender quotes", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "The Desk", exact: true }).click();
    await expect(page).toHaveURL(/\/desk$/);
    await expect(page.getByLabel("FICO", { exact: true })).toBeVisible();
    await page.getByLabel("FICO", { exact: true }).fill("720");
    await page.getByLabel("Income / mo", { exact: true }).fill("6500");
    await page.getByRole("button", { name: "More filters", exact: true }).click();
    await page.getByLabel("Monthly debt", { exact: true }).fill("500");
    await page.getByLabel("Vehicle condition", { exact: true }).selectOption("used");
    await page.getByRole("button", { name: "More filters", exact: true }).click();
    await page.getByRole("button", { name: "Finance tools", exact: true }).click();
    await page.getByRole("tab", { name: "Analytics", exact: true }).click();
    await expect(page.getByText("Lake Trust CU", { exact: true })).toBeVisible();
    await expect(page.getByText("No checked lender quotes", { exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "The Desk", exact: true }).click();
    await expect(page).toHaveURL(/\/desk$/);
    await expect(page.getByLabel("FICO", { exact: true })).toBeVisible();
    await page.getByLabel("Interest rate (%)", { exact: true }).fill("");
    await page.getByRole("button", { name: "Finance tools", exact: true }).click();
    await page.getByRole("tab", { name: "Analytics", exact: true }).click();
    await expect(
      page.getByText("Enter an amount financed, interest rate and term to see loan costs.", {
        exact: true,
      })
    ).toBeVisible();
    expect(browserErrors).toEqual([]);
  } finally {
    const restored = await request.patch(recordUrl, { headers, data: { tiers: program.tiers } });
    expect(restored.ok()).toBe(true);
  }
});
