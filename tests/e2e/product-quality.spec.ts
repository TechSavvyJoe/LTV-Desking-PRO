import { test, expect } from "@playwright/test";
import { authenticateAs } from "./fixtures/auth";
import { USE_REAL_BACKEND } from "./fixtures/backend";

test.describe("Bounded product quality flows", () => {
  test.skip(!USE_REAL_BACKEND, "Uses only the isolated synthetic backend");
  test.use({ navigationTimeout: 90_000 });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== "passed") return;
    const screenshot = testInfo.outputPath("flow-success.png");
    await page.screenshot({ path: screenshot });
    await testInfo.attach("Successful changed flow", {
      path: screenshot,
      contentType: "image/png",
    });
  });

  test("finance tool edits are explicit and reserve contracts remain unknown", async ({
    page,
    request,
  }) => {
    await authenticateAs(page, request, "manager");
    await page.goto("/desk", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Kia Telluride LX", exact: true }).click();
    await page.getByLabel("Interest rate (%)", { exact: true }).fill("0");
    await page.getByRole("button", { name: "Finance tools", exact: true }).click();
    const source = page.getByRole("region", { name: "Calculator source" });
    await expect(source).toContainText("Copied from stock");
    for (const label of ["Buy rate (%)", "Sell rate (%)", "Split (%)", "Flat fee comparison (%)"]) {
      await expect(page.getByLabel(label, { exact: true })).toHaveValue("");
    }
    await page.getByRole("tab", { name: "Payment", exact: true }).click();
    const amount = page.getByLabel("Loan amount ($)", { exact: true });
    const copiedAmount = await amount.inputValue();
    await expect(page.getByLabel("Interest rate (%)", { exact: true })).toHaveValue("0");
    await amount.fill("9000");
    await expect(source).toContainText("Calculator inputs edited");
    await page.getByRole("button", { name: "Use current desk values", exact: true }).click();
    await expect(amount).toHaveValue(copiedAmount);
    await expect(source).toContainText("Using copied desk values");
    await page.getByRole("tab", { name: "Reserve", exact: true }).click();
    await expect(page.getByLabel("Buy rate (%)", { exact: true })).toHaveValue("");
    await expect(page.getByText("Higher", { exact: true })).toHaveCount(0);
  });

  test("hidden setup is recoverable from the account menu", async ({ page, request }) => {
    await authenticateAs(page, request, "admin");
    await page.goto("/desk", { waitUntil: "domcontentloaded" });
    const card = page.getByRole("region", { name: "Set up your dealership" });
    await expect(card).toBeVisible();
    await page.getByRole("button", { name: "Hide setup card" }).click();
    await expect(card).toHaveCount(0);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Setup checklist" }).click();
    await expect(card).toBeVisible();
    await expect(card.getByRole("progressbar", { name: "Setup progress" })).toBeVisible();
  });

  test("cash proposal applies and undoes without changing nominal rate or term", async ({
    page,
    request,
  }) => {
    await authenticateAs(page, request, "manager");
    await page.goto("/desk", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Kia Telluride LX", exact: true }).click();
    await page.getByLabel("Interest rate (%)", { exact: true }).fill("8.9");
    await page.getByRole("button", { name: "72 months", exact: true }).click();
    const down = page.getByLabel("Down ($)", { exact: true });
    await down.fill("1000");
    await page.getByLabel("Payment budget ($/mo)", { exact: true }).fill("600");
    const proposal = page.getByRole("region", { name: "Cash to payment ceiling" });
    await expect(proposal.getByText("Additional customer cash", { exact: true })).toBeVisible();
    await proposal.getByRole("button", { name: "Apply cash down", exact: true }).click();
    await expect(down).not.toHaveValue("1000");
    await expect(proposal).toContainText("within the entered ceiling");
    await expect(page.getByLabel("Interest rate (%)", { exact: true })).toHaveValue("8.9");
    await expect(page.getByRole("button", { name: "72 months", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await proposal.getByRole("button", { name: "Undo cash change", exact: true }).click();
    await expect(down).toHaveValue("1000");
    await expect(
      proposal.getByRole("button", { name: "Apply cash down", exact: true })
    ).toBeVisible();
  });

  test("phone inspector reaches the last matrix cell and preserves keyboard tab focus", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticateAs(page, request, "manager");
    await page.goto("/desk", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "View deal", exact: true }).click();
    const summary = page.getByRole("tab", { name: "Summary", exact: true });
    await summary.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Lenders", exact: true })).toBeFocused();
    await page.getByRole("tab", { name: "Matrix", exact: true }).click();
    const cell = page.getByRole("button", { name: /^96 months, \$5,000 down/ });
    await cell.scrollIntoViewIfNeeded();
    await expect(cell).toBeInViewport();
    await expect(page.getByRole("button", { name: "Save deal", exact: true })).toBeInViewport();
  });
});
