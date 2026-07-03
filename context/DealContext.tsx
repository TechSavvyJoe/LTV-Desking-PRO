import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  getInventory,
  getLenderProfiles,
  getSavedDeals,
  getDealerSettings,
  updateDealerSettings,
  updateInventoryItem,
  subscribeToInventory,
  subscribeToSavedDeals,
} from "../lib/api";
import { isAuthenticated } from "../lib/auth";
import type {
  Vehicle,
  DealData,
  FilterData,
  SortConfig,
  LenderProfile,
  Message,
  ValidationErrors,
  CalculatedVehicle,
  SavedDeal,
  Settings,
} from "../types";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useSafeData } from "../hooks/useSafeData";
import { useDebouncedValue } from "../hooks/useDebounce";
import {
  INITIAL_DEAL_DATA,
  INITIAL_FILTER_DATA,
  SAMPLE_INVENTORY,
  DEFAULT_LENDER_PROFILES,
  STORAGE_KEYS,
  INITIAL_SETTINGS,
} from "../constants";
import { calculateFinancials } from "../services/calculator";
import { lenderFitForVehicle, unitsForEachLender } from "../services/lenderFit";
import { scoreApprovalOdds } from "../services/approvalScorer";
import { normalizeAiSettings } from "../lib/aiModelRegistry";
import { mapPocketBaseSavedDeal, toAppState } from "../lib/dealMappers";

interface DealContextType {
  // State
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  inventory: Vehicle[];
  setInventory: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  dealData: DealData;
  setDealData: React.Dispatch<React.SetStateAction<DealData>>;
  filters: FilterData;
  setFilters: React.Dispatch<React.SetStateAction<FilterData>>;
  message: Message | null;
  setMessage: React.Dispatch<React.SetStateAction<Message | null>>;
  errors: ValidationErrors;
  setErrors: React.Dispatch<React.SetStateAction<ValidationErrors>>;
  customerName: string;
  setCustomerName: React.Dispatch<React.SetStateAction<string>>;
  salespersonName: string;
  setSalespersonName: React.Dispatch<React.SetStateAction<string>>;
  activeVehicle: CalculatedVehicle | null;
  setActiveVehicle: React.Dispatch<React.SetStateAction<CalculatedVehicle | null>>;
  isDealDirty: boolean;
  setIsDealDirty: React.Dispatch<React.SetStateAction<boolean>>;
  favorites: Vehicle[];
  setFavorites: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  lenderProfiles: LenderProfile[];
  setLenderProfiles: React.Dispatch<React.SetStateAction<LenderProfile[]>>;
  savedDeals: SavedDeal[];
  setSavedDeals: React.Dispatch<React.SetStateAction<SavedDeal[]>>;
  scratchPadNotes: string;
  setScratchPadNotes: React.Dispatch<React.SetStateAction<string>>;

  // UI State
  inventorySort: SortConfig;
  setInventorySort: React.Dispatch<React.SetStateAction<SortConfig>>;
  /** VIN of the desk's focused row. Persisted (with sort) in STORAGE_KEYS.DESK_UI. */
  focusVin: string | null;
  setFocusVin: React.Dispatch<React.SetStateAction<string | null>>;
  /** Free-text search over vehicle + stock + vin. Session-only (not persisted). */
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  favSort: SortConfig;
  setFavSort: React.Dispatch<React.SetStateAction<SortConfig>>;
  pagination: { currentPage: number; itemsPerPage: number };
  setPagination: React.Dispatch<
    React.SetStateAction<{ currentPage: number; itemsPerPage: number }>
  >;
  fileName: string;
  setFileName: React.Dispatch<React.SetStateAction<string>>;
  expandedInventoryRows: Set<string>;
  setExpandedInventoryRows: React.Dispatch<React.SetStateAction<Set<string>>>;
  expandedFavoriteRows: Set<string>;
  setExpandedFavoriteRows: React.Dispatch<React.SetStateAction<Set<string>>>;

