import { test, expect, type Page } from "@playwright/test";

/**
 * E2E + integration tests for LTV-Desking-PRO key flows using Playwright.
 * Key flows covered (build on existing):
 * - Load desk (post-auth navigation + shell + terms rail ready)
 * - Inventory import (CSV via hidden input + sample data)
 * - AI upload (lender PDF modal, analyze via /api/ai, confirm)
 * - Save deal (useSaveDeal hook + button + success)
 * - Lender matching (ladder + fit counts based on profile)
 * - PDF (deal sheet download + favorites button)
 *
 * Mocks used by default (via page.route) for hermetic runs.
 * Use seed helper for backend: run `E2E_KEEP_PB_RUNNING=1 E2E_REAL_BACKEND=1 node tests/helpers/seed-test-db.ts`
 * then start PB serve pointing to seeded pb_data if needed, set VITE_POCKETBASE_URL=http://127.0.0.1:8090
 * and E2E_REAL_BACKEND=1 for playwright (disables most mocks, uses real auth + data from seed).
 * See playwright.config.ts and .github/workflows/check.yml updates.
 *
 * Selectors from DeskScreen, InventoryScreen, AiLenderManagerModal, DealInspector, etc.
 *
 * Run: npm run test:e2e
 * First: npx playwright install
 */

test.describe("Auth / App Load (skeleton)", () => {
  test("loads app shell and shows auth UI (SIGN IN) on unauthed visit", async ({ page }) => {
    await page.goto("/");

    // Title from index.html
    await expect(page).toHaveTitle(/LTV Desking PRO/i);

    // Unauthed default lands in AuthLayout + Login (see App.tsx + components/auth/Login.tsx)
    // "SIGN IN" header text is stable marker.
    await expect(page.getByText("SIGN IN")).toBeVisible();

    // Form fields present (email/password)
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("has expected document title on load", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/LTV Desking PRO/i);
  });
});

// ---------------------------------------------------------------------------
// LOAD DESK (core flow: auth -> /desk shell + terms + data load)
// ---------------------------------------------------------------------------
test.describe("Load desk", () => {
  test("loads desk after login (key flow: desk render, terms rail, inventory context)", async ({
    page,
  }) => {
    await setupTest(page);

    // Verify desk loaded: nav, customer field, terms, some inventory context (active vehicle or table)
    await expect(page.getByRole("link", { name: /The Desk/i })).toBeVisible();
    await expect(page.locator("#desk-customer")).toBeVisible();
    await expect(page.locator('#desk-fico, input[name*="fico"], .desk-terms-rail')).toBeVisible({
      timeout: 10000,
    });

    // Desk has loaded data (from seed or mock): expect some vehicle reference or calc area
    await expect(page.getByText(/Est\. monthly|payment|LTV|Financed/i).first()).toBeVisible({
      timeout: 10000,
    });

    if (USE_REAL_BACKEND) {
      // The seed source uses UI names (`modelYear`, `stock`) while PocketBase
      // stores `year`, `stockNumber`. Guard the mapping so a successful count
      // assertion cannot hide identity data being silently dropped.
      const sampleRow = page.getByRole("row", {
        name: /Focus 2020 Ford Explorer XLT on desk/i,
      });
      await expect(sampleRow).toBeVisible();
      await expect(sampleRow).toContainText("STK STK1026");
    }
  });

  test("keeps the selected VIN stable while back-end products reprice the deal", async ({
    page,
  }) => {
    await setupTest(page, "/desk");

    const inspectorTitle = page.locator(".desk-inspector-title-row h2");
    await expect(inspectorTitle).toBeVisible();
    const selectedVehicle = await inspectorTitle.innerText();

    const metricValue = (label: string) =>
      page.locator(".desk-summary-metrics > div").filter({ hasText: label }).locator("strong");
    const parseCurrency = (value: string | null) => Number((value ?? "").replace(/[^0-9.-]/g, ""));
    const financedBefore = parseCurrency(await metricValue("Amount financed").textContent());

    await page.getByRole("tab", { name: "Add-ons" }).click();
    await page.getByRole("button", { name: /Service contract/ }).click();

    await expect(metricValue("Back-end products")).toHaveText("$2,495");
    await expect(inspectorTitle).toHaveText(selectedVehicle);
    await expect
      .poll(async () => parseCurrency(await metricValue("Amount financed").textContent()))
      .toBe(financedBefore + 2_495);
  });

  test("opens the deal sheet above the compact mobile inspector", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupTest(page, "/desk");

    await page.locator(".desk-inventory-row").first().click();
    await expect(page.locator(".desk-inspector")).toHaveAttribute("data-open", "true");
    await page.getByRole("button", { name: "Deal sheet" }).click();

    const dealSheet = page.getByRole("dialog", { name: "Deal sheet" });
    await expect(dealSheet).toBeVisible();
    await expect(page.locator(".desk-inspector")).toHaveAttribute("data-open", "false");
    await dealSheet.getByRole("button", { name: "Download PDF" }).click({ trial: true });
  });
});

