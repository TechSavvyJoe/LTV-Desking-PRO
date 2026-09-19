import { useMemo } from "react";
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

type Pagination = ProcessedInventoryInput["pagination"];

interface ScoreInput {
  inventory: Vehicle[];
  lenderProfiles: LenderProfile[];
  dealData: DealData;
  creditScore: number | null;
  monthlyIncome: number | null;
  settings: Settings;
}

interface ScoreResult {
  processedInventory: CalculatedVehicle[];
  unitsPerLender: Record<string, number>;
}

// ---------------------------------------------------------------------------
// The pipeline is split into four pure stages so the hook can memoize each one
// on only the inputs that affect it. Scoring (financials + lender fit + odds,
// three service calls per unit) is by far the expensive stage and depends only
// on the deal structure and the customer's credit inputs — NOT on the search
// box, sort column, page, or price/payment/mileage filters. Before this split a
// single memo re-scored the whole lot on every one of those changes, which is
// what made live desking feel sluggish on a large used-car catalog. [takeover
// P1 #20 / perf B-]
// ---------------------------------------------------------------------------

/** Stage 1 (expensive): financials + lender fit + approval odds per unit. */
export function scoreInventory(input: ScoreInput): ScoreResult {
  const { inventory, lenderProfiles, dealData, creditScore, monthlyIncome, settings } = input;

  // The rules engine only reads creditScore / monthlyIncome (plus the deal), so
  // scoring is keyed on those two primitives rather than the whole filter
  // object — changing a price or mileage filter must not trigger a rescore.
  const mergedDeal = {
    ...dealData,
    ...INITIAL_FILTER_DATA,
    creditScore,
    monthlyIncome,
  } as DealData & FilterData;
  const credit = { creditScore, monthlyIncome };

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

  return { processedInventory, unitsPerLender };
}

/** Stage 2 (cheap): search + customer filters over already-scored units. */
export function filterInventory(
  processedInventory: CalculatedVehicle[],
  filters: FilterData,
  searchQuery: string
): CalculatedVehicle[] {
  const safeFilters = filters || INITIAL_FILTER_DATA;
  const query = (searchQuery || "").trim().toLowerCase();

  return processedInventory.filter((item) => {
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
}

/** Stage 3 (cheap): stable sort on the requested column. */
export function sortInventory(
  filteredInventory: CalculatedVehicle[],
  inventorySort: SortConfig
): CalculatedVehicle[] {
  if (!inventorySort.key) return filteredInventory;
  const sortKey = inventorySort.key as keyof CalculatedVehicle;
  return [...filteredInventory].sort((a, b) =>
    compareSortValues(a[sortKey], b[sortKey], inventorySort.direction, "none")
  );
}

/** Stage 4 (cheap): page slice. */
export function paginateInventory(
  sortedInventory: CalculatedVehicle[],
  pagination: Pagination
): CalculatedVehicle[] {
  const { currentPage, itemsPerPage } = pagination || { currentPage: 1, itemsPerPage: 15 };
  if (itemsPerPage === Infinity) return sortedInventory;
  const totalPages = Math.max(1, Math.ceil(sortedInventory.length / itemsPerPage));
  const page = Math.min(Math.max(1, currentPage), totalPages);
  const start = (page - 1) * itemsPerPage;
  return sortedInventory.slice(start, start + itemsPerPage);
}

/**
 * Pure scoring + filter + sort + page slice used by DealProvider.
 * Exported for unit tests without mounting the full provider; composes the four
 * stages so its output is identical to the hook's.
 */
export function computeProcessedInventory(
  input: ProcessedInventoryInput
): ProcessedInventoryResult {
  const { inventory, lenderProfiles, dealData, filters, settings, searchQuery, inventorySort } =
    input;
  const safeFilters = filters || INITIAL_FILTER_DATA;

  const { processedInventory, unitsPerLender } = scoreInventory({
    inventory,
    lenderProfiles,
    dealData,
    creditScore: safeFilters.creditScore ?? null,
    monthlyIncome: safeFilters.monthlyIncome ?? null,
    settings,
  });
  const filteredInventory = filterInventory(processedInventory, safeFilters, searchQuery);
  const sortedInventory = sortInventory(filteredInventory, inventorySort);
  const paginatedInventory = paginateInventory(sortedInventory, input.pagination);

  return {
    processedInventory,
    unitsPerLender,
    filteredInventory,
    sortedInventory,
    paginatedInventory,
  };
}

/**
 * Hook wrapper around the pipeline for use inside DealProvider. Each stage is
 * memoized on its own inputs, so typing in the search box or changing the sort
 * only re-runs the cheap downstream stages — never the per-unit scoring.
 */
export function useProcessedInventory(input: ProcessedInventoryInput): ProcessedInventoryResult {
  const { inventory, lenderProfiles, dealData, filters, settings, searchQuery, inventorySort } =
    input;
  const pagination = input.pagination;
  const safeFilters = filters || INITIAL_FILTER_DATA;
  const creditScore = safeFilters.creditScore ?? null;
  const monthlyIncome = safeFilters.monthlyIncome ?? null;

  const scored = useMemo(
    () =>
      scoreInventory({ inventory, lenderProfiles, dealData, creditScore, monthlyIncome, settings }),
    [inventory, lenderProfiles, dealData, creditScore, monthlyIncome, settings]
  );

  const filteredInventory = useMemo(
    () => filterInventory(scored.processedInventory, safeFilters, searchQuery),
    [scored, safeFilters, searchQuery]
  );

  const sortedInventory = useMemo(
    () => sortInventory(filteredInventory, inventorySort),
    [filteredInventory, inventorySort]
  );

  const paginatedInventory = useMemo(
    () => paginateInventory(sortedInventory, pagination),
    [sortedInventory, pagination]
  );

  return useMemo(
    () => ({
      processedInventory: scored.processedInventory,
      unitsPerLender: scored.unitsPerLender,
      filteredInventory,
      sortedInventory,
      paginatedInventory,
    }),
    [scored, filteredInventory, sortedInventory, paginatedInventory]
  );
}

export default useProcessedInventory;
