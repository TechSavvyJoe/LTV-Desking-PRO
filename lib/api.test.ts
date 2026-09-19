import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentDealerId: vi.fn(() => "dealer-1"),
  getCurrentUser: vi.fn(() => ({ id: "user-1", role: "admin" as const })),
  withPbRetry: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  getFullList: vi.fn(),
  getList: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  filter: vi.fn((_expr: string, _params: unknown) => "filtered"),
  authModel: { id: "user-1" } as { id: string } | null,
}));

vi.mock("./pocketbase", () => ({
  pb: {
    filter: mocks.filter,
    authStore: {
      get model() {
        return mocks.authModel;
      },
    },
    collection: () => ({
      getFullList: mocks.getFullList,
      getList: mocks.getList,
      create: mocks.create,
    }),
  },
  collections: {
    inventory: {
      getFullList: mocks.getFullList,
      getList: mocks.getList,
      create: mocks.create,
      update: mocks.update,
    },
    lenderProfiles: {
      getFullList: mocks.getFullList,
      getList: mocks.getList,
    },
    savedDeals: {
      getFullList: mocks.getFullList,
      getList: mocks.getList,
      create: mocks.create,
    },
    dealerSettings: {
      getList: mocks.getList,
    },
    dealers: {
      getFullList: mocks.getFullList,
      getList: mocks.getList,
      getOne: vi.fn(),
    },
  },
  getCurrentDealerId: mocks.getCurrentDealerId,
  getCurrentUser: mocks.getCurrentUser,
  asRecord: <T>(record: T) => record,
  asRecordArray: <T>(records: T[]) => records,
  withPbRetry: mocks.withPbRetry,
}));

vi.mock("./logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock("./typeGuards", () => ({
  sanitizeId: (id: string) => id,
}));

vi.mock("./passwordPolicy", () => ({
  validatePassword: vi.fn(async () => ({ ok: true })),
}));

import {
  getInventory,
  getLenderProfiles,
  getSavedDeals,
  getDealerSettings,
  saveDeal,
  shouldSwallowFetchError,
  syncInventory,
} from "./api";

describe("shouldSwallowFetchError", () => {
  it("defaults to throw (do not swallow)", () => {
    expect(shouldSwallowFetchError()).toBe(false);
    expect(shouldSwallowFetchError({})).toBe(false);
    expect(shouldSwallowFetchError({ throwOnError: true })).toBe(false);
  });

  it("swallows only when soft or throwOnError:false", () => {
    expect(shouldSwallowFetchError({ soft: true })).toBe(true);
    expect(shouldSwallowFetchError({ throwOnError: false })).toBe(true);
  });
});

