export interface Vehicle {
  id?: string;
  vehicle: string;
  stock: string;
  vin: string;
  modelYear: number | "N/A";
  mileage: number | "N/A";
  price: number | "N/A";
  jdPower: number | "N/A";
  jdPowerRetail: number | "N/A";
  unitCost: number | "N/A";
  baseOutTheDoorPrice: number | "Error" | "N/A";
  make?: string;
  model?: string;
  trim?: string;
  // Calculated properties will be added to a different type
}

export interface CalculatedVehicle extends Vehicle {
  salesTax: number | "Error" | "N/A";
  frontEndLtv: number | "Error" | "N/A";
  frontEndGross: number | "Error" | "N/A";
  amountToFinance: number | "Error" | "N/A";
  otdLtv: number | "Error" | "N/A";
  monthlyPayment: number | "Error" | "N/A";
  [key: string]: any; // For dynamic sorting key
}

export interface DealData {
  downPayment: number;
  tradeInValue: number;
  tradeInPayoff: number;
  backendProducts: number;
  loanTerm: number;
  interestRate: number;
  stateFees: number;
  notes: string;
}

export interface FilterData {
  creditScore: number | null;
  monthlyIncome: number | null;
  vehicle: string;
  maxPrice: number | null;
  maxPayment: number | null;
  vin: string;
}

export interface SortConfig {
  key: keyof CalculatedVehicle | null;
  direction: "asc" | "desc";
}

export interface LenderTier {
  name: string; // e.g. "New - Tier 1", "Used 2018+ - Gold"
  tierName?: string; // Display name for the tier
  minFico?: number;
  maxFico?: number;
  minYear?: number;
  maxYear?: number;
  maxAge?: number; // Maximum vehicle age in years
  // FIX: Added minMileage to support tiers with minimum mileage requirements.
  minMileage?: number;
  maxMileage?: number;
  // FIX: Added minTerm to support tiers with minimum loan term requirements.
  minTerm?: number;
  maxLtv?: number;
  maxTerm?: number;
  minAmountFinanced?: number;
  maxAmountFinanced?: number;
  maxAdvance?: number; // Maximum advance amount over invoice/MSRP
  baseInterestRate?: number; // Base APR for this tier
  rateAdder?: number; // Additional rate adjustment
}

export interface LenderProfile {
  id: string;
  name: string;
  active?: boolean;
  bookValueSource?: "Trade" | "Retail";
  minIncome?: number;
  maxPti?: number;
  effectiveDate?: string;
  tiers: LenderTier[];
  [key: string]: any; // For dynamic keys
}

export interface Message {
  text: string;
  type: "success" | "error";
}

export type ValidationErrors = Record<string, string>;

export interface TierSortConfig {
  key: keyof LenderTier | null;
  direction: "asc" | "desc";
}

export interface SavedDeal {
  id: string;
  date: string;
  customerName: string;
  salespersonName: string;
  vehicle: CalculatedVehicle;
  dealData: DealData;
  customerFilters: {
    creditScore: number | null;
    monthlyIncome: number | null;
  };
  notes?: string;
  // Legacy/compat fields so older saves don't crash the UI
  vehicleSnapshot?: CalculatedVehicle;
  dealNumber?: number;
  vehicleVin?: string;
  createdAt?: string;
}

export interface LenderEligibilityStatus {
  name: string;
  eligible: boolean;
  reasons: string[];
  matchedTier: LenderTier | null;
}

export interface DealPdfData {
  vehicle: CalculatedVehicle;
  dealData: DealData;
  customerFilters: {
    creditScore: number | null;
    monthlyIncome: number | null;
  };
  customerName: string;
  salespersonName: string;
  lenderEligibility: LenderEligibilityStatus[];
  dealNumber?: number;
}

export type AppState = "MI" | "OH" | "IN";

export interface Settings {
  defaultTerm: number;
  defaultApr: number;
  defaultState: AppState;
  docFee: number;
  cvrFee: number;
  defaultStateFees: number;
  outOfStateTransitFee: number;
  customTaxRate: number | null;
  ltvThresholds: {
    warn: number;
    danger: number;
    critical: number;
  };
}
