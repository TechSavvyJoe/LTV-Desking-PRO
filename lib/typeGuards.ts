/**
 * Type Guards and Validation Utilities
 * Centralized type validation for LTV Desking PRO
 */

import type {
  Vehicle,
  CalculatedVehicle,
  DealData,
  FilterData,
  LenderProfile,
  LenderTier,
  SavedDeal,
  Settings,
} from "../types";

// ============================================
// ID VALIDATION & SANITIZATION
// ============================================

/**
 * Validates that a string is a valid PocketBase record ID.
 * PocketBase IDs are 15 alphanumeric characters.
 */
export const isValidPocketBaseId = (id: unknown): id is string => {
  return typeof id === "string" && /^[a-zA-Z0-9]{15}$/.test(id);
};

/**
 * Sanitizes a PocketBase ID for use in filter strings.
 * Throws an error if the ID format is invalid to prevent injection.
 */
export const sanitizeId = (id: string): string => {
  if (!isValidPocketBaseId(id)) {
    throw new Error(`Invalid PocketBase ID format: ${id}`);
  }
  return id;
};

/**
 * @deprecated Use `pb.filter("field = {:name}", { name: value })` from the
 * PocketBase SDK instead. The SDK handles backslash and quote escaping
 * correctly via parameterized templates and is the recommended pattern in
 * PocketBase docs. This helper is kept only for backward compatibility with
 * any external caller that still imports it.
 */
export const escapeFilterString = (value: string): string => {
  // Escape backslashes first, then double quotes
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
};

// ============================================
// VEHICLE TYPE GUARDS
// ============================================

/**
 * Checks if a value is a valid Vehicle object.
 */
const asObj = <T extends Record<string, unknown>>(o: unknown): T | null =>
  o && typeof o === "object" ? (o as T) : null;

export const isValidVehicle = (v: unknown): v is Vehicle => {
  const vehicle = asObj<Record<string, unknown>>(v);
  if (!vehicle) return false;

  return (
    typeof vehicle.vehicle === "string" &&
    typeof vehicle.stock === "string" &&
    typeof vehicle.vin === "string" &&
    (typeof vehicle.modelYear === "number" || vehicle.modelYear === "N/A") &&
    (typeof vehicle.mileage === "number" || vehicle.mileage === "N/A") &&
    (typeof vehicle.price === "number" || vehicle.price === "N/A")
  );
};

/**
 * Checks if a VIN has valid structure (basic check).
 * Full checksum validation available in vinValidator.ts
 */
export const isValidVinFormat = (vin: unknown): vin is string => {
  if (typeof vin !== "string") return false;
  // VINs are 17 characters, no I, O, or Q
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin);
};

// ============================================
// DEAL TYPE GUARDS
// ============================================

/**
 * Checks if a value is valid DealData.
 */
export const isValidDealData = (d: unknown): d is DealData => {
  const deal = asObj<Record<string, unknown>>(d);
  if (!deal) return false;

  return (
    typeof deal.downPayment === "number" &&
    typeof deal.tradeInValue === "number" &&
    typeof deal.tradeInPayoff === "number" &&
    typeof deal.backendProducts === "number" &&
    typeof deal.loanTerm === "number" &&
    (typeof deal.interestRate === "number" || deal.interestRate === "") &&
    typeof deal.stateFees === "number"
  );
};

/**
 * Checks if a value is a valid SavedDeal.
 */
export const isValidSavedDeal = (d: unknown): d is SavedDeal => {
  const deal = asObj<Record<string, unknown>>(d);
  if (!deal) return false;

  return (
    typeof deal.id === "string" &&
    typeof deal.date === "string" &&
    typeof deal.customerName === "string" &&
    typeof deal.salespersonName === "string" &&
    isValidVehicle(deal.vehicle) &&
    isValidDealData(deal.dealData)
  );
};

// ============================================
// LENDER TYPE GUARDS
// ============================================

/**
 * Checks if a value is a valid LenderTier.
 */
export const isValidLenderTier = (t: unknown): t is LenderTier => {
  const tier = asObj<Record<string, unknown>>(t);
  if (!tier) return false;

  return (
    typeof tier.name === "string" &&
    (tier.minFico === undefined || typeof tier.minFico === "number") &&
    (tier.maxFico === undefined || typeof tier.maxFico === "number") &&
    (tier.maxLtv === undefined || typeof tier.maxLtv === "number") &&
    (tier.maxTerm === undefined || typeof tier.maxTerm === "number")
  );
};

/**
 * Checks if a value is a valid LenderProfile.
 */
export const isValidLenderProfile = (lp: unknown): lp is LenderProfile => {
  const profile = asObj<Record<string, unknown>>(lp);
  if (!profile) return false;

  return (
    typeof profile.id === "string" &&
    typeof profile.name === "string" &&
    Array.isArray(profile.tiers) &&
    profile.tiers.every(isValidLenderTier)
  );
};

// ============================================
// NUMERIC VALUE GUARDS
// ============================================

/**
 * Checks if a value is a finite, non-NaN number.
 */
export const isValidNumber = (n: unknown): n is number => {
  return typeof n === "number" && Number.isFinite(n) && !Number.isNaN(n);
};

/**
 * Checks if a value is a positive number.
 */
export const isPositiveNumber = (n: unknown): n is number => {
  return isValidNumber(n) && n > 0;
};

/**
 * Checks if a value is a non-negative number (>= 0).
 */
export const isNonNegativeNumber = (n: unknown): n is number => {
  return isValidNumber(n) && n >= 0;
};

/**
 * Safely parses a numeric value, returning undefined if invalid.
 */
export const safeParseNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) && !Number.isNaN(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && !Number.isNaN(parsed) ? parsed : undefined;
  }
  return undefined;
};
