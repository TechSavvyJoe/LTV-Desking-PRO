import { describe, expect, it } from "vitest";
import { computeProcessedInventory } from "./useProcessedInventory";
import {
  DEFAULT_LENDER_PROFILES,
  INITIAL_DEAL_DATA,
  INITIAL_FILTER_DATA,
  INITIAL_SETTINGS,
} from "../constants";
import type { Vehicle } from "../types";

const sampleVehicle: Vehicle = {
  id: "v1",
  vehicle: "2020 Honda Accord",
  stock: "A1",
  vin: "1HGCV1F3XLA000001",
  modelYear: 2020,
  mileage: 45000,
  price: 22000,
  jdPower: 20000,
  jdPowerRetail: 23000,
  unitCost: 18000,
  baseOutTheDoorPrice: "N/A",
  make: "Honda",
  model: "Accord",
};

describe("computeProcessedInventory", () => {
  it("scores inventory and seeds unitsPerLender for active lenders", () => {
    const result = computeProcessedInventory({
      inventory: [sampleVehicle],
      lenderProfiles: DEFAULT_LENDER_PROFILES,
      dealData: { ...INITIAL_DEAL_DATA, loanTerm: 72, interestRate: 8.5 },
      filters: INITIAL_FILTER_DATA,
      settings: INITIAL_SETTINGS,
      searchQuery: "",
      inventorySort: { key: "approvalScore", direction: "desc" },
      pagination: { currentPage: 1, itemsPerPage: 15 },
    });

    expect(result.processedInventory).toHaveLength(1);
    expect(typeof result.processedInventory[0]?.monthlyPayment).toBe("number");
    expect(Object.keys(result.unitsPerLender).length).toBeGreaterThan(0);
    expect(result.paginatedInventory).toHaveLength(1);
  });

  it("filters by search query before pagination", () => {
    const other: Vehicle = {
      ...sampleVehicle,
      id: "v2",
      vin: "1HGCV1F3XLA000002",
      vehicle: "2012 Honda Civic",
      stock: "B2",
      model: "Civic",
      modelYear: 2012,
    };
    const result = computeProcessedInventory({
      inventory: [sampleVehicle, other],
      lenderProfiles: DEFAULT_LENDER_PROFILES,
      dealData: INITIAL_DEAL_DATA,
      filters: INITIAL_FILTER_DATA,
      settings: INITIAL_SETTINGS,
      searchQuery: "2012 Honda Civic",
      inventorySort: { key: null, direction: "asc" },
      pagination: { currentPage: 5, itemsPerPage: 2 },
    });

    expect(result.filteredInventory).toHaveLength(1);
    expect(result.paginatedInventory).toHaveLength(1);
  });
});
