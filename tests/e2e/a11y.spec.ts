import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { authenticateAs, type SeededRole } from "./fixtures/auth";

/**
 * Automated accessibility gate (axe-core) for LTV-Desking-PRO.
 *
 * Scans against WCAG 2.x Level A/AA rule sets and fails the build on any
 * "serious" or "critical" impact violation. Full violation payloads are
 * attached to the test report (testInfo.attach) so failures are debuggable
 * without re-running locally.
 *
 * Scope: the public login page (always) plus the authenticated app routes
 * (/desk, /pipeline, /inventory, /lenders, /reports, /tools as a sales user;
 * /lenders and /admin as an admin) when the real seeded backend is available
 * (E2E_REAL_BACKEND). Authentication goes through the PocketBase API via
 * tests/e2e/fixtures/auth.ts, not the login form.
 *
 * See docs/ACCESSIBILITY.md for the conformance summary this gate backs.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const FAIL_IMPACTS = new Set(["serious", "critical"]);

const SALES_ROUTES = ["/desk", "/pipeline", "/inventory", "/lenders", "/reports", "/tools"];

const ADMIN_ROUTES = ["/lenders", "/admin"];

// The API-login fixture (./fixtures/auth) only works against the seeded
// PocketBase stack; the mocked-auth run has no real session to scan with.
const AUTH_SKIP_REASON =
  "Authenticated-route scans need the seeded PocketBase stack (E2E_REAL_BACKEND=1).";

const USE_REAL_BACKEND = !!process.env.E2E_REAL_BACKEND;

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
    const cases: Array<{ role: SeededRole; routes: string[] }> = [
      { role: "sales", routes: SALES_ROUTES },
      { role: "admin", routes: ADMIN_ROUTES },
    ];

    for (const { role, routes } of cases) {
      for (const route of routes) {
        for (const scheme of ["light", "dark"] as const) {
          test(`${role} ${route} (${scheme}) has no serious/critical violations`, async ({
            page,
            request,
          }, testInfo) => {
            test.skip(!USE_REAL_BACKEND, AUTH_SKIP_REASON);

            await authenticateAs(page, request, role);
            await page.goto(route);
            await page.locator('[role="status"][aria-busy="true"]').first().waitFor({
              state: "detached",
              timeout: 20000,
            });
            await expect(page.locator("main, [role='main']").first()).toBeVisible();
            await setColorScheme(page, scheme);
            // Let lazy-route chunks settle and colour transitions (<=240ms,
            // see --transition-* in index.css) finish so axe samples final colours.
            await page.waitForTimeout(800);

            await runAxeScan(page, testInfo, `${role}-${route.slice(1)}-${scheme}`);
          });
        }
      }
    }
  });
});
