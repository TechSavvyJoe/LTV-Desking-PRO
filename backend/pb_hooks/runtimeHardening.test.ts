import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type HookEvent = Record<string, unknown>;
type HookHandler = (event: HookEvent) => unknown;

const hookSource = (name: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), "backend/pb_hooks", name), "utf8");

const setRuntimeGlobal = (name: string, value: unknown): void => {
  (globalThis as Record<string, unknown>)[name] = value;
};

const clearRuntimeGlobal = (name: string): void => {
  delete (globalThis as Record<string, unknown>)[name];
};

afterEach(() => {
  for (const name of [
    "onBootstrap",
    "cronAdd",
    "$app",
    "routerUse",
    "onRecordCreateRequest",
    "onRecordUpdateRequest",
    "onRecordEnrich",
    "onRecordDeleteRequest",
    "onRecordAuthRequest",
    "ForbiddenError",
  ]) {
    clearRuntimeGlobal(name);
  }
  vi.restoreAllMocks();
});

describe("PocketBase hook runtime hardening", () => {
  it("does not rewrite equivalent authorization rules returned as string-like objects", () => {
    let bootstrapHandler: HookHandler | undefined;
    let retryHandler: (() => unknown) | undefined;
    const save = vi.fn();
    const collections = new Map<string, Record<string, unknown>>();
    const app = {
      findCollectionByNameOrId: vi.fn((name: string) => {
        let collection = collections.get(name);
        if (!collection) {
          collection = {};
          collections.set(name, collection);
        }
        return collection;
      }),
      save,
    };

    setRuntimeGlobal("onBootstrap", (handler: HookHandler) => {
      bootstrapHandler = handler;
    });
    setRuntimeGlobal(
      "cronAdd",
      (_name: string, _schedule: string, handler: () => unknown) => {
        retryHandler = handler;
      }
    );
    setRuntimeGlobal("$app", app);
    new Function(hookSource("authorization_rules.pb.js"))();

    expect(bootstrapHandler).toBeTypeOf("function");
    expect(retryHandler).toBeTypeOf("function");

    // First pass against empty collections populates every rule set.
    bootstrapHandler?.({ next: vi.fn(), app });
    expect(save).toHaveBeenCalled();
    expect(collections.has("deal_events")).toBe(true);

    // Simulate PB/Goja returning the persisted rules as string-like host
    // objects instead of primitives; the hook must treat them as equal and
    // stay a no-op instead of rewriting the schema every minute.
    for (const collection of collections.values()) {
      for (const [key, value] of Object.entries(collection)) {
        if (typeof value === "string") {
          collection[key] = { toString: () => value };
        }
      }
    }

    save.mockClear();
    retryHandler?.();
    expect(save).not.toHaveBeenCalled();
  });

  it("logs a structured auth error with its real HTTP status", () => {
    let middleware: HookHandler | undefined;
    setRuntimeGlobal("routerUse", (handler: HookHandler) => {
      middleware = handler;
    });
    new Function(hookSource("log.pb.js"))();

    expect(middleware).toBeTypeOf("function");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(600);
    const authError = Object.assign(new Error("expired token"), { value: { status: 401 } });
    const event = {
      next: () => {
        throw authError;
      },
      response: {},
      request: { method: "POST", url: { path: "/api/collections/users/auth-refresh" } },
      auth: null,
    };

    expect(() => middleware?.(event)).toThrow(authError);
    expect(log).toHaveBeenCalledOnce();
    const entry = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      status: number;
      error: boolean;
    };
    expect(entry.status).toBe(401);
    expect(entry.error).toBe(false);
  });

  it("deal_attribution.pb.js forces user on create and locks user on update for sales", () => {
    const createHandlers: Record<string, HookHandler> = {};
    const updateHandlers: Record<string, HookHandler> = {};
    setRuntimeGlobal("onRecordCreateRequest", (fn: HookHandler, name: string) => {
      createHandlers[name] = fn;
    });
    setRuntimeGlobal("onRecordUpdateRequest", (fn: HookHandler, name: string) => {
      updateHandlers[name] = fn;
    });
    setRuntimeGlobal(
      "ForbiddenError",
      class ForbiddenError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "ForbiddenError";
        }
      }
    );

    new Function(hookSource("deal_attribution.pb.js"))();

    expect(createHandlers.saved_deals).toBeTypeOf("function");
    expect(createHandlers.deal_events).toBeTypeOf("function");
    expect(updateHandlers.saved_deals).toBeTypeOf("function");

    const createEvent = {
      auth: {
        id: "auth-user-1",
        get: (key: string) => (key === "role" ? "sales" : ""),
        collection: () => ({ name: "users" }),
      },
      record: { set: vi.fn() },
      next: vi.fn(),
    };
    createHandlers.saved_deals?.(createEvent);
    expect(createEvent.record.set).toHaveBeenCalledWith("user", "auth-user-1");
    expect(createEvent.next).toHaveBeenCalled();

    const updateEvent = {
      auth: {
        id: "auth-user-1",
        get: (key: string) => (key === "role" ? "sales" : ""),
        collection: () => ({ name: "users" }),
      },
      record: {
        set: vi.fn(),
        original: () => ({ get: (key: string) => (key === "user" ? "original-owner" : "") }),
      },
      next: vi.fn(),
    };
    updateHandlers.saved_deals?.(updateEvent);
    expect(updateEvent.record.set).toHaveBeenCalledWith("user", "original-owner");
    expect(updateEvent.next).toHaveBeenCalled();
  });

  it("field_visibility.pb.js strips buy-rate/reserve from lender_profiles for sales but not managers [takeover #7]", () => {
    const enrichHandlers: Record<string, HookHandler> = {};
    setRuntimeGlobal("onRecordEnrich", (fn: HookHandler, name: string) => {
      enrichHandlers[name] = fn;
    });
    new Function(hookSource("field_visibility.pb.js"))();

    expect(enrichHandlers.inventory).toBeTypeOf("function");
    expect(enrichHandlers.saved_deals).toBeTypeOf("function");
    expect(enrichHandlers.lender_profiles).toBeTypeOf("function");

    const makeRecord = (tiers: unknown, reservePct = 2) => {
      const store: Record<string, unknown> = { tiers, reservePct };
      const hidden: string[] = [];
      return {
        store,
        hidden,
        record: {
          get: (key: string) => store[key],
          set: (key: string, value: unknown) => {
            store[key] = value;
          },
          hide: (key: string) => {
            hidden.push(key);
          },
        },
      };
    };
    const authFor = (role: string) => ({ get: (key: string) => (key === "role" ? role : "") });
    const tier = {
      name: "Tier 1",
      minFico: 660,
      maxLtv: 130,
      maxTerm: 75,
      maxMileage: 110000,
      baseInterestRate: 6.49,
      rateAdder: 0.25,
    };

    // sales: reserve hidden, buy rate + adder stripped, eligibility rules kept.
    const sales = makeRecord([{ ...tier }]);
    enrichHandlers.lender_profiles?.({
      requestInfo: { auth: authFor("sales") },
      record: sales.record,
      next: vi.fn(),
    });
    expect(sales.hidden).toContain("reservePct");
    const salesTiers = sales.store.tiers as Array<Record<string, unknown>>;
    expect(salesTiers[0]).not.toHaveProperty("baseInterestRate");
    expect(salesTiers[0]).not.toHaveProperty("rateAdder");
    expect(salesTiers[0]).toMatchObject({ minFico: 660, maxLtv: 130, maxTerm: 75, maxMileage: 110000 });

    // PocketBase may hand the JSON field back as a string — sanitize that path too.
    const salesString = makeRecord(JSON.stringify([{ ...tier }]));
    enrichHandlers.lender_profiles?.({
      requestInfo: { auth: authFor("sales") },
      record: salesString.record,
      next: vi.fn(),
    });
    const parsed = salesString.store.tiers as Array<Record<string, unknown>>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).not.toHaveProperty("baseInterestRate");
    expect(parsed[0]).toMatchObject({ minFico: 660 });

    // manager / admin / superadmin: F&I profit data untouched.
    for (const role of ["manager", "admin", "superadmin"]) {
      const privileged = makeRecord([{ ...tier }]);
      enrichHandlers.lender_profiles?.({
        requestInfo: { auth: authFor(role) },
        record: privileged.record,
        next: vi.fn(),
      });
      expect(privileged.hidden).toHaveLength(0);
      expect((privileged.store.tiers as Array<Record<string, unknown>>)[0]).toMatchObject({
        baseInterestRate: 6.49,
        rateAdder: 0.25,
      });
    }

    // Malformed tiers for sales: fail closed — hide the whole blob, never leak a buy rate.
    const malformed = makeRecord("{not json");
    enrichHandlers.lender_profiles?.({
      requestInfo: { auth: authFor("sales") },
      record: malformed.record,
      next: vi.fn(),
    });
    expect(malformed.hidden).toContain("tiers");

    // Unauthenticated / missing role is treated as least-privileged.
    const anon = makeRecord([{ ...tier }]);
    enrichHandlers.lender_profiles?.({ requestInfo: { auth: null }, record: anon.record, next: vi.fn() });
    expect(anon.hidden).toContain("reservePct");
    expect((anon.store.tiers as Array<Record<string, unknown>>)[0]).not.toHaveProperty("baseInterestRate");
  });

  describe("tenant isolation & privilege-escalation hooks [takeover #8 — RBAC coverage]", () => {
    const authFor = (role: string, dealer = "D1", collectionName = "users") => ({
      id: "u1",
      get: (key: string) => (key === "role" ? role : key === "dealer" ? dealer : ""),
      collection: () => ({ name: collectionName }),
    });
    const recordWith = (fields: Record<string, unknown>, original?: Record<string, unknown>) => {
      const store: Record<string, unknown> = { ...fields };
      const set = vi.fn((key: string, value: unknown) => {
        store[key] = value;
      });
      return {
        store,
        set,
        record: {
          get: (key: string) => store[key],
          set,
          original: () => ({ get: (key: string) => (original ?? fields)[key] }),
          collection: () => ({ name: "users" }),
        },
      };
    };
    class Forbidden extends Error {
      constructor(message: string) {
        super(message);
        this.name = "ForbiddenError";
      }
    }
    const withBody = (body: Record<string, unknown>) => () => ({ body });

    it("dealer_guard forces the auth user's dealer onto every dealer-scoped write (Dealer A cannot write into Dealer B)", () => {
      const create: Record<string, HookHandler> = {};
      const update: Record<string, HookHandler> = {};
      setRuntimeGlobal("onRecordCreateRequest", (fn: HookHandler, name: string) => {
        create[name] = fn;
      });
      setRuntimeGlobal("onRecordUpdateRequest", (fn: HookHandler, name: string) => {
        update[name] = fn;
      });
      setRuntimeGlobal("ForbiddenError", Forbidden);
      new Function(hookSource("dealer_guard.pb.js"))();

      for (const c of ["inventory", "lender_profiles", "saved_deals", "dealer_settings", "deal_events"]) {
        expect(create[c]).toBeTypeOf("function");
        expect(update[c]).toBeTypeOf("function");
      }

      // A sales user in D1 tries to write a record claiming dealer D2 → overwritten to D1.
      const hop = recordWith({ dealer: "D2", vin: "X" });
      const next = vi.fn();
      create.inventory?.({ auth: authFor("sales", "D1"), record: hop.record, next });
      expect(hop.set).toHaveBeenCalledWith("dealer", "D1");
      expect(hop.store.dealer).toBe("D1");
      expect(next).toHaveBeenCalled();

      const hopU = recordWith({ dealer: "D2" });
      update.saved_deals?.({ auth: authFor("manager", "D1"), record: hopU.record, next: vi.fn() });
      expect(hopU.store.dealer).toBe("D1");

      // Unauthenticated → fail closed.
      expect(() =>
        create.inventory?.({ auth: null, record: recordWith({ dealer: "D2" }).record, next: vi.fn() })
      ).toThrow(/Authentication is required/);

      // Authenticated but no dealership → fail closed (never trust a client-supplied dealer).
      expect(() =>
        create.inventory?.({
          auth: authFor("sales", ""),
          record: recordWith({ dealer: "D2" }).record,
          next: vi.fn(),
        })
      ).toThrow(/not associated with a dealership/);

      // App superadmins and platform _superusers may write any dealer (seeding/support).
      const sa = recordWith({ dealer: "D2" });
      create.inventory?.({ auth: authFor("superadmin", "D1"), record: sa.record, next: vi.fn() });
      expect(sa.set).not.toHaveBeenCalled();
      const su = recordWith({ dealer: "D2" });
      create.inventory?.({ auth: authFor("sales", "D1", "_superusers"), record: su.record, next: vi.fn() });
      expect(su.set).not.toHaveBeenCalled();
    });

    it("users_guard blocks self-promotion to superadmin and tenant-hopping on update", () => {
      const update: Record<string, HookHandler> = {};
      setRuntimeGlobal("onRecordCreateRequest", vi.fn());
      setRuntimeGlobal("onRecordUpdateRequest", (fn: HookHandler, name: string) => {
        update[name] = fn;
      });
      setRuntimeGlobal("onRecordDeleteRequest", vi.fn());
      setRuntimeGlobal("onRecordAuthRequest", vi.fn());
      setRuntimeGlobal("ForbiddenError", Forbidden);
      new Function(hookSource("users_guard.pb.js"))();
      expect(update.users).toBeTypeOf("function");

      const stored = { role: "sales", dealer: "D1", active: true };

      // A sales user PATCHes their own record to superadmin in another dealer → all reverted.
      const esc = recordWith({ role: "superadmin", dealer: "D2", active: false }, stored);
      const next = vi.fn();
      update.users?.({ auth: authFor("sales", "D1"), record: esc.record, next });
      expect(esc.store).toMatchObject({ role: "sales", dealer: "D1", active: true });
      expect(next).toHaveBeenCalled();

      // An admin may set non-privileged roles and toggle active, but never grant superadmin or move dealers.
      const adm = recordWith({ role: "superadmin", dealer: "D2", active: false }, stored);
      update.users?.({ auth: authFor("admin", "D1"), record: adm.record, next: vi.fn() });
      expect(adm.store.role).toBe("sales");
      expect(adm.store.dealer).toBe("D1");
      expect(adm.store.active).toBe(false);
      const admOk = recordWith({ role: "manager", dealer: "D1", active: true }, stored);
      update.users?.({ auth: authFor("admin", "D1"), record: admOk.record, next: vi.fn() });
      expect(admOk.store.role).toBe("manager");

      // Nobody but a superadmin may touch a superadmin's record.
      const target = recordWith({ role: "sales" }, { role: "superadmin", dealer: "D1", active: true });
      expect(() =>
        update.users?.({ auth: authFor("admin", "D1"), record: target.record, next: vi.fn() })
      ).toThrow(/platform owner/);

      // Superadmin is exempt from the clamps.
      const saEdit = recordWith({ role: "admin", dealer: "D2", active: true }, stored);
      update.users?.({ auth: authFor("superadmin", "D9"), record: saEdit.record, next: vi.fn() });
      expect(saEdit.set).not.toHaveBeenCalled();
    });

    it("users_guard clamps admin-created users, denies sales creates, and validates public signup by dealer code", () => {
      const create: Record<string, HookHandler> = {};
      setRuntimeGlobal("onRecordCreateRequest", (fn: HookHandler, name: string) => {
        create[name] = fn;
      });
      setRuntimeGlobal("onRecordUpdateRequest", vi.fn());
      setRuntimeGlobal("onRecordDeleteRequest", vi.fn());
      setRuntimeGlobal("onRecordAuthRequest", vi.fn());
      setRuntimeGlobal("ForbiddenError", Forbidden);
      const app = {
        findRecordsByFilter: vi.fn(() => [] as Array<{ getBool: (k: string) => boolean }>),
        findFirstRecordByFilter: vi.fn(() => ({ id: "DEALER-1" }) as { id: string } | null),
      };
      setRuntimeGlobal("$app", app);
      new Function(hookSource("users_guard.pb.js"))();
      expect(create.users).toBeTypeOf("function");

      // Admin: cannot mint a superadmin; the new user is pinned to the admin's dealer; active defaults true.
      const adm = recordWith({ role: "superadmin", dealer: "D2" });
      create.users?.({
        auth: authFor("admin", "D1"),
        record: adm.record,
        requestInfo: withBody({}),
        next: vi.fn(),
      });
      expect(adm.store).toMatchObject({ role: "sales", dealer: "D1", active: true });

      // An authenticated sales user may not create accounts at all.
      expect(() =>
        create.users?.({
          auth: authFor("sales", "D1"),
          record: recordWith({}).record,
          requestInfo: withBody({}),
          next: vi.fn(),
        })
      ).toThrow(/dealership administrator/);

      // Public signup with a code that resolves to the same dealer → lowest-privilege role.
      const pub = recordWith({ role: "admin", dealer: "DEALER-1" });
      const next = vi.fn();
      create.users?.({
        auth: null,
        record: pub.record,
        requestInfo: withBody({ dealerCode: "ABC" }),
        next,
      });
      expect(pub.store.role).toBe("sales");
      expect(next).toHaveBeenCalled();

      // Public signup whose code resolves to a DIFFERENT dealer than the record claims → rejected.
      expect(() =>
        create.users?.({
          auth: null,
          record: recordWith({ dealer: "OTHER" }).record,
          requestInfo: withBody({ dealerCode: "ABC" }),
          next: vi.fn(),
        })
      ).toThrow(/does not match/);

      // Unknown code and missing code → rejected.
      app.findFirstRecordByFilter.mockReturnValueOnce(null);
      expect(() =>
        create.users?.({
          auth: null,
          record: recordWith({ dealer: "DEALER-1" }).record,
          requestInfo: withBody({ dealerCode: "NOPE" }),
          next: vi.fn(),
        })
      ).toThrow(/Invalid dealer code/);
      expect(() =>
        create.users?.({
          auth: null,
          record: recordWith({ dealer: "DEALER-1" }).record,
          requestInfo: withBody({}),
          next: vi.fn(),
        })
      ).toThrow(/dealer code is required/);

      // Owner kill-switch: signupsEnabled=false rejects public registration.
      app.findRecordsByFilter.mockReturnValueOnce([{ getBool: () => false }]);
      expect(() =>
        create.users?.({
          auth: null,
          record: recordWith({ dealer: "DEALER-1" }).record,
          requestInfo: withBody({ dealerCode: "ABC" }),
          next: vi.fn(),
        })
      ).toThrow(/currently disabled/);
    });

    it("users_guard protects superadmin accounts from deletion and blocks deactivated logins", () => {
      let del: HookHandler | undefined;
      let authReq: HookHandler | undefined;
      setRuntimeGlobal("onRecordCreateRequest", vi.fn());
      setRuntimeGlobal("onRecordUpdateRequest", vi.fn());
      setRuntimeGlobal("onRecordDeleteRequest", (fn: HookHandler) => {
        del = fn;
      });
      setRuntimeGlobal("onRecordAuthRequest", (fn: HookHandler) => {
        authReq = fn;
      });
      setRuntimeGlobal("ForbiddenError", Forbidden);
      new Function(hookSource("users_guard.pb.js"))();

      expect(() =>
        del?.({
          auth: authFor("admin", "D1"),
          record: recordWith({ role: "superadmin" }).record,
          next: vi.fn(),
        })
      ).toThrow(/platform owner/);
      const ok = vi.fn();
      del?.({
        auth: authFor("superadmin", "D1"),
        record: recordWith({ role: "superadmin" }).record,
        next: ok,
      });
      expect(ok).toHaveBeenCalled();

      expect(() => authReq?.({ record: recordWith({ active: false }).record, next: vi.fn() })).toThrow(
        /deactivated/
      );
      const live = vi.fn();
      authReq?.({ record: recordWith({ active: true }).record, next: live });
      expect(live).toHaveBeenCalled();
    });
  });
});
