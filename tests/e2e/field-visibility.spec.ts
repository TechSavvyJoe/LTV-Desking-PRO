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
 * It also proves backend/pb_hooks/field_filter_guard.pb.js: hide() only changes
 * serialization, so without the guard a sales token could binary-search a
 * hidden value through ?filter= / ?sort= / realtime subscription filters
 * (totalItems 1 vs 0). [ship-gate P1]
 *
 * API-only (request fixture + raw fetch for realtime), no browser. Requires the seeded backend:
 *   PB_DATA_DIR=<fresh dir> E2E_REAL_BACKEND=1 E2E_KEEP_PB_RUNNING=1 npx tsx tests/helpers/seed-test-db.ts
 *   E2E_REAL_BACKEND=1 E2E_PB_URL=http://127.0.0.1:8090 npx playwright test tests/e2e/field-visibility.spec.ts
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

    // A manager-session save quotes the tier's rangeFlags in lenderEligibility reasons.
    const calculatedData = {
      lenderEligibility: [
        {
          name: "Probe Lender",
          eligible: false,
          status: "pending",
          reasons: [
            'Tier "T2" needs review - implausible value read from the rate sheet (rateAdder=25 outside -10-10; maxLtv=1500 outside 20-200).',
          ],
          matchedTier: "T2",
          uncheckedConstraints: [],
        },
      ],
      monthlyPayment: 450,
    };

    const created = await request.post(`${PB_URL}/api/collections/saved_deals/records`, {
      headers: { Authorization: adminToken },
      data: {
        dealer: DEALER_A,
        user: "adminaid123456x",
        name: `Field Visibility Probe ${Date.now()}`,
        vehicleData,
        dealData: { term: 72 },
        calculatedData,
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const { id } = (await created.json()) as PbRecord;

    try {
      const salesToken = await login(request, "sales");
      const sales = await readBoth(request, salesToken, "saved_deals", id);
      for (const record of [sales.list, sales.view]) {
        expect(record.vehicleData).toEqual({ vin: vehicleData.vin, price: vehicleData.price });
        const calc = record.calculatedData as typeof calculatedData;
        expect(calc.monthlyPayment).toBe(450);
        expect(calc.lenderEligibility[0]?.reasons[0]).toContain(
          "(rateAdder outside -10-10; maxLtv=1500 outside 20-200)"
        );
        expect(JSON.stringify(calc)).not.toContain("=25");
      }

      const managerToken = await login(request, "manager");
      const manager = await readBoth(request, managerToken, "saved_deals", id);
      for (const record of [manager.list, manager.view]) {
        expect(record.vehicleData).toEqual(vehicleData);
        expect(record.calculatedData).toEqual(calculatedData);
      }
    } finally {
      await deleteAsAdmin(request, adminToken, "saved_deals", id);
    }
  });

  test("lender_profiles: sales gets AI range flags without the misread rate value, still held for review", async ({
    request,
  }) => {
    const adminToken = await login(request, "admin");
    const tiers = [
      {
        name: "Tier 1",
        minFico: 660,
        maxLtv: 130,
        rangeFlags: ["rateAdder=25 outside -10-10", "maxLtv=1500 outside 20-200"],
        needsReview: true,
      },
      // Legacy shape: flags without needsReview.
      { name: "Tier 2", minFico: 600, rangeFlags: ["baseInterestRate=649 outside 0-40"] },
    ];
    const created = await request.post(`${PB_URL}/api/collections/lender_profiles/records`, {
      headers: { Authorization: adminToken },
      data: { dealer: DEALER_A, name: `Range Flag Probe ${Date.now()}`, active: true, tiers },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const { id } = (await created.json()) as PbRecord;

    try {
      const salesToken = await login(request, "sales");
      const sales = await readBoth(request, salesToken, "lender_profiles", id);
      for (const record of [sales.list, sales.view]) {
        const salesTiers = record.tiers as Array<Record<string, unknown>>;
        expect(salesTiers[0]).toMatchObject({
          rangeFlags: ["rateAdder", "maxLtv=1500 outside 20-200"],
          needsReview: true,
        });
        expect(salesTiers[1]).toMatchObject({
          rangeFlags: ["baseInterestRate"],
          needsReview: true,
        });
        expect(JSON.stringify(record.tiers)).not.toMatch(/649|=25/);
      }

      const managerToken = await login(request, "manager");
      const manager = await readBoth(request, managerToken, "lender_profiles", id);
      for (const record of [manager.list, manager.view]) {
        expect(record.tiers).toEqual(tiers);
      }
    } finally {
      await deleteAsAdmin(request, adminToken, "lender_profiles", id);
    }
  });

  test("filter/sort oracle: sales gets 403 for any filter or sort naming a hidden field; managers get 200", async ({
    request,
  }) => {
    const adminToken = await login(request, "admin");
    const post = async (collection: string, data: Record<string, unknown>): Promise<string> => {
      const res = await request.post(`${PB_URL}/api/collections/${collection}/records`, {
        headers: { Authorization: adminToken },
        data,
      });
      expect(res.ok(), await res.text()).toBeTruthy();
      return ((await res.json()) as PbRecord).id;
    };

    const stamp = Date.now();
    const lenderId = await post("lender_profiles", {
      dealer: DEALER_A,
      name: `Oracle Probe ${stamp}`,
      active: true,
      reservePct: 2,
      tiers: [
        { name: "Tier 1", minFico: 660, maxLtv: 130, baseInterestRate: 6.49, rateAdder: 0.25 },
      ],
    });
    const unitId = await post("inventory", {
      dealer: DEALER_A,
      vin: `1FVORACLE${String(stamp).slice(-8)}`,
      year: 2020,
      make: "Ford",
      model: "F-150",
      price: 20000,
      unitCost: 14100,
      status: "available",
    });
    const dealId = await post("saved_deals", {
      dealer: DEALER_A,
      user: "adminaid123456x",
      vehicle: unitId,
      name: `Oracle Probe ${stamp}`,
      vehicleData: { vin: "1FVORACLE", price: 20000, unitCost: 15000, frontEndGross: 5000 },
      dealData: { term: 72 },
      calculatedData: {
        lenderEligibility: [{ name: "X", reasons: ["(rateAdder=25 outside -10-10)"] }],
      },
    });

    // [collection, query params, rows a manager must see — proves the probe is a real oracle]
    const probes: Array<[string, Record<string, string>, number | null]> = [
      ["lender_profiles", { filter: `id = "${lenderId}" && reservePct > 1` }, 1],
      ["lender_profiles", { filter: `id = "${lenderId}" && tiers ~ '"baseInterestRate"'` }, 1],
      ["inventory", { filter: `id = "${unitId}" && unitCost > 0` }, 1],
      ["inventory", { sort: "-unitCost", perPage: "1" }, null],
      ["saved_deals", { filter: `id = "${dealId}" && vehicleData.unitCost > 0` }, 1],
      ["saved_deals", { filter: `id = "${dealId}" && calculatedData ~ 'rateAdder'` }, 1],
      // Relations reach inventory.unitCost from collections that store no cost.
      ["saved_deals", { filter: `id = "${dealId}" && vehicle.unitCost > 0` }, 1],
      ["dealers", { filter: `id = "${DEALER_A}" && inventory_via_dealer.unitCost ?> 0` }, 1],
    ];

    try {
      const salesToken = await login(request, "sales");
      const managerToken = await login(request, "manager");

      // Control: sales can list every probed row, so without the guard each
      // probe below would answer yes/no about the hidden value for sales too.
      for (const [collection, id] of [
        ["lender_profiles", lenderId],
        ["inventory", unitId],
        ["saved_deals", dealId],
        ["dealers", DEALER_A],
      ] as const) {
        const res = await request.get(`${PB_URL}/api/collections/${collection}/records`, {
          headers: { Authorization: salesToken },
          params: { filter: `id = "${id}"` },
        });
        expect(res.status(), `sales control ${collection}`).toBe(200);
        expect(((await res.json()) as { items: PbRecord[] }).items).toHaveLength(1);
      }

      for (const [collection, params, managerRows] of probes) {
        const label = `${collection} ${JSON.stringify(params)}`;
        const url = `${PB_URL}/api/collections/${collection}/records`;

        const salesRes = await request.get(url, { headers: { Authorization: salesToken }, params });
        expect(salesRes.status(), `sales ${label}`).toBe(403);

        const managerRes = await request.get(url, {
          headers: { Authorization: managerToken },
          params,
        });
        expect(managerRes.status(), `manager ${label}`).toBe(200);
        if (managerRows !== null) {
          const { items } = (await managerRes.json()) as { items: PbRecord[] };
          expect(items, `manager ${label}`).toHaveLength(managerRows);
        }
      }

      // The app's own sales queries are untouched.
      for (const [collection, params] of [
        ["inventory", { filter: `dealer = "${DEALER_A}"`, sort: "-created" }],
        ["lender_profiles", { filter: `dealer = "${DEALER_A}"`, sort: "name,-updated" }],
        ["saved_deals", { filter: `dealer = "${DEALER_A}"`, sort: "-created" }],
        ["dealers", { filter: "active = true" }],
        ["inventory", {}],
      ] as Array<[string, Record<string, string>]>) {
        const res = await request.get(`${PB_URL}/api/collections/${collection}/records`, {
          headers: { Authorization: salesToken },
          params,
        });
        expect(res.status(), `sales ${collection} ${JSON.stringify(params)}`).toBe(200);
      }

      // The guard checks the value requestInfo carries — the FIRST `filter`.
      // That is safe only because PocketBase evaluates just that one: a
      // trailing duplicate is ignored for everyone (a manager still gets the
      // row although unitCost > 99999999 is false), so it answers nothing.
      const inventoryUrl = `${PB_URL}/api/collections/inventory/records`;
      const byId = encodeURIComponent(`id = "${unitId}"`);
      const impossible = encodeURIComponent("unitCost > 99999999");
      for (const [role, token] of [
        ["sales", salesToken],
        ["manager", managerToken],
      ] as const) {
        const res = await request.get(`${inventoryUrl}?filter=${byId}&filter=${impossible}`, {
          headers: { Authorization: token },
        });
        expect(res.status(), `${role} trailing duplicate filter`).toBe(200);
        const { items } = (await res.json()) as { items: PbRecord[] };
        expect(items, `${role} trailing duplicate filter is not evaluated`).toHaveLength(1);
      }
      const leading = await request.get(`${inventoryUrl}?filter=${impossible}&filter=${byId}`, {
        headers: { Authorization: salesToken },
      });
      expect(leading.status(), "sales leading protected filter").toBe(403);
    } finally {
      await deleteAsAdmin(request, adminToken, "saved_deals", dealId);
      await deleteAsAdmin(request, adminToken, "inventory", unitId);
      await deleteAsAdmin(request, adminToken, "lender_profiles", lenderId);
    }
  });

  /**
   * Realtime runs over the raw protocol the SDK uses (SSE connect → POST the
   * topic list, each `topic?options=<encodeURIComponent(JSON {query, headers})>`
   * exactly as pocketbase's RealtimeService builds it). The SDK itself can't
   * run here: Node has no global EventSource.
   */
  test("realtime: sales cannot subscribe with a filter on a hidden field; managers can; bare topics still work", async ({
    request,
  }) => {
    const subscribe = async (token: string, subscriptions: string[]): Promise<number> => {
      const controller = new AbortController();
      const res = await fetch(`${PB_URL}/api/realtime`, { signal: controller.signal });
      if (!res.ok || !res.body) throw new Error(`realtime connect failed: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let clientId = "";
      try {
        while (!clientId) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const match = /event:\s*PB_CONNECT[\s\S]*?data:\s*(\{.*\})/.exec(buffer);
          if (match?.[1]) clientId = (JSON.parse(match[1]) as { clientId: string }).clientId;
        }
        expect(clientId, "PB_CONNECT clientId").not.toBe("");
        const sub = await request.post(`${PB_URL}/api/realtime`, {
          headers: { Authorization: token },
          data: { clientId, subscriptions },
        });
        return sub.status();
      } finally {
        controller.abort();
        await reader.cancel().catch(() => undefined);
      }
    };
    const withFilter = (topic: string, filter: string) =>
      `${topic}?options=${encodeURIComponent(JSON.stringify({ query: { filter } }))}`;

    const salesToken = await login(request, "sales");
    const managerToken = await login(request, "manager");

    for (const topics of [
      [withFilter("inventory/*", "unitCost > 14099")],
      [withFilter("lender_profiles/*", `tiers ~ '"baseInterestRate"'`)],
      [withFilter("saved_deals/*", "vehicleData.unitCost > 0")],
      ["inventory/*?options=%7Bnot-json"],
    ]) {
      expect(await subscribe(salesToken, topics), `sales ${topics[0]}`).toBe(403);
    }
    expect(await subscribe(managerToken, [withFilter("inventory/*", "unitCost > 14099")])).toBe(
      204
    );
    // What the app subscribes to (lib/api.ts): bare collection topics.
    expect(await subscribe(salesToken, ["inventory/*", "saved_deals/*", "lender_profiles/*"])).toBe(
      204
    );
    // An empty list (unsubscribe from everything) is not a filter.
    expect(await subscribe(salesToken, [])).toBe(204);
  });
});