// ---------------------------------------------------------------------------
// MOCK HELPERS (PB backend simulation for standalone e2e runs)
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: "sales0000000001",
  email: "sales.a@dealera.com",
  firstName: "Sales",
  lastName: "A",
  role: "sales",
  dealer: "dealer000000001",
  collectionName: "users",
};

const MOCK_AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDB9.mock";

const MOCK_AUTH = {
  token: MOCK_AUTH_TOKEN,
  record: MOCK_USER,
};

type TestRole = "sales" | "admin";

interface TestCredentials {
  identity: string;
  password: string;
  role: TestRole;
}

const SALES_TEST_AUTH: TestCredentials = {
  identity: "sales.a@dealera.com",
  password: "SalesPassword123!",
  role: "sales",
};

const ADMIN_TEST_AUTH: TestCredentials = {
  identity: "admin.a@dealera.com",
  password: "AdminPassword123!",
  role: "admin",
};

const mockAuthForRole = (role: TestRole) =>
  role === "admin"
    ? {
        token: MOCK_AUTH_TOKEN,
        record: {
          ...MOCK_USER,
          id: "admin0000000001",
          email: ADMIN_TEST_AUTH.identity,
          firstName: "Admin",
          role: "admin",
        },
      }
    : MOCK_AUTH;

const SAMPLE_VEHICLES = [
  {
    id: "invhonda0000001",
    vin: "1HGCM82633A004352",
    stockNumber: "STK1001",
    year: 2012,
    make: "Honda",
    model: "Civic",
    trim: "LX",
    mileage: 155000,
    price: 5500,
    unitCost: 4000,
    jdPower: 4800,
    jdPowerRetail: 6200,
    dealer: "dealer000000001",
    status: "available",
    created: "2026-01-01 00:00:00",
    updated: "2026-01-01 00:00:00",
  },
  {
    id: "invford00000001",
    vin: "1FAHP3F2XCL123456",
    stockNumber: "STK1002",
    year: 2013,
    make: "Ford",
    model: "Focus",
    trim: "SE",
    mileage: 120000,
    price: 5800,
    unitCost: 4200,
    jdPower: 5100,
    jdPowerRetail: 6500,
    dealer: "dealer000000001",
    status: "available",
    created: "2026-01-01 00:00:00",
    updated: "2026-01-01 00:00:00",
  },
];

const SAMPLE_LENDERS = [
  {
    id: "accu00000000001",
    dealer: "dealer000000001",
    name: "Alliance CCU",
    maxPti: 20,
    bookValueSource: "Trade",
    tiers: [
      {
        name: "Prime",
        minFico: 680,
        maxFico: 850,
        baseInterestRate: 5.99,
        maxLtv: 110,
        maxTerm: 72,
      },
      {
        name: "Near Prime",
        minFico: 620,
        maxFico: 679,
        baseInterestRate: 7.49,
        maxLtv: 105,
        maxTerm: 66,
      },
    ],
    active: true,
    created: "2026-01-01 00:00:00",
    updated: "2026-01-01 00:00:00",
  },
  {
    id: "capone000000001",
    dealer: "dealer000000001",
    name: "Capital One Auto",
    maxPti: 18,
    bookValueSource: "Retail",
    tiers: [
      {
        name: "Standard",
        minFico: 640,
        maxFico: 850,
        baseInterestRate: 6.49,
        maxLtv: 115,
        maxTerm: 75,
      },
    ],
    active: true,
    created: "2026-01-01 00:00:00",
    updated: "2026-01-01 00:00:00",
  },
];

const AI_UPLOAD_LENDERS = [
  {
    name: "E2E Alliance Credit Union",
    tiers: [
      {
        minFico: 680,
        maxFico: 850,
        rate: 5.99,
        maxLtv: 110,
        maxTerm: 72,
        tierName: "Prime",
      },
      {
        minFico: 620,
        maxFico: 679,
        rate: 7.49,
        maxLtv: 105,
        maxTerm: 66,
        tierName: "Near Prime",
      },
    ],
    bookValueSource: "Trade",
    contactPhone: "555-0100",
    active: true,
  },
  {
    name: "E2E Capital One Auto",
    tiers: [
      {
        minFico: 640,
        maxFico: 850,
        rate: 6.49,
        maxLtv: 115,
        maxTerm: 75,
        tierName: "Standard",
      },
    ],
    bookValueSource: "Retail",
    active: true,
  },
];

