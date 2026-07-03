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

/**
 * Approval-odds band, per the dc design contract: "strong" (score ≥ 72),
 * "moderate" (≥ 50), "weak" (below), and "none". The numeric score is shown on
 * the gauge, but the band is cross-checked against real lender eligibility — a
 * deal that fits no active lender can never read better than "none".
 * [dc-redesign / reconciliation 1]
 */
export type ApprovalBand = "strong" | "moderate" | "weak" | "none";

export interface CalculatedVehicle extends Vehicle {
  salesTax: number | "Error" | "N/A";
  frontEndLtv: number | "Error" | "N/A";
  frontEndGross: number | "Error" | "N/A";
  amountToFinance: number | "Error" | "N/A";
  otdLtv: number | "Error" | "N/A";
  monthlyPayment: number | "Error" | "N/A";
  // Redesign-derived metrics, populated by the processedInventory selector via
  // approvalScorer + lenderFit. Optional so existing call sites stay valid.
  approvalScore?: number; // 0-100 internal odds index (hardened, eligibility-capped)
  approvalBand?: ApprovalBand;
  ptiRatio?: number; // payment-to-income %, or undefined when income is unknown
  fitCount?: number; // # of active lenders the current deal fits
  fitNames?: string[]; // names of the active lenders the current deal fits
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
  /**
   * Per-deal buyer state for sales-tax purposes. When set, it overrides
   * settings.defaultState in the tax engine; undefined preserves the
   * settings-level behavior. [G18]
   */
  buyerState?: AppState;
  rebate?: number; // Manufacturer/dealer rebate applied to the amount financed [WS-C]
  /**
   * UI-level split of backend products (VSC / GAP add-ons on the desk).
   * `backendProducts` remains the canonical TOTAL the calculator consumes —
   * these fields only record how that total was composed, so no schema change
   * is needed. [reconciliation 6]
   */
  vscAmount?: number;
  gapAmount?: number;
}

export interface FilterData {
  creditScore: number | null;
  monthlyIncome: number | null;
  vehicle: string;
  maxPrice: number | null;
  maxPayment: number | null;
  maxMiles: number | null; // Optional max mileage filter for inventory
  maxOtdLtv: number | null; // Optional max OTD LTV filter
  vin: string;
  /** Min approval odds (0-100) filter, applied post-scoring. [reconciliation 12] */
  minScore?: number | null;
}

export interface SortConfig {
  key: string | null;
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
  minMileage?: number;
  maxMileage?: number;
  minTerm?: number;
  maxTerm?: number;

  // LTV/Advance fields - CRITICAL for deal structuring
  maxLtv?: number; // Generic max LTV (used if no distinction)
  minLtv?: number; // Minimum LTV floor
  frontEndLtv?: number; // Max LTV on front-end (before backend products)
  otdLtv?: number; // Max Out-The-Door LTV (includes all fees/products)
  maxAdvance?: number; // Dollar cap on advance over book/invoice

  // Amount limits
  minAmountFinanced?: number;
  maxAmountFinanced?: number;

  // Rate information
  baseInterestRate?: number; // Base APR/buy rate for this tier
  rateAdder?: number; // Additional rate adjustment (e.g., +0.25% for 80+ months)
  maxRate?: number; // Maximum rate cap

  // Vehicle restrictions
  vehicleType?: "new" | "used" | "certified" | "all";
  excludedMakes?: string[]; // Makes not eligible (e.g., "Maserati", "Lotus")
  includedMakes?: string[]; // Only these makes eligible (for captive lenders)

  // Income/DTI requirements at tier level (if different from lender level)
  minIncome?: number;
  maxPti?: number;
  maxDti?: number;

  // Backend product limits
  maxBackend?: number; // Maximum backend products in dollars
  maxBackendPercent?: number; // Maximum backend as % of amount financed

  // Extraction metadata
  confidence?: number; // 0.0-1.0 confidence score
  extractionSource?: string; // "table", "text", "inferred"
}

export interface LenderProfile {
  id: string;
  name: string;
  active?: boolean;
  bookValueSource?: "Trade" | "Retail";
  minIncome?: number;
  maxPti?: number;
  maxDti?: number;
  maxBackend?: number;
  minAmountFinanced?: number;
  maxAmountFinanced?: number;
  stipulations?: string;
  effectiveDate?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  website?: string;
  portalUrl?: string;
  generalNotes?: string;
  enrichmentSources?: { url: string; title?: string; fieldsCited?: string[] }[];
  tiers: LenderTier[];
}

export interface Message {
  text: string;
  type: "success" | "error" | "warning" | "info";
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

export type AppState = "MI" | "OH" | "IN" | "IL" | "FL";

export interface Settings {
  defaultTerm: number;
  defaultApr: number;
  defaultState: AppState;
  docFee: number;
  cvrFee: number;
  defaultStateFees: number;
  outOfStateTransitFee: number;
  customTaxRate: number | null;
  /**
   * Michigan statutory cap on the sales-tax trade-in credit, in dollars. [G17]
   * TODO(owner): verify current MI statutory trade-in credit cap before pilot.
   */
  miTradeInCreditCap: number;
  /** Default VSC (service contract) price for the desk's add-on toggle. [reconciliation 6] */
  vscPrice: number;
  /** Default GAP price for the desk's add-on toggle. [reconciliation 6] */
  gapPrice: number;
  ltvThresholds: {
    warn: number;
    danger: number;
    critical: number;
  };
  ai: import("./lib/aiModelRegistry").AiSettings;
}
