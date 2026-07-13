import { useCallback, useMemo } from "react";
import type {
  CalculatedVehicle,
  DealData,
  FilterData,
  LenderProfile,
  Settings,
  SortConfig,
  Vehicle,
} from "../types";
import { INITIAL_FILTER_DATA } from "../constants";
import { calculateFinancials } from "../services/calculator";
import { lenderFitForVehicle } from "../services/lenderFit";
import { scoreApprovalOdds } from "../services/approvalScorer";
import { compareSortValues } from "../utils/sortComparator";

export interface ProcessedInventoryInput {
  inventory: Vehicle[];
  lenderProfiles: LenderProfile[];
  dealData: DealData;
  filters: FilterData;
  settings: Settings;
  searchQuery: string;
  inventorySort: SortConfig;
  pagination: { currentPage: number; itemsPerPage: number };
}

export interface ProcessedInventoryResult {
  processedInventory: CalculatedVehicle[];
  unitsPerLender: Record<string, number>;
  filteredInventory: CalculatedVehicle[];
  sortedInventory: CalculatedVehicle[];
  paginatedInventory: CalculatedVehicle[];
}

/**
 * Pure scoring + filter + sort + page slice used by DealProvider.
 * Exported for unit tests without mounting the full provider.
 */
export function computeProcessedInventory(
  input: ProcessedInventoryInput
): ProcessedInventoryResult {
  const {
    inventory,
    lenderProfiles,
    dealData,
    filters,
    settings,
    searchQuery,
    inventorySort,
    pagination,
  } = input;

  const safeFilters = filters || INITIAL_FILTER_DATA;
  const mergedDeal = { ...dealData, ...safeFilters } as DealData & FilterData;
  const credit = {
    creditScore: safeFilters.creditScore ?? null,
    monthlyIncome: safeFilters.monthlyIncome ?? null,
  };

  const unitsPerLender: Record<string, number> = {};
  for (const lender of lenderProfiles) {
    if (lender && lender.active !== false) unitsPerLender[lender.id] = 0;
  }

  const processedInventory = inventory.map((item): CalculatedVehicle => {
    const calc = calculateFinancials(item, dealData, settings);
    const fit = lenderFitForVehicle(calc, mergedDeal, lenderProfiles);
    for (const entry of fit.entries) {
      if (entry.eligible)
        unitsPerLender[entry.lenderId] = (unitsPerLender[entry.lenderId] ?? 0) + 1;
    }
    const appr = scoreApprovalOdds(calc, credit, fit.fitCount);
    return {
      ...calc,
      approvalScore: appr.internalScore,
      approvalBand: appr.band,
      ptiRatio: appr.ptiRatio,
      fitCount: fit.fitCount,
      fitNames: fit.fitNames,
    };
  });

  const query = searchQuery.trim().toLowerCase();
  const filteredInventory = processedInventory.filter((item) => {
    const searchMatch =
      !query ||
      [item.vehicle, item.stock, item.vin].some((s) => (s || "").toLowerCase().includes(query));
    const minScoreMatch =
      safeFilters.minScore == null ||
      (typeof item.approvalScore === "number" && item.approvalScore >= safeFilters.minScore);
    const vehicleMatch =
      !safeFilters.vehicle ||
      (item.vehicle || "").toLowerCase().includes(safeFilters.vehicle.toLowerCase());
    const maxPriceMatch =
      !safeFilters.maxPrice ||
      (typeof item.price === "number" && item.price <= safeFilters.maxPrice);
    const maxPaymentMatch =
      !safeFilters.maxPayment ||
      (typeof item.monthlyPayment === "number" && item.monthlyPayment <= safeFilters.maxPayment);
    const vinMatch =
      !safeFilters.vin || (item.vin || "").toLowerCase().includes(safeFilters.vin.toLowerCase());
    const maxMilesMatch =
      !safeFilters.maxMiles ||
      (typeof item.mileage === "number" && item.mileage <= safeFilters.maxMiles);
    const maxOtdLtvMatch =
      !safeFilters.maxOtdLtv ||
      (typeof item.otdLtv === "number" && item.otdLtv <= safeFilters.maxOtdLtv);

    return (
      searchMatch &&
      minScoreMatch &&
      vehicleMatch &&
      maxPriceMatch &&
      maxPaymentMatch &&
      vinMatch &&
      maxMilesMatch &&
      maxOtdLtvMatch
    );
  });

  const sortedInventory = !inventorySort.key
    ? filteredInventory
    : [...filteredInventory].sort((a, b) => {
        const sortKey = inventorySort.key as keyof CalculatedVehicle;
        return compareSortValues(a[sortKey], b[sortKey], inventorySort.direction, "none");
      });

  const { currentPage, itemsPerPage } = pagination || { currentPage: 1, itemsPerPage: 15 };
  let paginatedInventory = sortedInventory;
  if (itemsPerPage !== Infinity) {
    const totalPages = Math.max(1, Math.ceil(sortedInventory.length / itemsPerPage));
    const page = Math.min(Math.max(1, currentPage), totalPages);
    const start = (page - 1) * itemsPerPage;
    paginatedInventory = sortedInventory.slice(start, start + itemsPerPage);
  }

  return {
    processedInventory,
    unitsPerLender,
    filteredInventory,
    sortedInventory,
    paginatedInventory,
  };
}

/**
 * Hook wrapper around {@link computeProcessedInventory} for use inside DealProvider.
 */
export function useProcessedInventory(input: ProcessedInventoryInput): ProcessedInventoryResult {
  const {
    inventory,
    lenderProfiles,
    dealData,
    filters,
    settings,
    searchQuery,
    inventorySort,
    pagination,
  } = input;

  const compute = useCallback(
    () =>
      computeProcessedInventory({
        inventory,
        lenderProfiles,
        dealData,
        filters,
        settings,
        searchQuery,
        inventorySort,
        pagination,
      }),
    [inventory, lenderProfiles, dealData, filters, settings, searchQuery, inventorySort, pagination]
  );

  return useMemo(() => compute(), [compute]);
}

export default useProcessedInventory;
