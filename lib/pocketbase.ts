import PocketBase, { type RecordModel } from "pocketbase";
import type { LenderTier } from "../types";
import { createLogger } from "./logger";

const pbLogger = createLogger("pocketbase");

// PocketBase client singleton.
//
// NO production fallback: the prod URL used to be hardcoded here, which meant
// every Vercel preview deploy and every env-less local checkout silently ran
// against LIVE DEALER DATA. Environments must now opt in explicitly —
// production sets VITE_POCKETBASE_URL in Vercel; previews/dev without it fail
// loudly against localhost instead of touching prod. [G54]
const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090";
if (!import.meta.env.VITE_POCKETBASE_URL) {
  pbLogger.warn(
    "VITE_POCKETBASE_URL is not set — defaulting to http://127.0.0.1:8090. " +
      "This build will NOT reach production data. Set the env var explicitly for real backends."
  );
}

export const pb = new PocketBase(POCKETBASE_URL);

// Global session-expiry detection: when any API call returns 401 while we
// believe we're authenticated, the token has expired or been revoked. Clear it
// and broadcast so the app can show the login screen with an explanation
// instead of leaving a zombie "logged in" UI where every call fails. The
// in-progress deal survives in localStorage. [G65]
pb.afterSend = (response, data) => {
  if (response.status === 401 && pb.authStore.isValid) {
    pb.authStore.clear();
    window.dispatchEvent(new CustomEvent("sessionExpired"));
  }
  return data;
};

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
//
// Final polish (2026-07-06): all call sites migrated; no raw `as any` remains
// outside tests + this central helper. See PRODUCTION_READINESS_PLAN §4.2.

export const asRecord = <T>(record: RecordModel | null | undefined): T | null =>
  record ? (record as unknown as T) : null;

export const asRecordArray = <T>(records: RecordModel[]): T[] => records as unknown as T[];

interface PbRetryOptions {
  label?: string;
  retries?: number;
  delaysMs?: readonly number[];
}

const DEFAULT_PB_RETRY_DELAYS_MS = [150, 450] as const;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientPocketBaseError = (error: unknown): boolean => {
  const err = error as {
    isAbort?: boolean;
    message?: string;
    originalError?: unknown;
    status?: number;
  };
  if (err?.isAbort) return false;

  const status = typeof err?.status === "number" ? err.status : undefined;
  if (status === 0 || status === 408 || status === 429) return true;
  if (status !== undefined && status >= 500 && status < 600) return true;

  const message = `${err?.message ?? ""} ${String(err?.originalError ?? "")}`;
  return /failed to fetch|network|load failed|socket|econnreset|etimedout|eai_again/i.test(message);
};

/**
 * Retry transient PocketBase read failures without retrying writes by default.
 * Callers keep ownership of whether an operation is safe to repeat.
 */
export const withPbRetry = async <T>(
  operation: () => Promise<T>,
  {
    label = "PocketBase request",
    retries = 2,
    delaysMs = DEFAULT_PB_RETRY_DELAYS_MS,
  }: PbRetryOptions = {}
): Promise<T> => {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isTransientPocketBaseError(error)) throw error;
      const wait = delaysMs[attempt] ?? delaysMs[delaysMs.length - 1] ?? 0;
      if (import.meta.env.DEV) {
        pbLogger.warn(`Retrying ${label} after transient failure`, { error });
      }
      if (wait > 0) await delay(wait);
      attempt += 1;
    }
  }

  throw lastError;
};

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
        pbLogger.debug("Saved dealer override to sessionStorage", { dealerId });
      }
    } else {
      sessionStorage.removeItem(DEALER_OVERRIDE_KEY);
      if (import.meta.env.DEV) {
        pbLogger.debug("Cleared dealer override from sessionStorage");
      }
    }
  } catch (e) {
    pbLogger.warn("Failed to persist dealer override", { error: e });
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
  active?: boolean;
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
  /** Dealer reserve percentage shown on the Lenders matrix (1747810001). */
  reservePct?: number;
  /** Funding turnaround, free text e.g. "1-2" (1747810001). */
  fundingDays?: string;
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
  status: "draft" | "pending" | "submitted" | "approved" | "funded" | "cancelled" | "declined";
  /** Lender the deal was submitted to / approved with (1747810000). */
  lenderName?: string;
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
  /** REAL PB column (1746999005 baseline): default loan term in months. */
  defaultTerm?: number;
  /** REAL PB column (1746999005 baseline): default APR %. */
  defaultApr?: number;
  /** Default VSC price for the desk add-on toggle (1747810002). */
  vscPrice?: number;
  /** Default GAP price for the desk add-on toggle (1747810002). */
  gapPrice?: number;
  /** Michigan trade-in sales-tax-credit cap (1747810002). */
  miTradeInCreditCap?: number;
  created: string;
  updated: string;
}

// Helper to get current user
export const getCurrentUser = (): User | null => {
  const model = asRecord<User>(pb.authStore.model as RecordModel | null | undefined);
  if (import.meta.env.DEV) {
    pbLogger.debug("getCurrentUser", {
      email: model?.email,
      dealer: model?.dealer,
      role: model?.role,
    });
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
      pbLogger.debug("Using superadmin override dealer", { override });
    }
    return override;
  }

  const dealerId = user?.dealer || null;
  if (import.meta.env.DEV) {
    pbLogger.debug("getCurrentDealerId returning", { dealerId });
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
