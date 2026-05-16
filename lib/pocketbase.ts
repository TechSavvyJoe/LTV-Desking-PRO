import PocketBase, { type RecordModel } from "pocketbase";
import type { LenderTier } from "../types";

// PocketBase client singleton
const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || "https://ltv-desking-pro-api.fly.dev";

export const pb = new PocketBase(POCKETBASE_URL);

// ============================================
// TYPE-SAFE RECORD CASTING
// ============================================
// PocketBase's SDK returns `RecordModel` for all records. Our domain types
// (Vehicle, LenderProfile, Dealer, …) match the runtime shape but the SDK
// doesn't know that. These two helpers concentrate the unavoidable cast
// into one reviewed location — every other caller should import these
// rather than sprinkle `as unknown as T` casts at call sites.
//
// Soundness: we trust PB to return the schema we asked for. Verified at
// the collection-rule level (RBAC) and at write-time via Zod schemas
// where applicable. If the schema changes shape, type-check + integration
// tests catch it before deploy.

export const asRecord = <T>(record: RecordModel | null | undefined): T | null =>
  record ? (record as unknown as T) : null;

export const asRecordArray = <T>(records: RecordModel[]): T[] => records as unknown as T[];

// Enable auto-cancellation of pending requests on new ones
pb.autoCancellation(false);

// ============================================
// SUPERADMIN DEALER OVERRIDE SYSTEM
// ============================================
// This allows superadmins to switch which dealer they're viewing/managing
// Uses sessionStorage to persist across page refreshes

const DEALER_OVERRIDE_KEY = "superadmin_dealer_override";

// Initialize from sessionStorage on module load
let superadminDealerOverride: string | null = (() => {
  try {
    return sessionStorage.getItem(DEALER_OVERRIDE_KEY);
  } catch {
    return null;
  }
})();

export const setSuperadminDealerOverride = (dealerId: string | null): void => {
  superadminDealerOverride = dealerId;

  // Persist to sessionStorage
  try {
    if (dealerId) {
      sessionStorage.setItem(DEALER_OVERRIDE_KEY, dealerId);
      if (import.meta.env.DEV) {
        console.log("[PocketBase] Saved dealer override to sessionStorage:", dealerId);
      }
    } else {
      sessionStorage.removeItem(DEALER_OVERRIDE_KEY);
      if (import.meta.env.DEV) {
        console.log("[PocketBase] Cleared dealer override from sessionStorage");
      }
    }
  } catch (e) {
    console.warn("[PocketBase] Failed to persist dealer override:", e);
  }

  // Dispatch a custom event so components can react to dealer changes
  window.dispatchEvent(new CustomEvent("dealerOverrideChanged", { detail: dealerId }));
};

export const getSuperadminDealerOverride = (): string | null => {
  // Always try to read from sessionStorage to stay in sync
  try {
    const stored = sessionStorage.getItem(DEALER_OVERRIDE_KEY);
    if (stored !== superadminDealerOverride) {
      superadminDealerOverride = stored;
    }
  } catch {
    // Ignore
  }
  return superadminDealerOverride;
};

export const clearSuperadminDealerOverride = (): void => {
  superadminDealerOverride = null;
  try {
    sessionStorage.removeItem(DEALER_OVERRIDE_KEY);
  } catch {
    // Ignore
  }
  window.dispatchEvent(new CustomEvent("dealerOverrideChanged", { detail: null }));
};

// Types for our collections
export interface Dealer {
  id: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  logo?: string;
  active: boolean;
  settings?: Record<string, unknown>;
  created: string;
  updated: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  dealer: string;
  role: "sales" | "manager" | "admin" | "superadmin";
  avatar?: string;
  created: string;
  updated: string;
  expand?: {
    dealer?: Dealer;
  };
}

export interface InventoryItem {
  id: string;
  dealer: string;
  vin: string;
  stockNumber?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  mileage?: number;
  price: number;
  unitCost?: number;
  jdPower?: number;
  jdPowerRetail?: number;
  status: "available" | "pending" | "sold" | "hold";
  images?: string[];
  notes?: string;
  // Mapped fields
  vehicle?: string; // name
  stock?: string;
  modelYear?: number;
  baseOutTheDoorPrice?: number;
  created: string;
  updated: string;
}

export interface LenderProfile {
  id: string;
  dealer: string;
  name: string;
  active: boolean;
  tiers: LenderTier[];
  bookValueSource?: "Trade" | "Retail";
  minIncome?: number;
  maxPti?: number;
  maxDti?: number;
  maxBackend?: number;
  minAmountFinanced?: number;
  maxAmountFinanced?: number;
  stipulations?: string;
  effectiveDate?: string;
  notes?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  website?: string;
  portalUrl?: string;
  generalNotes?: string;
  enrichmentSources?: { url: string; title?: string; fieldsCited?: string[] }[];
  created: string;
  updated: string;
}

export interface SavedDeal {
  id: string;
  dealer: string;
  user: string;
  vehicle?: string;
  name: string;
  customerName?: string;
  salespersonName?: string;
  vehicleData: Record<string, unknown>;
  dealData: Record<string, unknown>;
  customerFilters?: {
    creditScore: number | null;
    monthlyIncome: number | null;
  };
  calculatedData?: Record<string, unknown>;
  status: "draft" | "pending" | "submitted" | "approved" | "funded" | "cancelled";
  notes?: string;
  created: string;
  updated: string;
  expand?: {
    user?: User;
    vehicle?: InventoryItem;
  };
}

export interface DealerSettings {
  id: string;
  dealer: string;
  docFee: number;
  cvrFee: number;
  defaultStateFees: number;
  defaultState: string;
  outOfStateTransitFee: number;
  customTaxRate?: number;
  defaultDownPayment?: number;
  defaultLoanTerm?: number;
  defaultInterestRate?: number;
  created: string;
  updated: string;
}

// Helper to get current user
export const getCurrentUser = (): User | null => {
  const model = pb.authStore.model as User | null;
  if (import.meta.env.DEV) {
    console.log(
      "[PocketBase] getCurrentUser:",
      model?.email,
      "dealer:",
      model?.dealer,
      "role:",
      model?.role
    );
  }
  return model;
};

// Helper to get current dealer ID (with superadmin override support)
export const getCurrentDealerId = (): string | null => {
  const user = getCurrentUser();

  // If user is superadmin, check for override from sessionStorage
  const override = getSuperadminDealerOverride();
  if (user?.role === "superadmin" && override) {
    if (import.meta.env.DEV) {
      console.log("[PocketBase] Using superadmin override dealer:", override);
    }
    return override;
  }

  const dealerId = user?.dealer || null;
  if (import.meta.env.DEV) {
    console.log("[PocketBase] getCurrentDealerId returning:", dealerId);
  }
  return dealerId;
};

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  return pb.authStore.isValid;
};

// Export collections for easier access
export const collections = {
  dealers: pb.collection("dealers"),
  users: pb.collection("users"),
  inventory: pb.collection("inventory"),
  lenderProfiles: pb.collection("lender_profiles"),
  savedDeals: pb.collection("saved_deals"),
  dealerSettings: pb.collection("dealer_settings"),
};

export default pb;