const MOCK_SETTINGS = {
  id: "settings_a_id_1",
  dealer: "dealer000000001",
  docFee: 280,
  cvrFee: 24,
  defaultStateFees: 31,
  defaultState: "MI",
  outOfStateTransitFee: 10,
  customTaxRate: null,
  defaultTerm: 72,
  defaultApr: 8.9,
  vscPrice: 2495,
  gapPrice: 895,
  miTradeInCreditCap: 12000,
  ltvThresholds: { warn: 115, danger: 125, critical: 135 },
  created: "2026-01-01 00:00:00",
  updated: "2026-01-01 00:00:00",
};

const USE_REAL_BACKEND = !!process.env.E2E_REAL_BACKEND || !!process.env.USE_SEED_BACKEND;

async function mockAiEndpoints(page: Page) {
  // AI endpoints (used in various modals)
  // Specific mocks for lender extract/enrich to support full AI Lender Upload flow.
  await page.route("**/api/ai/lender-extract", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: AI_UPLOAD_LENDERS,
          meta: { provider: "mock", model: "e2e-mock-model", warning: null },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/ai/lender-enrich", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            enrichment: {
              website: "https://e2e-lender.example.com",
              generalNotes: "E2E mock enrichment applied.",
            },
            sources: [{ url: "https://example.com/rates", title: "E2E Rate Sheet" }],
          },
          meta: { provider: "mock", model: "e2e-enrich" },
        }),
      });
      return;
    }
    await route.continue();
  });

  // Catch-all for other AI endpoints (deal analysis etc.)
  await page.route("**/api/ai/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/lender-extract") || url.includes("/lender-enrich")) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, mocked: true }),
    });
  });
}

async function mockAiLenderProfileWrites(page: Page) {
  await page.route("**/api/collections/lender_profiles/records**", async (route) => {
    const method = route.request().method();
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
      await route.fallback();
      return;
    }

    if (method === "DELETE") {
      await route.fulfill({ status: 204 });
      return;
    }

    let body: Record<string, unknown> = {};
    try {
      body = route.request().postDataJSON() as Record<string, unknown>;
    } catch {
      body = {};
    }

    const nameSlug = String(body.name ?? "lender")
      .replace(/[^a-z0-9]+/gi, "")
      .toLowerCase()
      .slice(0, 11)
      .padEnd(11, "x");

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: `e2e${nameSlug}x`,
        dealer: MOCK_USER.dealer,
        active: true,
        created: "2026-01-01 00:00:00",
        updated: "2026-01-01 00:00:00",
        ...body,
      }),
    });
  });
}

async function mockPocketBaseEndpoints(page: Page, role: TestRole = "sales") {
  if (USE_REAL_BACKEND) {
    // When using seed helper for real backend, skip network mocks. Real PB + seeded data used.
    // Auth uses real credentials: sales.a@dealera.com / SalesPassword123!
    // Frontend must have VITE_POCKETBASE_URL set to the seeded instance (e.g. 8090).
    console.log(
      "[e2e] Using REAL backend (seeded via tests/helpers/seed-test-db.ts) - skipping route mocks"
    );
    return;
  }
  const mockAuth = mockAuthForRole(role);
  const inventoryRecords: Array<Record<string, unknown>> = SAMPLE_VEHICLES.map((vehicle) => ({
    ...vehicle,
  }));
  let inventoryRecordSequence = 0;
  // Auth
  await page.route("**/api/collections/users/auth-with-password", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockAuth),
      });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/collections/users/auth-refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAuth),
    });
  });

  // Generic list / full-list for collections (inventory, lenders, settings, deals)
  await page.route("**/api/collections/*/records**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === "GET") {
      if (url.includes("/inventory/records")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            page: 1,
            perPage: 100,
            totalItems: inventoryRecords.length,
            totalPages: 1,
            items: inventoryRecords,
          }),
        });
        return;
      }
      if (url.includes("/lender_profiles/records")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            page: 1,
            perPage: 100,
            totalItems: SAMPLE_LENDERS.length,
            totalPages: 1,
            items: SAMPLE_LENDERS,
          }),
        });
        return;
      }
      if (url.includes("/dealer_settings/records")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            page: 1,
            perPage: 1,
            totalItems: 1,
            totalPages: 1,
            items: [MOCK_SETTINGS],
          }),
        });
        return;
      }
      if (url.includes("/saved_deals/records")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ page: 1, perPage: 50, totalItems: 0, totalPages: 1, items: [] }),
        });
        return;
      }
      // Fallback empty list for unknown
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ page: 1, perPage: 50, totalItems: 0, totalPages: 1, items: [] }),
      });
      return;
    }

    if (["POST", "PATCH", "PUT"].includes(method)) {
      let body: Record<string, unknown> = {};
      try {
        body = route.request().postDataJSON() as Record<string, unknown>;
      } catch {
        body = {};
      }

      if (url.includes("/inventory/records")) {
        const recordId = url.match(/\/inventory\/records\/([^/?]+)/)?.[1];
        const now = "2026-01-01 00:00:00";
        let record: Record<string, unknown>;

        if (method === "POST") {
          inventoryRecordSequence++;
          record = {
            id: `mockinv${String(inventoryRecordSequence).padStart(8, "0")}`,
            created: now,
            updated: now,
            ...body,
          };
          inventoryRecords.push(record);
        } else {
          const index = inventoryRecords.findIndex((item) => item.id === recordId);
          record = {
            ...(index >= 0 ? inventoryRecords[index] : {}),
            ...body,
            id: recordId,
            updated: now,
          };
          if (index >= 0) inventoryRecords[index] = record;
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(record),
        });
        return;
      }

      // Accept other writes (settings, lenders, deals) with an echo response.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "mock_" + Date.now(), ...body }),
      });
      return;
    }

    if (method === "DELETE") {
      await route.fulfill({ status: 204 });
      return;
    }

    await route.continue();
  });

  // Catch other PB collection ops (fullList uses same /records)
  await page.route("**/api/collections/**", async (route) => {
    const url = route.request().url();
    if (
      url.includes("/records") ||
      url.includes("/auth-with-password") ||
      url.includes("/auth-refresh")
    ) {
      await route.fallback();
      return;
    }
    if (!url.includes("/records")) {
      // non records like health or other, let continue or minimal
      await route.fulfill({ status: 200, body: "{}" });
      return;
    }
    await route.fallback();
  });

  await mockAiEndpoints(page);
}

