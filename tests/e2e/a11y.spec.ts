import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page, type TestInfo } from "@playwright/test";

/**
 * Automated accessibility gate (axe-core) for LTV-Desking-PRO.
 *
 * Scans against WCAG 2.x Level A/AA rule sets and fails the build on any
 * "serious" or "critical" impact violation. Full violation payloads are
 * attached to the test report (testInfo.attach) so failures are debuggable
 * without re-running locally.
 *
 * Scope: the public login page only. The authenticated app routes
 * (/desk, /pipeline, /inventory, /lenders, /reports, /tools) require a
 * logged-in session, and this project has no reusable auth fixture or
 * storageState — tests/e2e/auth.spec.ts authenticates via ad-hoc route
 * mocking / addInitScript defined locally in that file (not exported), so
 * there is nothing to import here. Those routes are explicitly skipped
 * below with a reason rather than duplicating ~200 lines of mock setup or
 * silently scanning the (unauthenticated) login page under a different URL.
 *
 * See docs/ACCESSIBILITY.md for the conformance summary this gate backs.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const FAIL_IMPACTS = new Set(["serious", "critical"]);

const AUTHED_ROUTES = ["/desk", "/pipeline", "/inventory", "/lenders", "/reports", "/tools"];

const AUTH_SKIP_REASON =
  "No reusable auth fixture/storageState exists in this repo (auth.spec.ts wires up mocked " +
  "auth locally and does not export it) — skipping authenticated-route a11y scan until one is added.";

type ColorScheme = "light" | "dark";

async function setColorScheme(page: Page, scheme: ColorScheme) {
  await page.evaluate((mode) => {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, scheme);
}

async function runAxeScan(page: Page, testInfo: TestInfo, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  await testInfo.attach(`axe-violations-${label}.json`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: "application/json",
  });

  const blocking = results.violations.filter(
    (violation) => violation.impact && FAIL_IMPACTS.has(violation.impact)
  );

  expect(
    blocking,
    `Serious/critical WCAG violations on ${label}:\n${blocking
      .map((v) => `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
      .join("\n")}`
  ).toEqual([]);

  return results;
}

test.describe("Accessibility (axe-core, WCAG 2.2 AA)", () => {
  test.describe("Login page", () => {
    test("light mode has no serious/critical violations", async ({ page }, testInfo) => {
      await page.goto("/");
      await expect(page.getByText("SIGN IN")).toBeVisible();

      await runAxeScan(page, testInfo, "login-light");
    });

    test("dark mode has no serious/critical violations", async ({ page }, testInfo) => {
      await page.goto("/");
      await expect(page.getByText("SIGN IN")).toBeVisible();
      await setColorScheme(page, "dark");

      await runAxeScan(page, testInfo, "login-dark");
    });
  });

  test.describe("Authenticated app routes", () => {
    for (const route of AUTHED_ROUTES) {
      test(`${route} (light + dark) — skipped, no auth fixture`, async () => {
        test.skip(true, AUTH_SKIP_REASON);
      });
    }
  });
});
