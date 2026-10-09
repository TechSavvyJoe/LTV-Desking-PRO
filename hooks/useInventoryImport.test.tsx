import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INITIAL_DEAL_DATA,
  INITIAL_FILTER_DATA,
  INITIAL_SETTINGS,
  SAMPLE_INVENTORY,
} from "../constants";

const mocks = vi.hoisted(() => ({
  role: "admin",
  parseFile: vi.fn(),
  syncInventory: vi.fn(),
  getInventory: vi.fn(),
  addInventoryItem: vi.fn(),
  decodeVin: vi.fn(),
  generateFavoritesPdf: vi.fn(),
  setMessage: vi.fn(),
  setInventory: vi.fn(),
  setActiveVehicle: vi.fn(),
  setFocusVin: vi.fn(),
}));
vi.mock("../context/DealContext", () => ({
  useDealContext: () => ({
    settings: INITIAL_SETTINGS,
    dealData: INITIAL_DEAL_DATA,
    filters: { ...INITIAL_FILTER_DATA, creditScore: 720, monthlyIncome: 6500, monthlyDebt: null },
    customerName: "Synthetic buyer",
    salespersonName: "Test manager",
    setMessage: mocks.setMessage,
    setInventory: mocks.setInventory,
    setActiveVehicle: mocks.setActiveVehicle,
    setFocusVin: mocks.setFocusVin,
    setPagination: vi.fn(),
    fileName: "",
    setFileName: vi.fn(),
    safeFavorites: [SAMPLE_INVENTORY[0]],
    safeLenderProfiles: [
      {
        id: "active",
        name: "Synthetic program",
        tiers: [{ name: "Prime", minFico: 700, maxFico: 850 }],
      },
      { id: "inactive", name: "Inactive program", active: false, tiers: [] },
    ],
  }),
}));
vi.mock("../lib/pocketbase", () => ({
  getCurrentUser: () => ({ role: mocks.role }),
  getCurrentDealerId: () => "test-dealer",
}));
vi.mock("../lib/api", () => ({
  getInventory: mocks.getInventory,
  syncInventory: mocks.syncInventory,
  addInventoryItem: mocks.addInventoryItem,
  logDealEvent: vi.fn().mockResolvedValue(null),
}));
vi.mock("../services/fileParser", () => ({ parseFile: mocks.parseFile }));
vi.mock("../services/vinDecoder", () => ({ decodeVin: mocks.decodeVin }));
vi.mock("../services/pdfGenerator", () => ({ generateFavoritesPdf: mocks.generateFavoritesPdf }));
vi.mock("../utils/downloadBlob", () => ({ downloadBlob: vi.fn() }));
vi.mock("../lib/analytics", () => ({ capture: vi.fn() }));
import { useInventoryImport } from "./useInventoryImport";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "admin";
  mocks.parseFile.mockResolvedValue({ vehicles: [SAMPLE_INVENTORY[0]], skipped: 0, reasons: [] });
  mocks.syncInventory.mockResolvedValue({
    added: 1,
    updated: 0,
    removed: 0,
    failed: 0,
    archivingSkipped: false,
  });
  mocks.getInventory.mockResolvedValue([]);
  mocks.decodeVin.mockResolvedValue({ year: 2024, make: "Ford", model: "Escape" });
  mocks.addInventoryItem.mockResolvedValue(null);
  mocks.generateFavoritesPdf.mockResolvedValue(new Blob(["test pdf"]));
});
afterEach(cleanup);

const uploadEvent = () =>
  ({
    target: { files: [new File(["synthetic"], "inventory.csv", { type: "text/csv" })] },
  }) as unknown as React.ChangeEvent<HTMLInputElement>;
async function lookup(
  result: ReturnType<typeof renderHook<ReturnType<typeof useInventoryImport>, unknown>>["result"]
) {
  act(() => result.current.setVinLookup("1HGCM82633A004352"));
  await act(async () => result.current.handleVinLookup());
}