  // Computed / Helpers
  safeInventory: Vehicle[];
  safeFavorites: Vehicle[];
  safeLenderProfiles: LenderProfile[];
  safeSavedDeals: SavedDeal[];
  processedInventory: CalculatedVehicle[];
  filteredInventory: CalculatedVehicle[];
  sortedInventory: CalculatedVehicle[];
  paginatedInventory: CalculatedVehicle[];
  /** Units each active lender currently fits, keyed by lender id. [rec 2] */
  unitsPerLender: Record<string, number>;

  // Actions
  toggleFavorite: (vin: string) => void;
  toggleInventoryRowExpansion: (vin: string) => void;
  toggleFavoriteRowExpansion: (vin: string) => void;
  handleInventoryUpdate: (vin: string, updatedData: Partial<Vehicle>) => void;
  clearDealAndFilters: () => void;
  loadSampleData: () => void;
  isShowroomMode: boolean;
  setIsShowroomMode: React.Dispatch<React.SetStateAction<boolean>>;

  // Async data-load status (initial PocketBase fetch)
  dataLoading: boolean;
  dataError: string | null;
  refetchData: () => void;
}

const DealContext = createContext<DealContextType | undefined>(undefined);

/**
 * Redesign desk UI state, persisted as ONE small versioned JSON blob under
 * STORAGE_KEYS.DESK_UI (focusVin + sort; search is deliberately session-only).
 * [reconciliation 15]
 */
interface DeskUiState {
  v: 1;
  focusVin: string | null;
  sort: SortConfig;
}

const DESK_UI_FALLBACK: DeskUiState = {
  v: 1,
  focusVin: null,
  sort: { key: null, direction: "asc" },
};

const loadDeskUi = (): DeskUiState => {
  if (typeof window === "undefined") return DESK_UI_FALLBACK;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.DESK_UI);
    if (!raw) return DESK_UI_FALLBACK;
    const parsed = JSON.parse(raw) as Partial<DeskUiState> | null;
    if (!parsed || parsed.v !== 1) return DESK_UI_FALLBACK;
    return {
      v: 1,
      focusVin: typeof parsed.focusVin === "string" ? parsed.focusVin : null,
      sort:
        parsed.sort && typeof parsed.sort === "object"
          ? {
              key: typeof parsed.sort.key === "string" ? parsed.sort.key : null,
              direction: parsed.sort.direction === "desc" ? "desc" : "asc",
            }
          : DESK_UI_FALLBACK.sort,
    };
  } catch (error) {
    console.warn("Failed to load desk UI state", error);
    return DESK_UI_FALLBACK;
  }
};

const loadInitialSettings = (): Settings => {
  if (typeof window === "undefined") return INITIAL_SETTINGS;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!stored) return INITIAL_SETTINGS;

    const parsed = JSON.parse(stored) as Partial<Settings>;
    return {
      ...INITIAL_SETTINGS,
      ...parsed,
      ltvThresholds: {
        ...INITIAL_SETTINGS.ltvThresholds,
        ...parsed.ltvThresholds,
      },
      ai: normalizeAiSettings(parsed.ai),
    };
  } catch (error) {
    console.warn("Failed to load stored settings", error);
    return INITIAL_SETTINGS;
  }
};

