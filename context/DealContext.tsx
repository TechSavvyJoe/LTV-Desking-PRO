import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getInventory,
  getLenderProfiles,
  getSavedDeals,
  getDealerSettings,
  updateDealerSettings,
  updateInventoryItem,
  subscribeToInventory,
  subscribeToSavedDeals,
  subscribeToLenderProfiles,
} from "../lib/api";
import { isAuthenticated } from "../lib/auth";
import { toast } from "../lib/toast";
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
import type { InventoryItem } from "../lib/pocketbase";
import { getCurrentDealerId } from "../lib/pocketbase";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useSafeData } from "../hooks/useSafeData";
import { useDebouncedValue } from "../hooks/useDebounce";
import { useProcessedInventory } from "../hooks/useProcessedInventory";
import {
  INITIAL_DEAL_DATA,
  INITIAL_FILTER_DATA,
  SAMPLE_INVENTORY,
  DEFAULT_LENDER_PROFILES,
  STORAGE_KEYS,
  INITIAL_SETTINGS,
  SETTINGS_CHANGED_EVENT,
} from "../constants";
import {
  mapDealData,
  mapPocketBaseSavedDeal,
  normalizeStoredTaxRate,
  toAppState,
} from "../lib/dealMappers";
import { createLogger } from "../lib/logger";
import { queryClient, queryKeys } from "../lib/queryClient";
import { capture } from "../lib/analytics";
import { normalizeAiSettings } from "../lib/aiModelRegistry";

const dealContextLogger = createLogger("deal-context");

const EMPTY_VEHICLES: Vehicle[] = [];
const EMPTY_LENDERS: LenderProfile[] = [];
const EMPTY_DEALS: SavedDeal[] = [];

/**
 * DealContext — app state hub (server arrays + UI + active deal editing).
 *
 * Server arrays (inventory, lenderProfiles, savedDeals) are driven by React
 * Query useQuery inside DealProvider. Context setters update the RQ cache via
 * setQueryData so consumers keep the same DealContextType API. Realtime
 * subscriptions also write setQueryData. Local UI + deal editing stay in
 * React state.
 */

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
  // "Ranked by odds" is the product's default ordering on BOTH the desk and
  // the inventory screen — a null key left the Inventory screen unsorted
  // (PB insertion order) on first run. [review/P2]
  sort: { key: "approvalScore", direction: "desc" },
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
    dealContextLogger.warn("Failed to load desk UI state", { error });
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
    dealContextLogger.warn("Failed to load stored settings", { error });
    return INITIAL_SETTINGS;
  }
};

// Pure mappers moved to module scope (was inside provider).
// - Stable references (no re-creation per render).
// - Usable inside queryFn closures without stale capture.
// - Slims the provider component body.
// - normalizeSavedDeal was documented "hoisted" but lived in render.
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
    dealData: mapDealData(deal.dealData),
    customerFilters: {
      creditScore: deal.customerFilters?.creditScore ?? null,
      monthlyIncome: deal.customerFilters?.monthlyIncome ?? null,
      monthlyDebt: deal.customerFilters?.monthlyDebt ?? null,
    },
    notes: deal.notes || "",
    vehicleSnapshot: deal.vehicleSnapshot,
    dealNumber: deal.dealNumber,
    vehicleVin: deal.vehicleVin,
  };
};