describe("read APIs throw by default (C10)", () => {
  beforeEach(() => {
    mocks.getCurrentDealerId.mockReturnValue("dealer-1");
    mocks.getFullList.mockReset();
    mocks.getList.mockReset();
    mocks.create.mockReset();
  });

  it("getInventory throws on failure unless soft", async () => {
    mocks.getFullList.mockRejectedValue(new Error("network down"));
    await expect(getInventory()).rejects.toThrow("network down");
    await expect(getInventory({ soft: true })).resolves.toEqual([]);
    await expect(getInventory({ throwOnError: false })).resolves.toEqual([]);
  });

  it("getInventory returns [] without error when no dealer", async () => {
    mocks.getCurrentDealerId.mockReturnValue(null as unknown as string);
    await expect(getInventory()).resolves.toEqual([]);
    expect(mocks.getFullList).not.toHaveBeenCalled();
  });

  it("getLenderProfiles throws on failure unless soft", async () => {
    mocks.getFullList.mockRejectedValue(new Error("pb 500"));
    await expect(getLenderProfiles()).rejects.toThrow("pb 500");
    await expect(getLenderProfiles({ soft: true })).resolves.toEqual([]);
  });

  it("getSavedDeals throws on failure unless soft", async () => {
    mocks.getFullList.mockRejectedValue(new Error("timeout"));
    await expect(getSavedDeals()).rejects.toThrow("timeout");
    await expect(getSavedDeals({ soft: true })).resolves.toEqual([]);
  });

  it("getDealerSettings throws on failure unless soft", async () => {
    mocks.getList.mockRejectedValue(new Error("settings boom"));
    await expect(getDealerSettings()).rejects.toThrow("settings boom");
    await expect(getDealerSettings({ soft: true })).resolves.toBeNull();
  });

  it("saveDeal throws on create failure (does not return null)", async () => {
    mocks.create.mockRejectedValue(new Error("write denied"));
    await expect(
      saveDeal({
        name: "deal",
        customerName: "A",
        vehicle: "v1",
        vehicleData: {},
        dealData: {},
        customerFilters: {},
        status: "pending",
      } as never)
    ).rejects.toThrow("write denied");
  });

  it("saveDeal returns null when unauthenticated (not a thrown error)", async () => {
    mocks.authModel = null;
    await expect(
      saveDeal({
        name: "deal",
        customerName: "A",
        vehicle: "v1",
        vehicleData: {},
        dealData: {},
        customerFilters: {},
        status: "pending",
      } as never)
    ).resolves.toBeNull();
    mocks.authModel = { id: "user-1" };
  });

  describe("syncInventory — markMissingSold data-loss guard [takeover-P1]", () => {
    const existing = [
      { id: "r1", vin: "VIN1", stockNumber: "S1" },
      { id: "r2", vin: "VIN2", stockNumber: "S2" },
    ];
    const unit = (vin: string) =>
      ({
        vin,
        stockNumber: `S-${vin}`,
        year: 2021,
        make: "Honda",
        model: "Civic",
        trim: "LX",
        mileage: 30000,
        price: 21000,
      }) as never;

    beforeEach(() => {
      mocks.getCurrentDealerId.mockReturnValue("dealer-1");
      mocks.getFullList.mockReset().mockResolvedValue(existing);
      mocks.update.mockReset().mockResolvedValue({});
      mocks.create.mockReset().mockResolvedValue({});
    });

    it("never marks absent units sold by default — a partial upload means 'not included', not 'sold'", async () => {
      const result = await syncInventory([unit("VIN1")] as never);
      expect(result).toMatchObject({ updated: 1, added: 0, removed: 0, failed: 0 });
      expect(mocks.update).toHaveBeenCalledTimes(1);
      expect(mocks.update).toHaveBeenCalledWith(
        "r1",
        expect.objectContaining({ status: "available" })
      );
      expect(mocks.update).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: "sold" })
      );
    });

    it("marks only the absent units sold when an explicit full feed opts in", async () => {
      const result = await syncInventory([unit("VIN1")] as never, { markMissingSold: true });
      expect(result).toMatchObject({ updated: 1, added: 0, removed: 1, failed: 0 });
      expect(mocks.update).toHaveBeenCalledWith("r2", { status: "sold" });
      expect(mocks.update).not.toHaveBeenCalledWith("r1", { status: "sold" });
    });

    it("refuses to sell the whole lot from an EMPTY feed even with markMissingSold", async () => {
      await expect(syncInventory([] as never, { markMissingSold: true })).rejects.toThrow(
        /Refusing to mark inventory sold/
      );
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("refuses when every incoming row lacks a VIN (a feed with no identity cannot archive anything)", async () => {
      await expect(
        syncInventory([{ ...(unit("") as object), vin: "" }] as never, { markMissingSold: true })
      ).rejects.toThrow(/Refusing to mark inventory sold/);
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it("surfaces a failed existing-inventory read instead of proceeding to writes", async () => {
      mocks.getFullList.mockReset().mockRejectedValue(new Error("pb down"));
      await expect(
        syncInventory([unit("VIN1")] as never, { markMissingSold: true })
      ).rejects.toThrow("pb down");
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("throws loudly when no dealership is selected instead of reporting a green 'synced 0'", async () => {
      mocks.getCurrentDealerId.mockReturnValue(null as unknown as string);
      await expect(syncInventory([unit("VIN1")] as never)).rejects.toThrow(/No dealership/);
    });
  });
});
