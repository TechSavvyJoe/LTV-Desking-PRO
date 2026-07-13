import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentDealerId: vi.fn(() => "dealer-1"),
  getCurrentUser: vi.fn(() => ({ id: "user-1", role: "admin" as const })),
  withPbRetry: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  getFullList: vi.fn(),
  getList: vi.fn(),
  create: vi.fn(),
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
});