describe("Inventory import safety", () => {
  it("persists explicit condition and reloads the confirmed server value", async () => {
    const vehicle = { ...SAMPLE_INVENTORY[0]!, condition: "certified" as const };
    mocks.parseFile.mockResolvedValue({ vehicles: [vehicle], skipped: 0, reasons: [] });
    mocks.getInventory.mockResolvedValue([
      {
        id: "saved",
        vin: vehicle.vin,
        year: 2024,
        make: "Ford",
        model: "Escape",
        price: 30000,
        mileage: 20000,
        condition: "certified",
        status: "available",
      },
    ]);
    const { result } = renderHook(useInventoryImport);
    await act(async () => result.current.handleFileUpload(uploadEvent()));
    expect(mocks.syncInventory).toHaveBeenCalledWith(
      [expect.objectContaining({ condition: "certified" })],
      { markMissingSold: true }
    );
    expect(mocks.setInventory).toHaveBeenCalledWith([
      expect.objectContaining({ id: "saved", condition: "certified" }),
    ]);
  });

  it("retains omitted units when the parser rejects any rows", async () => {
    mocks.parseFile.mockResolvedValue({
      vehicles: [SAMPLE_INVENTORY[0]],
      skipped: 1,
      reasons: ["invalid price"],
    });
    const { result } = renderHook(useInventoryImport);
    await act(async () => result.current.handleFileUpload(uploadEvent()));
    expect(mocks.syncInventory).toHaveBeenCalledWith(expect.any(Array), { markMissingSold: false });
    expect(mocks.setMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "warning",
        text: expect.stringContaining("Omitted vehicles were kept available"),
      })
    );
  });
  it("does not modify an existing VIN when decoding", async () => {
    mocks.getInventory.mockResolvedValue([
      { vin: "1HGCM82633A004352", price: 29000, mileage: 40000 },
    ]);
    const { result } = renderHook(useInventoryImport);
    await lookup(result);
    expect(mocks.addInventoryItem).not.toHaveBeenCalled();
    expect(mocks.syncInventory).not.toHaveBeenCalled();
    expect(mocks.setInventory).not.toHaveBeenCalled();
    expect(result.current.vinLookupResult).toContain("already in inventory");
  });
  it("never installs a local-only vehicle or claims success when persistence fails", async () => {
    const { result } = renderHook(useInventoryImport);
    await lookup(result);
    expect(mocks.setInventory).not.toHaveBeenCalled();
    expect(result.current.vinLookupResult).toContain("Couldn't save");
  });
  it("adds a persisted vehicle with its server id and unknown mileage", async () => {
    mocks.addInventoryItem.mockResolvedValue({
      id: "server-id",
      vin: "1HGCM82633A004352",
      year: 2024,
      make: "Ford",
      model: "Escape",
      price: 0,
      mileage: 0,
      mileageUnknown: true,
    });
    const { result } = renderHook(useInventoryImport);
    await lookup(result);
    expect(mocks.setActiveVehicle).toHaveBeenCalledWith(
      expect.objectContaining({ id: "server-id", mileage: "N/A" })
    );
    expect(mocks.setFocusVin).toHaveBeenCalledWith("1HGCM82633A004352");
  });
  it("blocks a non-admin VIN write before contacting the decoder", async () => {
    mocks.role = "sales";
    const { result } = renderHook(useInventoryImport);
    await lookup(result);
    expect(mocks.decodeVin).not.toHaveBeenCalled();
    expect(mocks.addInventoryItem).not.toHaveBeenCalled();
  });
  it("keeps comparison PDF lender results pending for missing debt and excludes inactive programs", async () => {
    const { result } = renderHook(useInventoryImport);
    await act(async () => result.current.handleDownloadFavorites());
    const eligibility = mocks.generateFavoritesPdf.mock.calls[0]![0][0].lenderEligibility;
    expect(eligibility).toHaveLength(1);
    expect(eligibility[0]).toMatchObject({
      name: "Synthetic program",
      eligible: false,
      status: "pending",
    });
  });
});
