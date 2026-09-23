import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { computeProcessedInventory, useProcessedInventory } from "./useProcessedInventory";
import {
  DEFAULT_LENDER_PROFILES,
  INITIAL_DEAL_DATA,
  INITIAL_FILTER_DATA,
  INITIAL_SETTINGS,
} from "../constants";
import type { FilterData, LenderProfile, Vehicle } from "../types";

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

  it("threads filters.monthlyDebt into scoring so a maxDti lender's fit changes with it [P1-regression]", () => {
    const dtiLender: LenderProfile = {
      id: "dti-bank",
      name: "DTI Bank",
      active: true,
      maxDti: 45,
      tiers: [{ name: "Tier 1", minFico: 600 }],
    };

    const baseInput = {
      inventory: [sampleVehicle],
      lenderProfiles: [dtiLender],
      dealData: { ...INITIAL_DEAL_DATA, loanTerm: 72, interestRate: 8.5 },
      settings: INITIAL_SETTINGS,
      searchQuery: "",
      inventorySort: { key: null, direction: "asc" as const },
      pagination: { currentPage: 1, itemsPerPage: 15 },
    };

    const withDebt = computeProcessedInventory({
      ...baseInput,
      filters: { ...INITIAL_FILTER_DATA, creditScore: 700, monthlyIncome: 3000, monthlyDebt: 200 },
    });
    const withoutDebt = computeProcessedInventory({
      ...baseInput,
      filters: { ...INITIAL_FILTER_DATA, creditScore: 700, monthlyIncome: 3000, monthlyDebt: null },
    });

    expect(withDebt.unitsPerLender["dti-bank"]).toBe(1);
    expect(withDebt.processedInventory[0]?.fitCount).toBe(1);
    // Without monthlyDebt the DTI constraint can't be evaluated, so the lender
    // is "pending" rather than fit.
    expect(withoutDebt.unitsPerLender["dti-bank"]).toBe(0);
    expect(withoutDebt.processedInventory[0]?.fitCount).toBe(0);
  });

  it("rescopes lender fits through the memoized hook when only filters.monthlyDebt changes [P1-regression: memo deps]", () => {
    const dtiLender: LenderProfile = {
      id: "dti-bank",
      name: "DTI Bank",
      active: true,
      maxDti: 45,
      tiers: [{ name: "Tier 1", minFico: 600 }],
    };
    // Stable references across rerenders so only `filters` (and therefore
    // monthlyDebt) changes between renders — isolates the useMemo dep list.
    const inventory = [sampleVehicle];
    const lenderProfiles = [dtiLender];
    const dealData = { ...INITIAL_DEAL_DATA, loanTerm: 72, interestRate: 8.5 };
    const settings = INITIAL_SETTINGS;

    const { result, rerender } = renderHook(
      (filters: FilterData) =>
        useProcessedInventory({
          inventory,
          lenderProfiles,
          dealData,
          filters,
          settings,
          searchQuery: "",
          inventorySort: { key: null, direction: "asc" },
          pagination: { currentPage: 1, itemsPerPage: 15 },
        }),
      {
        initialProps: {
          ...INITIAL_FILTER_DATA,
          creditScore: 700,
          monthlyIncome: 3000,
          monthlyDebt: null,
        } as FilterData,
      }
    );

    expect(result.current.unitsPerLender["dti-bank"]).toBe(0);

    rerender({ ...INITIAL_FILTER_DATA, creditScore: 700, monthlyIncome: 3000, monthlyDebt: 200 });

    expect(result.current.unitsPerLender["dti-bank"]).toBe(1);
  });
});
