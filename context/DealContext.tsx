import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
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
import { useSettings } from "../hooks/useSettings";
import { useSafeData } from "../hooks/useSafeData";
import {
  INITIAL_DEAL_DATA,
  INITIAL_FILTER_DATA,
  SAMPLE_INVENTORY,
  DEFAULT_LENDER_PROFILES,
  STORAGE_KEYS,
  INITIAL_SETTINGS,
} from "../constants";
import { calculateFinancials } from "../services/calculator";

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
  setActiveVehicle: React.Dispatch<
    React.SetStateAction<CalculatedVehicle | null>
  >;
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

  // Actions
  toggleFavorite: (vin: string) => void;
  toggleInventoryRowExpansion: (vin: string) => void;
  toggleFavoriteRowExpansion: (vin: string) => void;
  handleInventoryUpdate: (vin: string, updatedData: Partial<Vehicle>) => void;
  clearDealAndFilters: () => void;
  loadSampleData: () => void;
  isShowroomMode: boolean;
  setIsShowroomMode: React.Dispatch<React.SetStateAction<boolean>>;
}

const DealContext = createContext<DealContextType | undefined>(undefined);

export const DealProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);

  // Data State with PB sync
  const [inventory, setInventory] = useState<Vehicle[]>([]);
  const [dealData, setDealData] = useLocalStorage<DealData>(
    STORAGE_KEYS.DEAL_DATA,
    {
      ...INITIAL_DEAL_DATA,
      loanTerm: settings.defaultTerm,
      interestRate: settings.defaultApr,
      stateFees: settings.defaultStateFees,
    }
  );
  const [filters, setFilters] = useLocalStorage<FilterData>(
    STORAGE_KEYS.FILTERS,
    INITIAL_FILTER_DATA
  );
  const [message, setMessage] = useState<Message | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});

  const [customerName, setCustomerName] = useState<string>("");
  const [salespersonName, setSalespersonName] = useState<string>("");
  const [activeVehicle, setActiveVehicle] = useState<CalculatedVehicle | null>(
    null
  );
  const [isDealDirty, setIsDealDirty] = useState<boolean>(false);

  const [favorites, setFavorites] = useLocalStorage<Vehicle[]>(
    STORAGE_KEYS.FAVORITES,
    []
  );
  const [lenderProfiles, setLenderProfiles] = useState<LenderProfile[]>([]);
  const [savedDeals, setSavedDeals] = useState<SavedDeal[]>([]);
  const [scratchPadNotes, setScratchPadNotes] = useLocalStorage<string>(
    STORAGE_KEYS.SCRATCH_PAD,
    ""
  );

  const [inventorySort, setInventorySort] = useState<SortConfig>({
    key: null,
    direction: "asc",
  });
  const [favSort, setFavSort] = useState<SortConfig>({
    key: null,
    direction: "asc",
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    itemsPerPage: 15,
  });
  const [fileName, setFileName] = useState<string>("Sample Data Loaded");
  const [expandedInventoryRows, setExpandedInventoryRows] = useState<
    Set<string>
  >(new Set());
  const [expandedFavoriteRows, setExpandedFavoriteRows] = useState<Set<string>>(
    new Set()
  );
  const [isShowroomMode, setIsShowroomMode] = useState<boolean>(false);

  // Safe Data Hooks
  const safeInventory = useSafeData(inventory);
  const safeFavorites = useSafeData(favorites);
  const safeLenderProfiles = useSafeData(lenderProfiles);
  const safeSavedDeals = useSafeData(savedDeals);

  const normalizeSavedDeal = (deal: any): SavedDeal | null => {
    if (!deal || typeof deal !== "object") return null;
    const baseVehicle =
      (deal.vehicle as CalculatedVehicle) ||
      (deal.vehicleSnapshot as CalculatedVehicle);
    const normalizedVehicle = baseVehicle
      ? ({
          ...baseVehicle,
          vehicle: baseVehicle.vehicle || `${baseVehicle.modelYear || ""}`,
          vin:
            baseVehicle.vin ||
            `VIN-${baseVehicle.stock || ""}-${baseVehicle.modelYear || ""}`,
        } as CalculatedVehicle)
      : null;

    return {
      id: String(deal.id || Date.now().toString()),
      date: deal.date || deal.createdAt || new Date().toISOString(),
      createdAt: deal.createdAt || deal.date || new Date().toISOString(),
      customerName: deal.customerName || "",
      salespersonName: deal.salespersonName || "",
      vehicle: normalizedVehicle as CalculatedVehicle,
      dealData: deal.dealData,
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
    return safeSavedDeals
      .map((d) => normalizeSavedDeal(d))
      .filter((d): d is SavedDeal => !!d);
  }, [safeSavedDeals]);

  // Effects
  // Load initial data from PocketBase
  useEffect(() => {
    console.log(
      "[DealContext] useEffect running, isAuthenticated:",
      isAuthenticated()
    );
    if (!isAuthenticated()) {
      console.log("[DealContext] Not authenticated, skipping data load");
      return;
    }

    const loadData = async () => {
      console.log("[DealContext] loadData starting...");
      try {
        const [inv, lenders, deals, dealerSettings] = await Promise.all([
          getInventory(), // Returns InventoryItem[]
          getLenderProfiles(), // Returns LenderProfile[] (PB)
          getSavedDeals(), // Returns SavedDeal[] (PB)
          getDealerSettings(),
        ]);

        console.log("[DealContext] Data loaded:", {
          inventory: inv.length,
          lenders: lenders.length,
          deals: deals.length,
          settings: !!dealerSettings,
        });

        // Map InventoryItem -> Vehicle
        const mappedInventory: Vehicle[] = inv.map((i) => ({
          id: i.id,
          vehicle: `${i.year} ${i.make} ${i.model} ${i.trim || ""}`.trim(),
          stock: i.stockNumber || "N/A",
          vin: i.vin,
          modelYear: i.year,
          mileage: i.mileage || "N/A",
          price: i.price,
          jdPower: i.jdPower || "N/A",
          jdPowerRetail: i.jdPowerRetail || "N/A",
          unitCost: i.unitCost || "N/A",
          baseOutTheDoorPrice: "N/A", // Calculate or pull
          make: i.make,
          model: i.model,
          trim: i.trim,
        }));
        setInventory(mappedInventory);

        // Map LenderProfile (PB) -> LenderProfile (App)
        // Always set lender profiles (even if empty, to clear stale data)
        console.log("[DealContext] Setting lender profiles:", lenders.length);
        setLenderProfiles(
          lenders as unknown as import("../types").LenderProfile[]
        );

        // Map SavedDeal (PB) -> SavedDeal (App)
        const mappedDeals: SavedDeal[] = deals.map((d) => ({
          id: d.id,
          date: d.created, // Use created date as date
          customerName: d.customerName || "Unknown",
          salespersonName: d.salespersonName || "Unknown",
          vehicle: d.vehicleData as any, // Cast from Record
          dealData: d.dealData as any,
          customerFilters: {
            creditScore: (d.dealData as any)?.creditScore || null,
            monthlyIncome: (d.dealData as any)?.monthlyIncome || null,
          },
        }));
        setSavedDeals(mappedDeals);

        if (dealerSettings) {
          setSettings((prev) => ({
            ...prev,
            defaultTerm: dealerSettings.defaultLoanTerm || prev.defaultTerm,
            defaultApr: dealerSettings.defaultInterestRate || prev.defaultApr,
            defaultStateFees:
              dealerSettings.defaultStateFees || prev.defaultStateFees,
            docFee: dealerSettings.docFee,
            cvrFee: dealerSettings.cvrFee,
            defaultState: dealerSettings.defaultState as any,
            outOfStateTransitFee: dealerSettings.outOfStateTransitFee,
            customTaxRate: dealerSettings.customTaxRate ?? null,
          }));
        }
      } catch (error) {
        console.error("Failed to load data from PocketBase", error);
      }
    };

    loadData();

    // subscriptions
    const unsubInv = subscribeToInventory((data) => {
      // Map data again
      const mapped: Vehicle[] = data.map((i) => ({
        id: i.id,
        vehicle: `${i.year} ${i.make} ${i.model} ${i.trim || ""}`.trim(),
        stock: i.stockNumber || "N/A",
        vin: i.vin,
        modelYear: i.year,
        mileage: i.mileage || "N/A",
        price: i.price,
        jdPower: i.jdPower || "N/A",
        jdPowerRetail: i.jdPowerRetail || "N/A",
        unitCost: i.unitCost || "N/A",
        baseOutTheDoorPrice: "N/A",
        make: i.make,
        model: i.model,
        trim: i.trim,
      }));
      setInventory(mapped);
    });
    const unsubDeals = subscribeToSavedDeals((data) => {
      // Map deals
      const mapped: SavedDeal[] = data.map((d) => ({
        id: d.id,
        date: d.created,
        customerName: d.customerName || "Unknown",
        salespersonName: d.salespersonName || "Unknown",
        vehicle: d.vehicleData as any,
        dealData: d.dealData as any,
        customerFilters: {
          creditScore: (d.dealData as any)?.creditScore || null,
          monthlyIncome: (d.dealData as any)?.monthlyIncome || null,
        },
      }));
      setSavedDeals(mapped);
    });

    return () => {
      unsubInv();
      unsubDeals();
    };
  }, []);

  // Sync settings changes to PocketBase
  const updateSettings: React.Dispatch<React.SetStateAction<Settings>> =
    useCallback((action) => {
      setSettings((prev) => {
        const newSettings =
          typeof action === "function"
            ? (action as (prev: Settings) => Settings)(prev)
            : action;

        // Fire and forget update
        updateDealerSettings({
          defaultLoanTerm: newSettings.defaultTerm,
          defaultInterestRate: newSettings.defaultApr,
          defaultStateFees: newSettings.defaultStateFees,
          docFee: newSettings.docFee,
          cvrFee: newSettings.cvrFee,
          defaultState: newSettings.defaultState,
          outOfStateTransitFee: newSettings.outOfStateTransitFee,
          customTaxRate: newSettings.customTaxRate ?? undefined,
        }).catch((err) => console.error("Failed to persist settings", err));

        return newSettings;
      });
    }, []);

  useEffect(() => {
    if (activeVehicle) {
      setIsDealDirty(true);
    }
  }, [dealData, filters, customerName, salespersonName, activeVehicle]);

  // Computed
  const processedInventory = useMemo(() => {
    return safeInventory.map((item) =>
      calculateFinancials(item, dealData, settings)
    );
  }, [safeInventory, dealData, settings]);

  const filteredInventory = useMemo(() => {
    const safeFilters = filters || INITIAL_FILTER_DATA;
    const result = processedInventory.filter((item) => {
      const vehicleMatch =
        !safeFilters.vehicle ||
        (item.vehicle || "")
          .toLowerCase()
          .includes(safeFilters.vehicle.toLowerCase());
      const maxPriceMatch =
        !safeFilters.maxPrice ||
        (typeof item.price === "number" && item.price <= safeFilters.maxPrice);
      const maxPaymentMatch =
        !safeFilters.maxPayment ||
        (typeof item.monthlyPayment === "number" &&
          item.monthlyPayment <= safeFilters.maxPayment);
      const vinMatch =
        !safeFilters.vin ||
        (item.vin || "").toLowerCase().includes(safeFilters.vin.toLowerCase());

      return vehicleMatch && maxPriceMatch && maxPaymentMatch && vinMatch;
    });
    return result;
  }, [processedInventory, filters]);

  const sortedInventory = useMemo(() => {
    if (!inventorySort.key) return filteredInventory;
    const sorted = [...filteredInventory];
    sorted.sort((a, b) => {
      const valA = a[inventorySort.key!];
      const valB = b[inventorySort.key!];

      const isAInvalid =
        valA === null ||
        valA === "Error" ||
        valA === "N/A" ||
        valA === undefined;
      const isBInvalid =
        valB === null ||
        valB === "Error" ||
        valB === "N/A" ||
        valB === undefined;

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
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedInventory.slice(start, end);
  }, [sortedInventory, pagination]);

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
      setInventory((prev) =>
        (prev || []).map((v) => (v.vin === vin ? { ...v, ...updatedData } : v))
      );
      setFavorites((prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((f) => (f.vin === vin ? { ...f, ...updatedData } : f));
      });

      // API Call
      const item = inventory.find((v) => v.vin === vin);
      if (item && item.id) {
        try {
          const apiData: any = { ...updatedData };
          // Handle mileage if present and "N/A"
          if (apiData.mileage === "N/A") {
            delete apiData.mileage;
          }
          await updateInventoryItem(item.id, apiData);
        } catch (e) {
          console.error("Failed to update inventory item in backend", e);
          // Revert? For now just log.
        }
      }
    },
    [inventory, setInventory, setFavorites]
  );

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

  const value = {
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
    toggleFavorite,
    toggleInventoryRowExpansion,
    toggleFavoriteRowExpansion,
    handleInventoryUpdate,
    clearDealAndFilters,
    loadSampleData,
    isShowroomMode,
    setIsShowroomMode,
  };

  return <DealContext.Provider value={value}>{children}</DealContext.Provider>;
};

export const useDealContext = () => {
  const context = useContext(DealContext);
  if (context === undefined) {
    throw new Error("useDealContext must be used within a DealProvider");
  }
  return context;
};