export const DealProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(loadInitialSettings);

  // Data State with PB sync
  const [inventory, setInventory] = useState<Vehicle[]>([]);
  const [dealData, setDealData] = useLocalStorage<DealData>(STORAGE_KEYS.DEAL_DATA, {
    ...INITIAL_DEAL_DATA,
    loanTerm: settings.defaultTerm,
    interestRate: settings.defaultApr,
    stateFees: settings.defaultStateFees,
  });
  const [filters, setFilters] = useLocalStorage<FilterData>(
    STORAGE_KEYS.FILTERS,
    INITIAL_FILTER_DATA
  );
  const [message, setMessage] = useState<Message | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});

  const [customerName, setCustomerName] = useState<string>("");
  const [salespersonName, setSalespersonName] = useState<string>("");
  const [activeVehicle, setActiveVehicle] = useState<CalculatedVehicle | null>(null);
  const [isDealDirty, setIsDealDirty] = useState<boolean>(false);

  const [favorites, setFavorites] = useLocalStorage<Vehicle[]>(STORAGE_KEYS.FAVORITES, []);
  const [lenderProfiles, setLenderProfiles] = useState<LenderProfile[]>([]);
  const [savedDeals, setSavedDeals] = useState<SavedDeal[]>([]);
  const [scratchPadNotes, setScratchPadNotes] = useLocalStorage<string>(
    STORAGE_KEYS.SCRATCH_PAD,
    ""
  );

  const [inventorySort, setInventorySort] = useState<SortConfig>(() => loadDeskUi().sort);
  const [favSort, setFavSort] = useState<SortConfig>({
    key: null,
    direction: "asc",
  });
  // Desk focus + search. focusVin persists in the DESK_UI blob; search is
  // deliberately session-only. [reconciliation 15]
  const [focusVin, setFocusVin] = useState<string | null>(() => loadDeskUi().focusVin);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Persist the desk UI blob whenever its parts change (single versioned key).
  useEffect(() => {
    try {
      const blob: DeskUiState = { v: 1, focusVin, sort: inventorySort };
      window.localStorage.setItem(STORAGE_KEYS.DESK_UI, JSON.stringify(blob));
    } catch (error) {
      console.warn("Failed to persist desk UI state", error);
    }
  }, [focusVin, inventorySort]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    itemsPerPage: 15,
  });
  const [fileName, setFileName] = useState<string>("Sample Data Loaded");
  const [expandedInventoryRows, setExpandedInventoryRows] = useState<Set<string>>(new Set());
  const [expandedFavoriteRows, setExpandedFavoriteRows] = useState<Set<string>>(new Set());
  const [isShowroomMode, setIsShowroomMode] = useState<boolean>(false);

  // Initial-load status so views can show a loading skeleton / error+retry
  // instead of silently falling through to the empty state. [frontend-state]
  const [dataLoading, setDataLoading] = useState<boolean>(isAuthenticated());
  const [dataError, setDataError] = useState<string | null>(null);
  // Monotonic token: a newer load invalidates an older in-flight one so a stale
  // (e.g. previous-dealer) response can't overwrite current data. [frontend-state]
  const loadSeqRef = useRef(0);

  // Safe Data Hooks
  const safeInventory = useSafeData(inventory);
  const safeFavorites = useSafeData(favorites);
  const safeLenderProfiles = useSafeData(lenderProfiles);
  const safeSavedDeals = useSafeData(savedDeals);

  const normalizeSavedDeal = (deal: Partial<SavedDeal>): SavedDeal | null => {
    if (!deal || typeof deal !== "object") return null;
    const baseVehicle = deal.vehicle || deal.vehicleSnapshot;
    const normalizedVehicle: CalculatedVehicle | null = baseVehicle
      ? {
          ...baseVehicle,
          vehicle: baseVehicle.vehicle || `${baseVehicle.modelYear || ""}`,
          vin: baseVehicle.vin || `VIN-${baseVehicle.stock || ""}-${baseVehicle.modelYear || ""}`,
        }
      : null;

    if (!normalizedVehicle) return null;

    return {
      id: String(deal.id || Date.now().toString()),
      date: deal.date || deal.createdAt || new Date().toISOString(),
      createdAt: deal.createdAt || deal.date || new Date().toISOString(),
      customerName: deal.customerName || "",
      salespersonName: deal.salespersonName || "",
      vehicle: normalizedVehicle,
      dealData: deal.dealData || INITIAL_DEAL_DATA,
      customerFilters: {
        creditScore: deal.customerFilters?.creditScore ?? null,
        monthlyIncome: deal.customerFilters?.monthlyIncome ?? null,
      },
      notes: deal.notes || "",
      vehicleSnapshot: deal.vehicleSnapshot,
      dealNumber: deal.dealNumber,
      vehicleVin: deal.vehicleVin,
    };
  };

  const normalizedSavedDeals = useMemo(() => {
    return safeSavedDeals.map((d) => normalizeSavedDeal(d)).filter((d): d is SavedDeal => !!d);
  }, [safeSavedDeals]);

  // Map a PocketBase InventoryItem to the app's Vehicle shape.
  const mapInventoryItem = (i: {
    id: string;
    year: number;
    make: string;
    model: string;
    trim?: string;
    stockNumber?: string;
    vin: string;
    mileage?: number;
    price: number;
    jdPower?: number;
    jdPowerRetail?: number;
    unitCost?: number;
  }): Vehicle => ({
    id: i.id,
    vehicle: `${i.year} ${i.make} ${i.model} ${i.trim || ""}`.trim(),
    stock: i.stockNumber || "N/A",
    vin: i.vin,
    modelYear: i.year,
    // typeof, not ||: a legitimate 0-mile unit must stay 0 — `0 || "N/A"`
    // coerced new/in-transit units to "N/A", which blocked Structure Deal. [C-tables]
    mileage: typeof i.mileage === "number" ? i.mileage : "N/A",
    price: i.price,
    jdPower: typeof i.jdPower === "number" && i.jdPower > 0 ? i.jdPower : "N/A",
    jdPowerRetail:
      typeof i.jdPowerRetail === "number" && i.jdPowerRetail > 0 ? i.jdPowerRetail : "N/A",
    unitCost: typeof i.unitCost === "number" && i.unitCost > 0 ? i.unitCost : "N/A",
    baseOutTheDoorPrice: "N/A",
    make: i.make,
    model: i.model,
    trim: i.trim,
  });

  // Load all dealer-scoped data. Guarded by a sequence token so a stale response
  // (e.g. the previous dealer, after a superadmin switch) can never overwrite the
  // current dealer's data. [frontend-state]
  const loadData = useCallback(async () => {
    if (!isAuthenticated()) {
      setDataLoading(false);
      return;
    }
    const seq = ++loadSeqRef.current;
    setDataLoading(true);
    setDataError(null);
    try {
      // throwOnError makes failures reach THIS catch — without it the API layer
      // swallows errors and returns [], rendering "Inventory is empty" instead
      // of the error/retry state on a network failure. [C10]
      const [inv, lenders, deals, dealerSettings] = await Promise.all([
        getInventory({ throwOnError: true }),
        getLenderProfiles({ throwOnError: true }),
        getSavedDeals({ throwOnError: true }),
        getDealerSettings({ throwOnError: true }),
      ]);

      if (seq !== loadSeqRef.current) return; // superseded by a newer load

      setInventory(inv.map(mapInventoryItem));
      setLenderProfiles(lenders);
      setSavedDeals(deals.map(mapPocketBaseSavedDeal));

      if (dealerSettings) {
        setSettings((prev) => ({
          ...prev,
          defaultTerm: dealerSettings.defaultTerm || prev.defaultTerm,
          defaultApr: dealerSettings.defaultApr || prev.defaultApr,
          defaultStateFees: dealerSettings.defaultStateFees || prev.defaultStateFees,
          docFee: dealerSettings.docFee,
          cvrFee: dealerSettings.cvrFee,
          defaultState: toAppState(dealerSettings.defaultState, prev.defaultState),
          outOfStateTransitFee: dealerSettings.outOfStateTransitFee,
          customTaxRate: dealerSettings.customTaxRate ?? null,
          miTradeInCreditCap: dealerSettings.miTradeInCreditCap ?? prev.miTradeInCreditCap,
          vscPrice: dealerSettings.vscPrice ?? prev.vscPrice,
          gapPrice: dealerSettings.gapPrice ?? prev.gapPrice,
          ai: normalizeAiSettings(prev.ai),
        }));
      }
    } catch (error) {
      console.error("Failed to load data from PocketBase", error);
      if (seq === loadSeqRef.current) {
        setDataError("We couldn't load your data. Check your connection and try again.");
      }
    } finally {
      if (seq === loadSeqRef.current) setDataLoading(false);
    }
  }, []);

  // Bumped whenever the superadmin dealer override changes so the effect below
  // tears down and re-creates the realtime subscriptions for the NEW dealer.
  // Previously the handler only re-ran loadData; the subscriptions stayed bound
  // to the old dealer context (or stayed permanently no-op if none existed at
  // subscribe time). [C-regression]
  const [dealerEpoch, setDealerEpoch] = useState(0);

  useEffect(() => {
    const handleDealerChange = () => setDealerEpoch((n) => n + 1);
    window.addEventListener("dealerOverrideChanged", handleDealerChange);
    return () => window.removeEventListener("dealerOverrideChanged", handleDealerChange);
  }, []);

  // Effects: initial load + realtime subscriptions. The subscribe helpers no
  // longer fetch on mount (loadData owns the initial fetch), avoiding a
  // double-fetch race. Re-runs on dealerEpoch so a dealer switch rebinds the
  // subscriptions, not just the fetch. [frontend-state]
  useEffect(() => {
    if (!isAuthenticated()) return;

    loadData();

    const unsubInv = subscribeToInventory((data) => setInventory(data.map(mapInventoryItem)));
    const unsubDeals = subscribeToSavedDeals((data) =>
      setSavedDeals(data.map(mapPocketBaseSavedDeal))
    );

    return () => {
      unsubInv();
      unsubDeals();
    };
  }, [loadData, dealerEpoch]);

  // Warn before the page unloads with an unsaved in-progress deal — a reload,
  // accidental tab close, or logout otherwise silently discards the customer's
  // structure mid-conversation. [C-auth/G65-adjacent]
  useEffect(() => {
    if (!isDealDirty || !activeVehicle) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDealDirty, activeVehicle]);

  // Sync settings changes to PocketBase
  const updateSettings: React.Dispatch<React.SetStateAction<Settings>> = useCallback((action) => {
    setSettings((prev) => {
      const newSettings =
        typeof action === "function" ? (action as (prev: Settings) => Settings)(prev) : action;

      // Fire and forget update
      try {
        window.localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(newSettings));
      } catch (error) {
        console.warn("Failed to persist local settings", error);
      }

      updateDealerSettings({
        defaultTerm: newSettings.defaultTerm,
        defaultApr: newSettings.defaultApr,
        defaultStateFees: newSettings.defaultStateFees,
        docFee: newSettings.docFee,
        cvrFee: newSettings.cvrFee,
        defaultState: newSettings.defaultState,
        outOfStateTransitFee: newSettings.outOfStateTransitFee,
        customTaxRate: newSettings.customTaxRate ?? undefined,
        miTradeInCreditCap: newSettings.miTradeInCreditCap,
        vscPrice: newSettings.vscPrice,
        gapPrice: newSettings.gapPrice,
      }).catch((err) => console.error("Failed to persist settings", err));

      return newSettings;
    });
  }, []);

  useEffect(() => {
    if (activeVehicle) {
      setIsDealDirty(true);
    }
  }, [dealData, filters, customerName, salespersonName, activeVehicle]);

  // Debounce expensive calculation inputs
  const debouncedDealData = useDebouncedValue(dealData, 300);
  const debouncedFilters = useDebouncedValue(filters, 300);

  // Merged deal + customer view the rules engine consumes (debounced, like the
  // financial inputs, so slider moves don't thrash the per-lender pass).
  const mergedDeal = useMemo(
    () =>
      ({ ...debouncedDealData, ...(debouncedFilters || INITIAL_FILTER_DATA) }) as DealData &
        FilterData,
    [debouncedDealData, debouncedFilters]
  );

  // Computed — THE single scoring pass. Every vehicle gets its financials, its
  // per-lender fit (rules engine), and its hardened approval score in one place,
  // so the desk, inventory, lenders, and reports screens all read the same
  // numbers instead of recomputing locally. [Phase 2]
  const processedInventory = useMemo(() => {
    const credit = {
      creditScore: debouncedFilters?.creditScore ?? null,
      monthlyIncome: debouncedFilters?.monthlyIncome ?? null,
    };
    return safeInventory.map((item): CalculatedVehicle => {
      const calc = calculateFinancials(item, debouncedDealData, settings);
      const fit = lenderFitForVehicle(calc, mergedDeal, safeLenderProfiles);
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
  }, [safeInventory, debouncedDealData, settings, debouncedFilters, mergedDeal, safeLenderProfiles]);

  // Units each active lender fits across the current (scored) inventory — feeds
  // the Lenders matrix "units fitting" bars. [reconciliation 2]
  const unitsPerLender = useMemo(
    () => unitsForEachLender(processedInventory, mergedDeal, safeLenderProfiles),
    [processedInventory, mergedDeal, safeLenderProfiles]
  );

  const filteredInventory = useMemo(() => {
    const safeFilters = debouncedFilters || INITIAL_FILTER_DATA;
    const query = searchQuery.trim().toLowerCase();
    const result = processedInventory.filter((item) => {
      // Free-text search across vehicle + stock + vin. [reconciliation 12]
      const searchMatch =
        !query ||
        [item.vehicle, item.stock, item.vin].some((s) =>
          (s || "").toLowerCase().includes(query)
        );

      // Min approval odds, applied post-scoring. [reconciliation 12]
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

      // New maxMiles filter
      const maxMilesMatch =
        !safeFilters.maxMiles ||
        (typeof item.mileage === "number" && item.mileage <= safeFilters.maxMiles);

      // New maxOtdLtv filter
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
    return result;
  }, [processedInventory, debouncedFilters, searchQuery]);

  const sortedInventory = useMemo(() => {
    if (!inventorySort.key) return filteredInventory;
    const sorted = [...filteredInventory];
    sorted.sort((a, b) => {
      const sortKey = inventorySort.key as keyof CalculatedVehicle;
      const valA = a[sortKey];
      const valB = b[sortKey];

      const isAInvalid = valA === null || valA === "Error" || valA === "N/A" || valA === undefined;
      const isBInvalid = valB === null || valB === "Error" || valB === "N/A" || valB === undefined;

      if (isAInvalid && isBInvalid) return 0;
      if (isAInvalid) return 1;
      if (isBInvalid) return -1;

      if (typeof valA === "number" && typeof valB === "number") {
        return inventorySort.direction === "asc" ? valA - valB : valB - valA;
      }
      if (typeof valA === "string" && typeof valB === "string") {
        return inventorySort.direction === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      return 0;
    });
    return sorted;
  }, [filteredInventory, inventorySort]);

  const paginatedInventory = useMemo(() => {
    if (!sortedInventory) return [];
    const { currentPage, itemsPerPage } = pagination || {
      currentPage: 1,
      itemsPerPage: 15,
    };
    if (itemsPerPage === Infinity) return sortedInventory;
    // Clamp to the last real page: narrowing filters while on page 2+ used to
    // leave currentPage past the end, showing a false "No vehicles match your
    // filters" even when matches existed. [C18]
    const totalPages = Math.max(1, Math.ceil(sortedInventory.length / itemsPerPage));
    const page = Math.min(Math.max(1, currentPage), totalPages);
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedInventory.slice(start, end);
  }, [sortedInventory, pagination]);

  // Keep the pagination STATE in range too, so the pager control never shows
  // "page 5 of 2" after filters narrow the list. [C18]
  useEffect(() => {
    const { currentPage, itemsPerPage } = pagination;
    if (itemsPerPage === Infinity) return;
    const totalPages = Math.max(1, Math.ceil(sortedInventory.length / itemsPerPage));
    if (currentPage > totalPages) {
      setPagination((prev) => ({ ...prev, currentPage: totalPages }));
    }
  }, [sortedInventory.length, pagination]);

  // Actions
  const toggleFavorite = useCallback(
    (vin: string) => {
      setFavorites((prev) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const isFav = safePrev.some((f) => f.vin === vin);
        if (isFav) {
          return safePrev.filter((f) => f.vin !== vin);
        } else {
          const vehicleToAdd = (inventory || []).find((v) => v.vin === vin);
          return vehicleToAdd ? [...safePrev, vehicleToAdd] : safePrev;
        }
      });
    },
    [inventory, setFavorites]
  );

  const toggleInventoryRowExpansion = useCallback(
    (vin: string) => {
      setExpandedInventoryRows((prev) => {
        // Only allow one expanded row at a time
        if (prev.has(vin)) {
          // If clicking the same row, collapse it
          return new Set();
        } else {
          // Collapse all others and expand this one
          return new Set([vin]);
        }
      });
    },
    [setExpandedInventoryRows]
  );

  const toggleFavoriteRowExpansion = useCallback(
    (vin: string) => {
      setExpandedFavoriteRows((prev) => {
        // Only allow one expanded row at a time
        if (prev.has(vin)) {
          // If clicking the same row, collapse it
          return new Set();
        } else {
          // Collapse all others and expand this one
          return new Set([vin]);
        }
      });
    },
    [setExpandedFavoriteRows]
  );

  const handleInventoryUpdate = useCallback(
    async (vin: string, updatedData: Partial<Vehicle>) => {
      const item = inventory.find((v) => v.vin === vin);

      // Snapshot before the optimistic write so we can roll back on failure.
      const prevInventory = inventory;
      const prevFavorites = favorites;

      // Optimistic update.
      setInventory((prev) =>
        (prev || []).map((v) => (v.vin === vin ? { ...v, ...updatedData } : v))
      );
      setFavorites((prev) =>
        Array.isArray(prev) ? prev.map((f) => (f.vin === vin ? { ...f, ...updatedData } : f)) : prev
      );

      // Persist. updateInventoryItem returns null on failure — when it does (or
      // there's no backing record id), revert the optimistic state and tell the
      // user, instead of leaving the UI silently diverged from the DB. [frontend-state]
      if (item && item.id) {
        const apiData: Partial<Vehicle> = { ...updatedData };
        if (apiData.mileage === "N/A") delete apiData.mileage;
        const result = await updateInventoryItem(
          item.id,
          apiData as unknown as Parameters<typeof updateInventoryItem>[1]
        );
        if (!result) {
          setInventory(prevInventory);
          setFavorites(prevFavorites);
          setMessage({
            type: "error",
            text: "Couldn't save that change to the server. Your edit was reverted.",
          });
        }
      }
    },
    [inventory, favorites, setInventory, setFavorites, setMessage]
  );

  // Keep favorites in sync with live inventory so a CSV re-sync or an inline
  // edit doesn't leave a stale snapshot behind. Favorites for vehicles no longer
  // in inventory keep their last-known data. [frontend-state]
  useEffect(() => {
    setFavorites((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      const byVin = new Map(inventory.map((v) => [v.vin, v]));
      let changed = false;
      const next = prev.map((fav) => {
        const live = byVin.get(fav.vin);
        if (live) {
          changed = true;
          return live;
        }
        return fav;
      });
      return changed ? next : prev;
    });
  }, [inventory, setFavorites]);

  const clearDealAndFilters = useCallback(() => {
    setDealData({
      ...INITIAL_DEAL_DATA,
      loanTerm: settings.defaultTerm,
      interestRate: settings.defaultApr,
      stateFees: settings.defaultStateFees,
    });
    setFilters(INITIAL_FILTER_DATA);
    setErrors({});
    setCustomerName("");
    setSalespersonName("");
    setScratchPadNotes("");
    setInventorySort({ key: null, direction: "asc" });
    setFavSort({ key: null, direction: "asc" });
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  }, [
    setDealData,
    setFilters,
    setErrors,
    setScratchPadNotes,
    settings,
    setInventorySort,
    setFavSort,
    setPagination,
  ]);

  const loadSampleData = useCallback(() => {
    // Reset all filters and deal data to ensure the new inventory is visible
    setDealData({
      ...INITIAL_DEAL_DATA,
      loanTerm: settings.defaultTerm,
      interestRate: settings.defaultApr,
      stateFees: settings.defaultStateFees,
    });
    setFilters(INITIAL_FILTER_DATA);
    setErrors({});
    setCustomerName("");
    setSalespersonName("");
    setScratchPadNotes("");
    setActiveVehicle(null);
    setInventorySort({ key: null, direction: "asc" });
    setFavSort({ key: null, direction: "asc" });

    // Load the inventory
    setInventory(SAMPLE_INVENTORY);
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
    setMessage({
      type: "success",
      text: "Sample inventory loaded and filters reset.",
    });
  }, [
    setInventory,
    setPagination,
    setDealData,
    setFilters,
    setErrors,
    setCustomerName,
    setSalespersonName,
    setScratchPadNotes,
    setActiveVehicle,
    settings,
    setInventorySort,
    setFavSort,
  ]);

  // Memoize the context value so consumers don't re-render on every provider
  // render (e.g. each keystroke); identity now changes only when a dependency
  // actually changes. [perf]
  const value = useMemo(
    () => ({
      settings,
      setSettings: updateSettings, // Use wrapped setter for persistence
      inventory,
      setInventory,
      dealData,
      setDealData,
      filters,
      setFilters,
      message,
      setMessage,
      errors,
      setErrors,
      customerName,
      setCustomerName,
      salespersonName,
      setSalespersonName,
      activeVehicle,
      setActiveVehicle,
      isDealDirty,
      setIsDealDirty,
      favorites,
      setFavorites,
      lenderProfiles,
      setLenderProfiles,
      savedDeals,
      setSavedDeals,
      scratchPadNotes,
      setScratchPadNotes,
      inventorySort,
      setInventorySort,
      focusVin,
      setFocusVin,
      searchQuery,
      setSearchQuery,
      favSort,
      setFavSort,
      pagination,
      setPagination,
      fileName,
      setFileName,
      expandedInventoryRows,
      setExpandedInventoryRows,
      expandedFavoriteRows,
      setExpandedFavoriteRows,
      safeInventory,
      safeFavorites,
      safeLenderProfiles,
      safeSavedDeals: normalizedSavedDeals,
      processedInventory,
      filteredInventory,
      sortedInventory,
      paginatedInventory,
      unitsPerLender,
      toggleFavorite,
      toggleInventoryRowExpansion,
      toggleFavoriteRowExpansion,
      handleInventoryUpdate,
      clearDealAndFilters,
      loadSampleData,
      isShowroomMode,
      setIsShowroomMode,
      dataLoading,
      dataError,
      refetchData: loadData,
    }),
    [
      settings,
      updateSettings,
      inventory,
      setInventory,
      dealData,
      setDealData,
      filters,
      setFilters,
      message,
      setMessage,
      errors,
      setErrors,
      customerName,
      salespersonName,
      activeVehicle,
      isDealDirty,
      favorites,
      setFavorites,
      lenderProfiles,
      savedDeals,
      scratchPadNotes,
      setScratchPadNotes,
      inventorySort,
      focusVin,
      searchQuery,
      favSort,
      pagination,
      fileName,
      expandedInventoryRows,
      expandedFavoriteRows,
      safeInventory,
      safeFavorites,
      safeLenderProfiles,
      normalizedSavedDeals,
      processedInventory,
      filteredInventory,
      sortedInventory,
      paginatedInventory,
      unitsPerLender,
      toggleFavorite,
      toggleInventoryRowExpansion,
      toggleFavoriteRowExpansion,
      handleInventoryUpdate,
      clearDealAndFilters,
      loadSampleData,
      isShowroomMode,
      dataLoading,
      dataError,
      loadData,
    ]
  );

  return <DealContext.Provider value={value}>{children}</DealContext.Provider>;
};

export const useDealContext = () => {
  const context = useContext(DealContext);
  if (context === undefined) {
    throw new Error("useDealContext must be used within a DealProvider");
  }
  return context;
};
