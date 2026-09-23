import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Real-backend proof of backend/pb_hooks/field_visibility.pb.js.
 *
 * The unit test (backend/pb_hooks/runtimeHardening.test.ts) can only model the
 * PocketBase JSVM; this spec runs the actual hook on the actual PocketBase
 * binary. In the JSVM a JSON field read with record.get() is a types.JSONRaw
 * byte array, which once made the hook re-emit every buy rate to `sales` as
 * char codes while the mocked unit test stayed green. [review P0]
 *
 * API-only (request fixture), no browser. Requires the seeded backend:
 *   PB_DATA_DIR=<fresh dir> E2E_REAL_BACKEND=1 E2E_KEEP_PB_RUNNING=1 npx tsx tests/helpers/seed-test-db.ts
 *   E2E_REAL_BACKEND=1 npx playwright test tests/e2e/field-visibility.spec.ts
 * Targets E2E_PB_URL (default http://127.0.0.1:8090) — never VITE_POCKETBASE_URL,
 * which .env.local points at production.
 */

const USE_REAL_BACKEND = !!process.env.E2E_REAL_BACKEND;
const PB_URL = process.env.E2E_PB_URL || "http://127.0.0.1:8090";
const DEALER_A = "dealeraid12345x";

const CREDENTIALS = {
  sales: { identity: "sales.a@dealera.com", password: "SalesPassword123!" },
  manager: { identity: "manager.a@dealera.com", password: "ManagerPassword123!" },
  admin: { identity: "admin.a@dealera.com", password: "AdminPassword123!" },
  // Platform superuser (the PocketBase dashboard account) upserted by the seed helper.
  superuser: { identity: "superadmin@ltvpro.com", password: "SuperAdminPass123!" },
} as const;

type Role = keyof typeof CREDENTIALS;
type PbRecord = Record<string, unknown> & { id: string };

async function login(request: APIRequestContext, role: Role): Promise<string> {
  const collection = role === "superuser" ? "_superusers" : "users";
  const res = await request.post(`${PB_URL}/api/collections/${collection}/auth-with-password`, {
    data: CREDENTIALS[role],
  });
  expect(res.ok(), `${role} login`).toBeTruthy();
  return ((await res.json()) as { token: string }).token;
}

/** The record as returned by both LIST (filtered to its id) and VIEW for this token. */
async function readBoth(
  request: APIRequestContext,
  token: string,
  collection: string,
  id: string
): Promise<{ list: PbRecord; view: PbRecord }> {
  const listRes = await request.get(`${PB_URL}/api/collections/${collection}/records`, {
    headers: { Authorization: token },
    params: { filter: `id = "${id}"`, perPage: 1 },
  });
  expect(listRes.ok(), `${collection} list`).toBeTruthy();
  const { items } = (await listRes.json()) as { items: PbRecord[] };
  expect(items).toHaveLength(1);

  const viewRes = await request.get(`${PB_URL}/api/collections/${collection}/records/${id}`, {
    headers: { Authorization: token },
  });
  expect(viewRes.ok(), `${collection} view`).toBeTruthy();
  const view = (await viewRes.json()) as PbRecord;

  return { list: items[0] as PbRecord, view };
}

async function deleteAsAdmin(
  request: APIRequestContext,
  adminToken: string,
  collection: string,
  id: string
): Promise<void> {
  const res = await request.delete(`${PB_URL}/api/collections/${collection}/records/${id}`, {
    headers: { Authorization: adminToken },
  });
  expect(res.ok(), `cleanup ${collection}/${id}`).toBeTruthy();
}

test.describe("Field visibility hook (real PocketBase)", () => {
  test.skip(!USE_REAL_BACKEND, "Requires the seeded PocketBase backend with production hooks");

  test("lender_profiles: sales gets eligibility tiers without buy rate, adder, or reserve; managers and platform superusers get everything", async ({
    request,
  }) => {
    const adminToken = await login(request, "admin");
    const tiers = [
      {
        name: "Tier 1",
        minFico: 660,
        maxLtv: 130,
        maxTerm: 75,
        baseInterestRate: 6.49,
        rateAdder: 0.25,
      },
      {
        name: "Tier 2",
        minFico: 600,
        maxLtv: 120,
        maxTerm: 72,
        baseInterestRate: 9.99,
        rateAdder: 0.5,
      },
    ];

    const created = await request.post(`${PB_URL}/api/collections/lender_profiles/records`, {
      headers: { Authorization: adminToken },
      data: {
        dealer: DEALER_A,
        name: `Field Visibility Probe ${Date.now()}`,
        active: true,
        reservePct: 2,
        tiers,
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const { id } = (await created.json()) as PbRecord;

    try {
      const salesToken = await login(request, "sales");
      const sales = await readBoth(request, salesToken, "lender_profiles", id);
      for (const record of [sales.list, sales.view]) {
        expect(record).not.toHaveProperty("reservePct");
        expect(Array.isArray(record.tiers)).toBe(true);
        const salesTiers = record.tiers as unknown[];
        expect(salesTiers).toHaveLength(tiers.length);
        for (const [i, tier] of salesTiers.entries()) {
          // Objects, not the JSONRaw byte values (numbers) the P0 re-emitted.
          expect(tier !== null && typeof tier === "object" && !Array.isArray(tier)).toBe(true);
          expect(tier).toMatchObject({
            name: tiers[i]?.name,
            minFico: tiers[i]?.minFico,
            maxLtv: tiers[i]?.maxLtv,
            maxTerm: tiers[i]?.maxTerm,
          });
          expect(tier).not.toHaveProperty("baseInterestRate");
          expect(tier).not.toHaveProperty("rateAdder");
        }
      }

      const managerToken = await login(request, "manager");
      const manager = await readBoth(request, managerToken, "lender_profiles", id);
      for (const record of [manager.list, manager.view]) {
        expect(record.reservePct).toBe(2);
        expect(record.tiers).toEqual(tiers);
      }

      // The dashboard round-trips what it reads; a stripped blob would be saved back.
      const superuserToken = await login(request, "superuser");
      const superuser = await readBoth(request, superuserToken, "lender_profiles", id);
      for (const record of [superuser.list, superuser.view]) {
        expect(record.reservePct).toBe(2);
        expect(record.tiers).toEqual(tiers);
      }
    } finally {
      await deleteAsAdmin(request, adminToken, "lender_profiles", id);
    }
  });

  test("saved_deals: sales gets vehicleData without unitCost / frontEndGross; managers get everything", async ({
    request,
  }) => {
    const adminToken = await login(request, "admin");
    const vehicleData = {
      vin: "1FVPROBE000000001",
      price: 20000,
      unitCost: 15000,
      frontEndGross: 5000,
    };

    const created = await request.post(`${PB_URL}/api/collections/saved_deals/records`, {
      headers: { Authorization: adminToken },
      data: {
        dealer: DEALER_A,
        user: "adminaid123456x",
        name: `Field Visibility Probe ${Date.now()}`,
        vehicleData,
        dealData: { term: 72 },
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const { id } = (await created.json()) as PbRecord;

    try {
      const salesToken = await login(request, "sales");
      const sales = await readBoth(request, salesToken, "saved_deals", id);
      for (const record of [sales.list, sales.view]) {
        expect(record.vehicleData).toEqual({ vin: vehicleData.vin, price: vehicleData.price });
      }

      const managerToken = await login(request, "manager");
      const manager = await readBoth(request, managerToken, "saved_deals", id);
      for (const record of [manager.list, manager.view]) {
        expect(record.vehicleData).toEqual(vehicleData);
      }
    } finally {
      await deleteAsAdmin(request, adminToken, "saved_deals", id);
    }
  });
});