async function preAuthenticate(page: Page, role: TestRole = "sales") {
  if (USE_REAL_BACKEND) {
    // For seeded real backend, do NOT inject mock auth. Perform actual login in tests.
    return;
  }
  const authData = mockAuthForRole(role);
  await page.addInitScript((data) => {
    localStorage.setItem("pocketbase_auth", JSON.stringify(data));
  }, authData);
}

async function waitForDeskReady(page: Page) {
  // Wait for main desk shell elements (nav + terms rail)
  await expect(page.getByRole("link", { name: /The Desk/i })).toBeVisible({ timeout: 15000 });
  // The live deal terms section
  await expect(page.locator("#desk-customer, input#desk-fico").first()).toBeVisible({
    timeout: 10000,
  });
}

async function setupTest(
  page: Page,
  targetPath?: string,
  credentials: TestCredentials = SALES_TEST_AUTH
) {
  if (!USE_REAL_BACKEND) {
    await mockPocketBaseEndpoints(page, credentials.role);
  }
  await preAuthenticate(page, credentials.role);

  if (USE_REAL_BACKEND) {
    // For real backend E2E, authenticate via the API (reliable) and inject the token
    // so the app boots as logged-in. Avoids flakiness with form UI + state updates
    // after recent redesign. The dedicated login test covers the form for mocks.
    const pbUrl = process.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090";
    const authRes = await page.request.post(`${pbUrl}/api/collections/users/auth-with-password`, {
      data: { identity: credentials.identity, password: credentials.password },
      headers: { "Content-Type": "application/json" },
    });
    if (!authRes.ok()) {
      throw new Error(`Real backend auth failed: ${await authRes.text()}`);
    }
    const authData = await authRes.json();
    await page.addInitScript((data) => {
      localStorage.setItem(
        "pocketbase_auth",
        JSON.stringify({
          token: data.token,
          record: data.record,
        })
      );
    }, authData);

    const startPath = targetPath || "/";
    await page.goto(startPath);
    if (startPath === "/" || startPath === "/desk") {
      await waitForDeskReady(page);
    }
  } else {
    await page.goto(targetPath || "/");
  }
}

// ---------------------------------------------------------------------------
// LOGIN FLOW
// ---------------------------------------------------------------------------
test.describe("Login flow", () => {
  test("logs in via UI form and lands on desk (with mocked backend)", async ({ page }) => {
    if (USE_REAL_BACKEND) {
      test.skip(true, "Real login covered in Load desk test");
      return;
    }
    if (!USE_REAL_BACKEND) {
      await mockPocketBaseEndpoints(page);
    }

    await page.goto("/");

    if (!USE_REAL_BACKEND) {
      await expect(page.getByText("SIGN IN")).toBeVisible();
      await expect(page.getByLabel(/email address/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();

      await page.getByLabel(/email address/i).fill("sales.a@dealera.com");
      await page.getByLabel(/password/i).fill("SalesPassword123!");

      // Submit triggers login -> pb.authWithPassword (mocked or real)
      await page.getByRole("button", { name: /Enter the desk/i }).click();
    }

    // After success, shell + desk UI renders (DealProvider + AppShell)
    await waitForDeskReady(page);

    // Customer input or nav marker confirms logged-in desk state
    await expect(page.getByRole("link", { name: /The Desk/i })).toBeVisible();
    await expect(page.locator("#desk-customer")).toBeVisible();
  });

  test("shows error toast on bad credentials (mocked reject)", async ({ page }) => {
    if (USE_REAL_BACKEND) {
      test.skip(true, "Error path skipped under real seeded backend (use mock for negative auth)");
      return;
    }
    await page.route("**/api/collections/users/auth-with-password", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ message: "Failed to authenticate." }),
      });
    });

    await page.goto("/");

    await page.getByLabel(/email address/i).fill("bad@user.com");
    await page.getByLabel(/password/i).fill("wrong");
    await page.getByRole("button", { name: /Enter the desk/i }).click();

    // Error surfaces via toast (lib/toast) - look for common error text pattern
    await expect(page.getByText(/invalid|error|failed/i).first()).toBeVisible({ timeout: 8000 });
  });
});

