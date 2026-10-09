import { test, expect, type Page } from "@playwright/test";
import { authenticateAs } from "./fixtures/auth";
import { USE_REAL_BACKEND } from "./fixtures/backend";

/**
 * Pins the product's core state transition against the real seeded backend:
 * with no FICO/income on the desk every unit is PENDING (unknown, not failed);
 * entering FICO + income lets lenders fit or decline and units get ranked.
 *
 * Depends on the seed's lender split for Dealer A (tests/helpers/seed-test-db.ts
 * VERIFIED_FOR_DEALER_A): 3 verified programs that need a FICO and fit most of
 * the seeded inventory at FICO 720 / $6,500, and 10 sample programs that stay
 * pending by design until an admin verifies them.
 */

const REAL_BACKEND_SKIP_REASON =
  "Needs the seeded PocketBase stack (E2E_REAL_BACKEND=1 or USE_SEED_BACKEND=1); the mocked-auth run has no lender data.";

const SAMPLE_PROGRAMS = 10;

const PENDING_GAUGE = /Deal readiness \d+ of 100, Inputs needed/;
const RANKED_GAUGE = /Deal readiness \d+ of 100/;

async function openRoute(page: Page, route: string) {
  await page.goto(route);
  await page.locator('[role="status"][aria-busy="true"]').first().waitFor({
    state: "detached",
    timeout: 20000,
  });
  await expect(page.locator("main, [role='main']").first()).toBeVisible();
}

// In-app navigation keeps the desk's FICO and income; a full reload would not.
async function goInApp(page: Page, link: RegExp, screen: string) {
  await page.getByRole("link", { name: link }).first().click();
  await expect(page.locator(`[data-screen-label="${screen}"]`)).toBeVisible({ timeout: 20000 });
}

const gauge = (page: Page) => page.getByRole("img", { name: /^Deal readiness/ }).first();
const chips = (page: Page, text: string) => page.getByText(text, { exact: true });

async function enterCredit(page: Page) {
  await page.getByLabel("FICO", { exact: true }).fill("");
  await page.getByLabel("FICO", { exact: true }).fill("720");
  await page.getByLabel("Income / mo").fill("");
  await page.getByLabel("Income / mo").fill("6500");
  await page.getByRole("button", { name: "Trade, taxes & advanced inputs", exact: true }).click();
  await page.getByLabel("Monthly debt", { exact: true }).fill("500");
  await page.getByLabel("Vehicle condition", { exact: true }).selectOption("used");
  await page.getByRole("button", { name: "Trade, taxes & advanced inputs", exact: true }).click();
  await page.keyboard.press("Tab");
}

async function lenderPills(page: Page): Promise<string[]> {
  const rows = page.getByRole("row", { name: /program details/ });
  await expect(rows.first()).toBeVisible();
  const pills = await rows.evaluateAll((els) =>
    els.map((el) => {
      const cells = el.querySelectorAll('[role="cell"]');
      return (cells[cells.length - 1]?.textContent ?? "").trim();
    })
  );
  expect(pills.length).toBeGreaterThan(0);
  return pills;
}

test.describe("Pending vs ranked (real backend)", () => {
  test.beforeEach(async ({ page, request }) => {
    test.skip(!USE_REAL_BACKEND, REAL_BACKEND_SKIP_REASON);
    await authenticateAs(page, request, "sales");
  });

  test("a fresh desk holds every lender pending, not declined", async ({ page }) => {
    await openRoute(page, "/desk");

    await expect(gauge(page)).toHaveAccessibleName(PENDING_GAUGE);
    await expect(page.getByText("Inputs needed", { exact: true }).first()).toBeVisible();
    await expect(page.locator(".desk-fit-caption").first()).toHaveText(/0\/0 checked programs fit/);
    await page.getByRole("tab", { name: "Lenders", exact: true }).click();
    await expect(chips(page, "Pending").first()).toBeVisible();
    await expect(chips(page, "No fit")).toHaveCount(0);

    const firstRow = page
      .getByRole("table", { name: "Ranked inventory table" })
      .getByRole("row")
      .nth(1);
    // A dash on screen, the reason for screen readers (sr-only).
    await expect(firstRow.getByRole("cell").last()).toHaveText(/^\d+$/);

    await openRoute(page, "/lenders");
    for (const pill of await lenderPills(page)) {
      expect(["Needs FICO", "Needs income", "Verify sample"]).toContain(pill);
    }

    await openRoute(page, "/reports");
    await expect(page.getByText(/units are pending/)).toBeVisible();
  });

  test("entering FICO and income ranks the inventory", async ({ page }) => {
    await openRoute(page, "/desk");
    await enterCredit(page);

    await expect(gauge(page)).toHaveAccessibleName(RANKED_GAUGE);
    await expect(page.getByText("Strong approval")).toHaveCount(0);
    await expect(page.locator(".desk-fit-caption").first()).toHaveText(
      /\b[1-9]\d*\/\d+\s*checked programs fit/
    );
    await page.getByRole("tab", { name: "Lenders", exact: true }).click();
    await expect(chips(page, "Fit").first()).toBeVisible();

    await goInApp(page, /^Lenders/, "Lenders");
    const pills = await lenderPills(page);
    expect(pills).not.toContain("Needs FICO");
    expect(pills).not.toContain("Needs income");
    // Unverified samples stay pending whatever the deal — never a decline.
    expect(pills.filter((pill) => pill === "Verify sample")).toHaveLength(SAMPLE_PROGRAMS);

    await goInApp(page, /^Reports/, "Reports");
    const heading = page.getByText(/Readiness distribution — \d+ units?/).first();
    expect(await heading.innerText()).toMatch(/Readiness distribution — \d+ units?/);
  });

  test("clearing the FICO returns the desk to pending", async ({ page }) => {
    await openRoute(page, "/desk");
    await enterCredit(page);
    await expect(gauge(page)).toHaveAccessibleName(RANKED_GAUGE);

    await page.getByLabel("FICO", { exact: true }).fill("");
    await page.keyboard.press("Tab");

    await expect(gauge(page)).toHaveAccessibleName(PENDING_GAUGE);
    await expect(page.getByText("Inputs needed", { exact: true }).first()).toBeVisible();
  });
});
