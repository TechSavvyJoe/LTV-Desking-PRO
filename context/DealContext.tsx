import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
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
} from "../constants";
import { calculateFinancials } from "../services/calculator";

interface DealContextType {
  // State
  settings: Settings;
  setSettings: (settings: Settings) => void;
  inventory: Vehicle[];
  setInventory: (inventory: Vehicle[]) => void;
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
  setFavorites: (favorites: Vehicle[]) => void;
  lenderProfiles: LenderProfile[];
  setLenderProfiles: (profiles: LenderProfile[]) => void;
  savedDeals: SavedDeal[];
  setSavedDeals: (deals: SavedDeal[]) => void;
  scratchPadNotes: string;
  setScratchPadNotes: (notes: string) => void;

  // UI State
  inventorySort: SortConfig;
  setInventorySort: React.Dispatch<React.SetStateAction<SortConfig>>;
  favSort: SortConfig;
  setFavSort: React.Dispatch<React.SetStateAction<SortConfig>>;
  pagination: { currentPage: number; rowsPerPage: number };
  setPagination: React.Dispatch<
    React.SetStateAction<{ currentPage: number; rowsPerPage: number }>
  >;
  fileName: string;
  setFileName: React.Dispatch<React.SetStateAction<string>>;
  expandedInventoryRows: Set<string>;
  setExpandedInventoryRows: React.Dispatch<React.SetStateAction<Set<string>>>;

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
  handleInventoryUpdate: (vin: string, updatedData: Partial<Vehicle>) => void;
  clearDealAndFilters: () => void;
}

const DealContext = createContext<DealContextType | undefined>(undefined);

export const DealProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [settings, setSettings] = useSettings();
  const [inventory, setInventory] = useLocalStorage<Vehicle[]>(
    "ltvInventory_v2",
    SAMPLE_INVENTORY
  );
  const [dealData, setDealData] = useLocalStorage<DealData>("ltvDealData_v2", {
    ...INITIAL_DEAL_DATA,
    loanTerm: settings.defaultTerm,
    interestRate: settings.defaultApr,
    stateFees: settings.defaultStateFees,
  });
  const [filters, setFilters] = useLocalStorage<FilterData>(
    "ltvFilters_v2",
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
    "ltvFavorites_v2",
    []
  );
  const [lenderProfiles, setLenderProfiles] = useLocalStorage<LenderProfile[]>(
    "ltvBankProfiles_v2",
    DEFAULT_LENDER_PROFILES
  );
  const [savedDeals, setSavedDeals] = useLocalStorage<SavedDeal[]>(
    "ltvSavedDeals_v2",
    []
  );
  const [scratchPadNotes, setScratchPadNotes] = useLocalStorage<string>(
    "ltvScratchPad_v2",
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
    rowsPerPage: 15,
  });
  const [fileName, setFileName] = useState<string>("Sample Data Loaded");
  const [expandedInventoryRows, setExpandedInventoryRows] = useState<
    Set<string>
  >(new Set());

  // Safe Data Hooks
  const safeInventory = useSafeData(inventory);
  const safeFavorites = useSafeData(favorites);
  const safeLenderProfiles = useSafeData(lenderProfiles);
  const safeSavedDeals = useSafeData(savedDeals);

  // Effects
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
    return processedInventory.filter((item) => {
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
    const { currentPage, rowsPerPage } = pagination;
    if (rowsPerPage === Infinity) return sortedInventory;
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
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

  const toggleInventoryRowExpansion = useCallback((vin: string) => {
    setExpandedInventoryRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(vin)) {
        newSet.delete(vin);
      } else {
        newSet.add(vin);
      }
      return newSet;
    });
  }, []);

  const handleInventoryUpdate = useCallback(
    (vin: string, updatedData: Partial<Vehicle>) => {
      setInventory((prev) =>
        (prev || []).map((v) => (v.vin === vin ? { ...v, ...updatedData } : v))
      );
      setFavorites((prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((f) => (f.vin === vin ? { ...f, ...updatedData } : f));
      });
    },
    [setInventory, setFavorites]
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
  }, [setDealData, setFilters, setErrors, setScratchPadNotes, settings]);

  const value = {
    settings,
    setSettings,
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
    safeInventory,
    safeFavorites,
    safeLenderProfiles,
    safeSavedDeals,
    processedInventory,
    filteredInventory,
    sortedInventory,
    paginatedInventory,
    toggleFavorite,
    toggleInventoryRowExpansion,
    handleInventoryUpdate,
    clearDealAndFilters,
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