// Map a PocketBase InventoryItem to the app's Vehicle shape.
// Accepts InventoryItem (from api) — extra fields (dealer, status) are ignored.
const mapInventoryItem = (i: InventoryItem): Vehicle => ({
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

export const DealProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(loadInitialSettings);

  // Bumped whenever the superadmin dealer override changes so queries + subs
  // rebind to the NEW dealer.
  const [dealerEpoch, setDealerEpoch] = useState(0);
  const dealerId = getCurrentDealerId();
  const dealerScope = dealerId || "no-dealer";
  // Stable key tuples — a fresh array each render would recreate set* callbacks
  // and thrash every consumer (infinite localStorage write loops in tests).
  const inventoryKey = useMemo(() => [...queryKeys.inventory, dealerScope] as const, [dealerScope]);
  const lenderProfilesKey = useMemo(
    () => [...queryKeys.lenderProfiles, dealerScope] as const,
    [dealerScope]
  );
  const savedDealsKey = useMemo(
    () => [...queryKeys.savedDeals, dealerScope] as const,
    [dealerScope]
  );
  const dealerSettingsKey = useMemo(
    () => [...queryKeys.dealerSettings, dealerScope] as const,
    [dealerScope]
  );
  const queriesEnabled = isAuthenticated();

  const inventoryQuery = useQuery({
    queryKey: inventoryKey,
    queryFn: async () => {
      const raw = await getInventory();
      return raw.map(mapInventoryItem);
    },
    enabled: queriesEnabled,
  });
  const lenderProfilesQuery = useQuery({
    queryKey: lenderProfilesKey,
    queryFn: () => getLenderProfiles(),
    enabled: queriesEnabled,
  });
  const savedDealsQuery = useQuery({
    queryKey: savedDealsKey,
    queryFn: async () => {
      const raw = await getSavedDeals();
      return raw.map(mapPocketBaseSavedDeal);
    },
    enabled: queriesEnabled,
  });
  const dealerSettingsQuery = useQuery({
    queryKey: dealerSettingsKey,
    queryFn: () => getDealerSettings(),
    enabled: queriesEnabled,
  });

  // RQ cache is the source of truth for these arrays.
  const inventory = inventoryQuery.data ?? EMPTY_VEHICLES;
  const lenderProfiles = lenderProfilesQuery.data ?? EMPTY_LENDERS;
  const savedDeals = savedDealsQuery.data ?? EMPTY_DEALS;

  const setInventory = useCallback<React.Dispatch<React.SetStateAction<Vehicle[]>>>(
    (action) => {
      queryClient.setQueryData<Vehicle[]>(inventoryKey, (old) => {
        const prev = old ?? [];
        return typeof action === "function" ? action(prev) : action;
      });
    },
    [inventoryKey]
  );
  const setLenderProfiles = useCallback<React.Dispatch<React.SetStateAction<LenderProfile[]>>>(
    (action) => {
      queryClient.setQueryData<LenderProfile[]>(lenderProfilesKey, (old) => {
        const prev = old ?? [];
        return typeof action === "function" ? action(prev) : action;
      });
    },
    [lenderProfilesKey]
  );
  const setSavedDeals = useCallback<React.Dispatch<React.SetStateAction<SavedDeal[]>>>(
    (action) => {
      queryClient.setQueryData<SavedDeal[]>(savedDealsKey, (old) => {
        const prev = old ?? [];
        return typeof action === "function" ? action(prev) : action;
      });
    },
    [savedDealsKey]
  );

  const dataLoading =
    queriesEnabled &&
    (inventoryQuery.isLoading || lenderProfilesQuery.isLoading || savedDealsQuery.isLoading);
  const dataError =
    inventoryQuery.error || lenderProfilesQuery.error || savedDealsQuery.error
      ? "We couldn't load your data. Check your connection and try again."
      : null;

  const refetchData = useCallback(() => {
    void Promise.all([
      inventoryQuery.refetch(),
      lenderProfilesQuery.refetch(),
      savedDealsQuery.refetch(),
      dealerSettingsQuery.refetch(),
    ]);
  }, [inventoryQuery, lenderProfilesQuery, savedDealsQuery, dealerSettingsQuery]);

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
      dealContextLogger.warn("Failed to persist desk UI state", { error });
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

  // Safe Data Hooks
  const safeInventory = useSafeData(inventory);
  const safeFavorites = useSafeData(favorites);
  const safeLenderProfiles = useSafeData(lenderProfiles);
  const safeSavedDeals = useSafeData(savedDeals);

  const normalizedSavedDeals = useMemo(() => {
    return safeSavedDeals.map((d) => normalizeSavedDeal(d)).filter((d): d is SavedDeal => !!d);
  }, [safeSavedDeals]);

  // Apply dealer settings from RQ into local settings once per successful fetch.
  useEffect(() => {
    const dealerSettings = dealerSettingsQuery.data;
    if (!dealerSettings) return;
    setSettings((prev) => ({
      ...prev,
      defaultTerm: dealerSettings.defaultTerm ?? prev.defaultTerm,
      defaultApr: dealerSettings.defaultApr ?? prev.defaultApr,
      defaultStateFees: dealerSettings.defaultStateFees ?? prev.defaultStateFees,
      docFee: dealerSettings.docFee,
      cvrFee: dealerSettings.cvrFee,
      defaultState: toAppState(dealerSettings.defaultState, prev.defaultState),
      outOfStateTransitFee: dealerSettings.outOfStateTransitFee,
      customTaxRate: normalizeStoredTaxRate(dealerSettings.customTaxRate),
      miTradeInCreditCap: dealerSettings.miTradeInCreditCap ?? prev.miTradeInCreditCap,
      vscPrice: dealerSettings.vscPrice ?? prev.vscPrice,
      gapPrice: dealerSettings.gapPrice ?? prev.gapPrice,
      ai: normalizeAiSettings(prev.ai),
    }));
  }, [dealerSettingsQuery.data]);

  useEffect(() => {
    const handleDealerChange = () => {
      queryClient.removeQueries({ queryKey: queryKeys.inventory });
      queryClient.removeQueries({ queryKey: queryKeys.lenderProfiles });
      queryClient.removeQueries({ queryKey: queryKeys.savedDeals });
      queryClient.removeQueries({ queryKey: queryKeys.dealerSettings });
      setDealerEpoch((n) => n + 1);
    };
    window.addEventListener("dealerOverrideChanged", handleDealerChange);
    return () => window.removeEventListener("dealerOverrideChanged", handleDealerChange);
  }, []);

  // Realtime subscriptions write setQueryData so useQuery remains source of truth.
  // dealerEpoch forces teardown/rebind on dealer switch. [frontend-state]
  useEffect(() => {
    if (!isAuthenticated()) return;

    const unsubInv = subscribeToInventory((data) => {
      setInventory(data.map(mapInventoryItem));
    });
    const unsubDeals = subscribeToSavedDeals((data) => {
      setSavedDeals(data.map(mapPocketBaseSavedDeal));
    });
    const unsubLenders = subscribeToLenderProfiles((data) => {
      setLenderProfiles(data);
    });

    return () => {
      unsubInv();
      unsubDeals();
      unsubLenders();
    };
  }, [dealerEpoch, dealerId, setInventory, setSavedDeals, setLenderProfiles]);

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
        // Same-tab notification for consumers reading settings outside this
        // provider (hooks/useSettings) — the native "storage" event only
        // fires in OTHER tabs. [settings-staleness]
        window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      } catch (error) {
        dealContextLogger.warn("Failed to persist local settings", { error });
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
      }).catch((err) => {
        dealContextLogger.error("Failed to persist settings", err);
        toast.error("Couldn't sync settings to the server — local defaults still apply.");
      });

      return newSettings;
    });
  }, []);

  // Mark the deal dirty only on USER edits while a vehicle is active. The desk
  // auto-focuses the top-ranked row (which sets activeVehicle), and that
  // transition alone must NOT arm the beforeunload "unsaved deal" warning —
  // otherwise every session shows the leave-site dialog untouched. [review/P1]
  const prevDirtyVinRef = useRef<string | null>(null);
  useEffect(() => {
    const vin = activeVehicle?.vin ?? null;
    const vehicleChanged = vin !== prevDirtyVinRef.current;
    prevDirtyVinRef.current = vin;
    if (!activeVehicle) return;
    if (vehicleChanged) return; // focusing/auto-selection is not an edit
    setIsDealDirty(true);
  }, [dealData, filters, customerName, salespersonName, activeVehicle]);

  // Debounce expensive calculation inputs
  const debouncedDealData = useDebouncedValue(dealData, 300);
  const debouncedFilters = useDebouncedValue(filters, 300);

  const {
    processedInventory,
    unitsPerLender,
    filteredInventory,
    sortedInventory,
    paginatedInventory,
  } = useProcessedInventory({
    inventory: safeInventory,
    lenderProfiles: safeLenderProfiles,
    dealData: debouncedDealData,
    filters: debouncedFilters || INITIAL_FILTER_DATA,
    settings,
    searchQuery,
    inventorySort,
    pagination,
  });

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

      // Optimistic update into RQ cache (source of truth).
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
        const result = await updateInventoryItem(item.id, apiData as Partial<InventoryItem>);
        if (!result) {
          setInventory(prevInventory);
          setFavorites(prevFavorites);
          setMessage({
            type: "error",
            text: "Couldn't save that change to the server. Your edit was reverted.",
          });
        } else {
          const serverVehicle = mapInventoryItem(result);
          setInventory((prev) => (prev || []).map((v) => (v.vin === vin ? serverVehicle : v)));
          setFavorites((prev) =>
            Array.isArray(prev) ? prev.map((f) => (f.vin === vin ? serverVehicle : f)) : prev
          );
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

  // Shared reset for deal-local UI state (removes duplication between
  // clearDealAndFilters + loadSampleData). Settings-derived defaults preserved.
  const resetDealState = useCallback(() => {
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
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  }, [setDealData, setFilters, setErrors, setScratchPadNotes, settings, setPagination]);

  const clearDealAndFilters = useCallback(() => {
    resetDealState();
    setInventorySort({ key: null, direction: "asc" });
    setFavSort({ key: null, direction: "asc" });
  }, [resetDealState, setInventorySort, setFavSort]);

  const loadSampleData = useCallback(() => {
    // Reset all filters and deal data to ensure the new inventory is visible
    resetDealState();
    setActiveVehicle(null);
    setInventorySort({ key: null, direction: "asc" });
    setFavSort({ key: null, direction: "asc" });

    // Load the sample operating surface: inventory plus lender programs. The
    // desk's odds, fit counts, and PDFs are only useful when both sides exist.
    setInventory(SAMPLE_INVENTORY);
    setLenderProfiles(DEFAULT_LENDER_PROFILES);
    capture("sample_loaded", {
      vehicles: SAMPLE_INVENTORY.length,
      lenders: DEFAULT_LENDER_PROFILES.length,
    });
    setMessage({
      type: "success",
      text: "Sample inventory and lender programs loaded.",
    });
  }, [
    resetDealState,
    setActiveVehicle,
    setInventorySort,
    setFavSort,
    setInventory,
    setLenderProfiles,
    setMessage,
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
      refetchData,
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
      setLenderProfiles,
      savedDeals,
      setSavedDeals,
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
      refetchData,
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