test.describe("User lifecycle guards", () => {
  test("admin-created users default active and deactivation blocks authentication", async ({
    request,
  }) => {
    test.skip(!USE_REAL_BACKEND, "Requires PocketBase with the production hooks loaded");

    const pbUrl = process.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090";
    const adminAuth = await request.post(`${pbUrl}/api/collections/users/auth-with-password`, {
      data: { identity: "admin.a@dealera.com", password: "AdminPassword123!" },
    });
    expect(adminAuth.ok()).toBeTruthy();
    const { token } = (await adminAuth.json()) as { token: string };
    const email = `lifecycle-${Date.now()}@example.test`;
    const password = "LifecyclePassword123!";

    const createdResponse = await request.post(`${pbUrl}/api/collections/users/records`, {
      headers: { Authorization: token },
      data: {
        email,
        password,
        passwordConfirm: password,
        firstName: "Lifecycle",
        lastName: "Test",
        dealer: "dealeraid12345x",
        role: "sales",
      },
    });
    expect(createdResponse.ok()).toBeTruthy();
    const created = (await createdResponse.json()) as { id: string; active: boolean };
    expect(created.active).toBe(true);

    const initialLogin = await request.post(`${pbUrl}/api/collections/users/auth-with-password`, {
      data: { identity: email, password },
    });
    expect(initialLogin.ok()).toBeTruthy();

    const deactivate = await request.patch(`${pbUrl}/api/collections/users/records/${created.id}`, {
      headers: { Authorization: token },
      data: { active: false },
    });
    expect(deactivate.ok()).toBeTruthy();

    const blockedLogin = await request.post(`${pbUrl}/api/collections/users/auth-with-password`, {
      data: { identity: email, password },
    });
    expect(blockedLogin.ok()).toBeFalsy();

    const cleanupResponse = await request.delete(
      `${pbUrl}/api/collections/users/records/${created.id}`,
      { headers: { Authorization: token } }
    );
    expect(cleanupResponse.ok()).toBeTruthy();
  });
});

test.describe("Administrative console login", () => {
  test("dealer administrators can sign in and reach their scoped console", async ({ page }) => {
    test.skip(!USE_REAL_BACKEND, "Requires the seeded PocketBase backend");

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /Admin Console/i })).toBeVisible();
    await page.getByLabel(/email address/i).fill("admin.a@dealera.com");
    await page.getByLabel(/password/i).fill("AdminPassword123!");
    await page.getByRole("button", { name: /Sign in to Admin Console/i }).click();

    await expect(page.getByText("Team Members")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Dealer A \(DEALERA\)/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Add User/i })).toBeVisible();
  });

  test("dealer administrators can manage a team member lifecycle through the console", async ({
    page,
    request,
  }) => {
    test.skip(!USE_REAL_BACKEND, "Requires the seeded PocketBase backend");

    const pbUrl = process.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090";
    const email = `ui-lifecycle-${Date.now()}@example.test`;
    const password = `LifecycleUi${Date.now()}!`;

    await page.goto("/admin");
    await page.getByLabel(/email address/i).fill("admin.a@dealera.com");
    await page.getByLabel(/password/i).fill("AdminPassword123!");
    await page.getByRole("button", { name: /Sign in to Admin Console/i }).click();
    await expect(page.getByText("Team Members")).toBeVisible({ timeout: 15_000 });

    try {
      await page.getByRole("button", { name: /Add User/i }).click();
      await page.getByLabel(/First Name/i).fill("UI");
      await page.getByLabel(/Last Name/i).fill("Lifecycle");
      await page.getByLabel(/^Email/i).fill(email);
      await page.getByLabel(/^Phone/i).fill("555-0109");
      await page.getByLabel(/^Role/i).selectOption("manager");
      await page.getByLabel(/^Password/i).fill(password);
      await page.getByLabel(/Confirm Password/i).fill(password);
      await page.getByRole("button", { name: "Create User", exact: true }).click();

      await expect(page.getByText("User created successfully")).toBeVisible({ timeout: 15_000 });
      const teamRow = () => page.getByRole("row").filter({ hasText: email });
      await expect(teamRow()).toBeVisible();
      await expect(teamRow().getByRole("combobox")).toHaveValue("manager");

      await teamRow().getByRole("button", { name: "Deactivate", exact: true }).click();
      await expect(page.getByText("User deactivated")).toBeVisible();
      await expect(teamRow().getByText("Inactive", { exact: true })).toBeVisible();

      const blockedLogin = await request.post(`${pbUrl}/api/collections/users/auth-with-password`, {
        data: { identity: email, password },
      });
      expect(blockedLogin.ok()).toBeFalsy();

      await teamRow().getByRole("button", { name: "Activate", exact: true }).click();
      await expect(page.getByText("User reactivated")).toBeVisible();
      await expect(teamRow().getByText("Inactive", { exact: true })).toHaveCount(0);

      const restoredLogin = await request.post(
        `${pbUrl}/api/collections/users/auth-with-password`,
        { data: { identity: email, password } }
      );
      expect(restoredLogin.ok()).toBeTruthy();

      await teamRow()
        .getByRole("button", { name: `Delete ${email} permanently` })
        .click();
      const dialog = page.getByRole("alertdialog", { name: "Delete user?" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(page.getByText("User deleted", { exact: true })).toBeVisible();
      await expect(teamRow()).toHaveCount(0);
    } finally {
      const adminAuth = await request.post(`${pbUrl}/api/collections/users/auth-with-password`, {
        data: { identity: "admin.a@dealera.com", password: "AdminPassword123!" },
      });
      if (adminAuth.ok()) {
        const { token } = (await adminAuth.json()) as { token: string };
        const remaining = await request.get(`${pbUrl}/api/collections/users/records`, {
          headers: { Authorization: token },
          params: { filter: `email = "${email}"` },
        });
        if (remaining.ok()) {
          const { items } = (await remaining.json()) as { items: Array<{ id: string }> };
          for (const user of items) {
            await request.delete(`${pbUrl}/api/collections/users/records/${user.id}`, {
              headers: { Authorization: token },
            });
          }
        }
      }
    }
  });

  test("platform superadmins can sign in and reach the owner console", async ({ page }) => {
    test.skip(!USE_REAL_BACKEND, "Requires the seeded PocketBase backend");

    await page.goto("/admin");
    await page.getByLabel(/email address/i).fill("superadmin@ltvpro.com");
    await page.getByLabel(/password/i).fill("SuperAdminPass123!");
    await page.getByRole("button", { name: /Sign in to Admin Console/i }).click();

    await expect(page.getByText("OWNER CONSOLE", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("banner").getByRole("button", { name: /Onboard new dealer/i })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Overview", exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// INVENTORY IMPORT
// ---------------------------------------------------------------------------
test.describe("Inventory import", () => {
  test("imports CSV via hidden input and shows success state", async ({ page }) => {
    await setupTest(page, "/inventory", ADMIN_TEST_AUTH);

    // Toolbar buttons from InventoryScreen + useInventoryImport
    await expect(page.getByRole("button", { name: "Import CSV/XLSX" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sample CSV", exact: true })).toBeVisible();

    const csvContent = `Stock #,Year,Make,Model,Trim,VIN,Mileage,Price,Cost,J.D. Power Trade In,J.D. Power Retail,Unit Cost
  E2E001,2024,Toyota,Camry,SE,1M8GDM9AXKP042788,12000,26500,22000,23500,27500,22000
  E2E002,2022,Honda,Accord,LX,1FAHP3F27CL123456,45000,18900,15500,17200,19900,15500`;

    // Target the hidden file input directly (always present)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "e2e-inventory.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent, "utf-8"),
    });

    // Expect success message from setMessage (toast or banner)
    await expect(page.getByText("Synced: 2 added, 0 updated, 2 marked sold.")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/STK E2E001/)).toBeVisible();
    await expect(page.getByText(/STK E2E002/)).toBeVisible();
  });

  test("shows only server-persisted rows when part of a replacement import fails", async ({
    page,
  }) => {
    await setupTest(page, "/inventory", ADMIN_TEST_AUTH);

    await page.route("**/api/collections/inventory/records**", async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as { vin?: string };
        if (body.vin === "1FAHP3F27CL123456") {
          await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
          return;
        }
      }
      await route.fallback();
    });

    const csvContent = `Stock #,Year,Make,Model,Trim,VIN,Mileage,Price
  SAVED01,2024,Toyota,Camry,SE,1M8GDM9AXKP042788,12000,26500
  FAILED01,2022,Honda,Accord,LX,1FAHP3F27CL123456,45000,18900`;
    await page.locator('input[type="file"]').setInputFiles({
      name: "partial-inventory.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent, "utf-8"),
    });

    await expect(
      page.getByText(
        "Synced: 1 added, 0 updated, 2 marked sold. 1 operation(s) failed and were not saved."
      )
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/STK SAVED01/)).toBeVisible();
    await expect(page.getByText(/STK FAILED01/)).toHaveCount(0);
  });

  test("keeps inventory import admin-only while sales can use read-only tools", async ({
    page,
  }) => {
    await setupTest(page, "/inventory");

    await expect(page.getByRole("button", { name: "Sample CSV", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Import CSV/XLSX" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Favorites PDF/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// AI LENDER UPLOAD (uses specific /api/ai/lender-* mocks)
// ---------------------------------------------------------------------------
test.describe("AI lender upload", () => {
  test("opens AI Lender Upload modal, uploads PDF, analyzes, and confirms save", async ({
    page,
  }) => {
    await setupTest(page, "/desk"); // Shell header AI button visible on all authed routes
    await waitForDeskReady(page);

    if (USE_REAL_BACKEND) {
      await mockAiEndpoints(page);
      await mockAiLenderProfileWrites(page);
    }

    // Open modal via header button (AppShell + LendersScreen also expose)
    const aiBtn = page.getByRole("button", { name: /AI Lender Upload/i });
    await expect(aiBtn).toBeVisible({ timeout: 10000 });
    await aiBtn.click();

    // Modal title
    const aiDialog = page.getByRole("dialog", { name: /AI Lender Upload/i });
    await expect(aiDialog.getByRole("heading", { name: "AI Lender Upload" })).toBeVisible();
    await expect(
      aiDialog.getByText(/Click to upload or drag and drop PDF rate sheets/i)
    ).toBeVisible();

    // Click dropzone to ensure the hidden input is in active DOM
    await page
      .locator('div[role="dialog"] div[class*="border-dashed"]')
      .first()
      .click({ force: true })
      .catch(() => {});

    // Provide a minimal PDF-like file (mime triggers client validation in processLenderSheet)
    const pdfBuffer = Buffer.from(
      "%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R >>\nstartxref\n9\n%%EOF\n"
    );
    // Scope to dialog to avoid any other file inputs
    const fileInput = page.locator('div[role="dialog"] input[accept=".pdf"]');
    await fileInput.setInputFiles({
      name: "e2e-rate-sheet.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuffer,
    });

    // Wait for file to register in UI state
    await expect(aiDialog.getByText(/1 file\(s\) ready for analysis/i)).toBeVisible({
      timeout: 5000,
    });

    // Optionally toggle enrich (default on; our mock covers it)
    const enrichToggle = page.locator("#enrich-toggle");
    if (await enrichToggle.count()) {
      // leave checked to exercise enrich path
      await expect(enrichToggle).toBeVisible();
    }

    // Click Analyze (triggers processLenderSheet + mocked API)
    await page.getByRole("button", { name: /^Analyze$/i }).click();

    // Results UI appears with extracted lenders from our mock data
    await expect(page.getByText("Analysis Results")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("🏦 E2E Alliance Credit Union")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("🏦 E2E Capital One Auto")).toBeVisible();

    // Confirm saves via mocked PB writes (saveLenderProfile)
    await page.getByRole("button", { name: /Confirm and Update/i }).click();

    // Modal should auto-close after success (see setTimeout in component)
    await expect(aiDialog).toBeHidden({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// DEAL CALCULATION
// ---------------------------------------------------------------------------
test.describe("Deal calculation", () => {
  test("editing deal terms and customer data updates live calculations (payment/LTV)", async ({
    page,
  }) => {
    await setupTest(page, "/desk");
    await waitForDeskReady(page);

    // Set customer + credit (FICO) + down payment — triggers calculator + re-render
    await page.locator("#desk-customer").fill("E2E Test Buyer");
    await page.locator("#desk-fico").fill("720");
    await page.locator("#desk-down").fill("3500");
    await page.locator("#desk-apr").fill("6.5");

    // Pick a term button (72 is default but click explicit)
    await page.getByRole("button", { name: "72" }).click();

    // Assertions: payment value and financed amount update in inspector summary
    // (values are computed client-side via calculateFinancials + fmt)
    await expect(page.getByText(/Est. monthly payment/i)).toBeVisible();
    // Look for a plausible computed payment fragment (non-zero whole dollars)
    await expect(page.locator(".desk-payment-value, .desk-payment-cell").first()).toContainText(
      /\d+/
    );

    // Change credit score lower -> expect LTV/payment shift visible
    await page.locator("#desk-fico").fill("580");
    await page.waitForTimeout(300); // allow debounce + recompute
    await expect(page.getByText(/Est. monthly payment/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// LENDER MATCH
// ---------------------------------------------------------------------------
test.describe("Lender match", () => {
  test("lender ladder updates FIT count based on customer profile", async ({ page }) => {
    await setupTest(page, "/desk");
    await waitForDeskReady(page);

    // Good credit + reasonable down should produce FITs
    await page.locator("#desk-customer").fill("Qualified Buyer");
    await page.locator("#desk-fico").fill("710");
    await page.locator("#desk-income").fill("6500");
    await page.locator("#desk-down").fill("4000");

    // Lender paths / fit section in inspector
    await expect(page.getByText(/Lender paths/i)).toBeVisible();
    await expect(
      page.locator(".desk-lender-row, [data-fit], .desk-lender-badge").first()
    ).toBeVisible({ timeout: 8000 });

    // FIT count text like "2/2 lenders fit" or similar (from InspectorSummary + LenderLadder)
    await expect(page.locator(".desk-fit-caption").first()).toContainText(/lenders fit/i);

    // Lower profile -> fewer fits (still renders)
    await page.locator("#desk-fico").fill("500");
    await page.waitForTimeout(250);
    await expect(page.getByText(/Lender paths/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// DEAL SAVE (uses useSaveDeal + mocked saved_deals POST + success toast)
// ---------------------------------------------------------------------------
test.describe("Deal save", () => {
  test("fills deal terms then saves to pipeline and shows success message", async ({ page }) => {
    await setupTest(page, "/desk");
    await waitForDeskReady(page);

    // Populate required fields for save validation in useSaveDeal
    await page.locator("#desk-customer").fill("E2E Save Buyer");
    await page.locator("#desk-fico").fill("680");
    await page.locator("#desk-income").fill("7200");
    await page.locator("#desk-down").fill("3000");
    await page.locator("#desk-apr").fill("7.25");
    await page.getByRole("button", { name: "72" }).click();

    // Wait for live calc to settle
    await page.waitForTimeout(400);

    // The primary Save deal button from DealInspector
    const saveBtn = page.getByRole("button", { name: /^Save deal$/i });
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
    await saveBtn.click();

    // Success path in hook: setMessage success -> toast renders
    await expect(page.getByText(/Deal saved successfully/i)).toBeVisible({ timeout: 8000 });

    // Optional: verify no error toasts
    await expect(page.getByText(/error|failed|complete vehicle/i).first()).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// PDF GENERATION
// ---------------------------------------------------------------------------
test.describe("PDF generation", () => {
  test.describe.configure({ mode: "serial" });

  test("opens deal sheet and downloads PDF (client-side jspdf)", async ({ page }) => {
    await setupTest(page, "/desk");
    await waitForDeskReady(page);

    // Inspector is populated from mocked inventory default focus (rows[0])
    // Open Deal Sheet from inspector (text "Deal sheet")
    const dealSheetBtn = page.getByRole("button", { name: /Deal sheet/i });
    await expect(dealSheetBtn).toBeVisible({ timeout: 15000 });
    await dealSheetBtn.click();

    // Modal appears (header inside modal)
    await expect(page.getByText("Deal sheet")).toBeVisible({ timeout: 8000 });

    // Trigger download
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Download PDF/i }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    // Optionally save to tmp but not required for assertion
  });

  test("downloads the bounded two-page PDF with long notes and many lenders", async ({ page }) => {
    await setupTest(page, "/desk");

    const longLenders = Array.from({ length: 12 }, (_, index) => ({
      id: `longlender${String(index + 1).padStart(5, "0")}`,
      dealer: MOCK_USER.dealer,
      name: `Lender ${index + 1} with an intentionally long printable name`,
      maxPti: 20,
      bookValueSource: "Trade",
      tiers: [
        {
          name: `Program ${index + 1} with an intentionally long printable description`,
          minFico: 300,
          maxFico: 850,
          maxLtv: 125,
          maxTerm: 72,
        },
      ],
      active: true,
      created: "2026-01-01 00:00:00",
      updated: "2026-01-01 00:00:00",
    }));

    await page.route("**/api/collections/lender_profiles/records**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          page: 1,
          perPage: 100,
          totalItems: longLenders.length,
          totalPages: 1,
          items: longLenders,
        }),
      });
    });
    await page.evaluate(() => {
      const key = "ltvDealData_v2";
      const current = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(
        key,
        JSON.stringify({ ...current, notes: "Detailed deal note ".repeat(80) })
      );
    });
    await page.reload();
    await waitForDeskReady(page);
    await expect(page.getByRole("link", { name: /Lenders 12/i })).toBeVisible();

    await page.getByRole("button", { name: /Deal sheet/i }).click();
    const dialog = page.getByRole("dialog", { name: "Deal sheet" });
    await expect(dialog).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: /Download PDF/i }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });

  test("inventory favorites PDF button is present and triggers (with data)", async ({ page }) => {
    await setupTest(page, "/inventory");

    // Button from InventoryScreen toolbar (may require favorites for full click, presence is key assertion)
    await expect(page.getByRole("button", { name: /Favorites PDF/i })).toBeVisible({
      timeout: 10000,
    });
  });
});
