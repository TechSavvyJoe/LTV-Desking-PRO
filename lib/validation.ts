/**
 * Validation utilities for runtime schema validation
 * Provides safe parse functions that return Results instead of throwing
 */

import { z } from "zod";
import { createLogger } from "./logger";

// Import schemas
import { LenderProfileSchema, RateTierSchema } from "./schemas/lender.schema";
import { InventoryItemSchema, InventoryItemUpdateSchema } from "./schemas/inventory.schema";
import {
  DealDataSchema,
  FilterDataSchema,
  SavedDealSchema,
  DealerSettingsSchema,
} from "./schemas/deal.schema";

const logger = createLogger("validation");

/**
 * Validation result type - simple success/failure with data or error
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: string[] };

/**
 * Generic safe parse function
 * Returns a ValidationResult instead of throwing
 */
export function safeParse<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  context?: string
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Format error messages
  const details = result.error.errors.map(
    (e) => `${e.path.join(".")}${e.path.length > 0 ? ": " : ""}${e.message}`
  );

  const errorMessage = `Validation failed${context ? ` for ${context}` : ""}: ${details.join("; ")}`;
  logger.warn(errorMessage);

  return {
    success: false,
    error: errorMessage,
    details,
  };
}

/**
 * Validate and sanitize a lender profile before saving
 * Strips unknown fields and validates all tiers
 */
export function validateLenderProfile(data: unknown) {
  return safeParse(LenderProfileSchema, data, "lender profile");
}

/**
 * Validate a single rate tier
 */
export function validateRateTier(data: unknown) {
  return safeParse(RateTierSchema, data, "rate tier");
}

/**
 * Validate inventory item before saving
 */
export function validateInventoryItem(data: unknown) {
  return safeParse(InventoryItemSchema, data, "inventory item");
}

/**
 * Validate inventory update data
 */
export function validateInventoryUpdate(data: unknown) {
  return safeParse(InventoryItemUpdateSchema, data, "inventory update");
}

/**
 * Validate deal data
 */
export function validateDealData(data: unknown) {
  return safeParse(DealDataSchema, data, "deal data");
}

/**
 * Validate filter data
 */
export function validateFilterData(data: unknown) {
  return safeParse(FilterDataSchema, data, "filter data");
}

/**
 * Validate saved deal
 */
export function validateSavedDeal(data: unknown) {
  return safeParse(SavedDealSchema, data, "saved deal");
}

/**
 * Validate dealer settings
 */
export function validateDealerSettings(data: unknown) {
  return safeParse(DealerSettingsSchema, data, "dealer settings");
}

/**
 * Sanitize user input string to prevent XSS and injection
 * Used for free-text inputs before saving to database
 */
export function sanitizeString(input: string): string {
  if (typeof input !== "string") return "";

  return (
    input
      // Remove null bytes
      .replace(/\0/g, "")
      // Trim whitespace
      .trim()
      // Limit length to prevent memory issues
      .slice(0, 50000)
  );
}

/**
 * Sanitize and validate a VIN
 */
export function sanitizeVin(vin: string): string | null {
  if (typeof vin !== "string") return null;

  // Remove spaces and convert to uppercase
  const cleaned = vin.replace(/\s/g, "").toUpperCase();

  // VIN must be 11-17 alphanumeric characters (no I, O, Q)
  const vinRegex = /^[A-HJ-NPR-Z0-9]{11,17}$/;

  if (!vinRegex.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Sanitize numeric input
 * Returns null if not a valid number
 */
export function sanitizeNumber(input: unknown): number | null {
  if (input === null || input === undefined || input === "") {
    return null;
  }

  const num = Number(input);

  if (isNaN(num) || !isFinite(num)) {
    return null;
  }

  return num;
}

/**
 * Sanitize an object by applying sanitizeString to all string values
 * Useful for sanitizing form data before validation
 */
export function sanitizeFormData<T extends Record<string, unknown>>(data: T): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      result[key] = sanitizeString(value);
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeFormData(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

// Re-export schemas for convenience
export {
  LenderProfileSchema,
  RateTierSchema,
  InventoryItemSchema,
  InventoryItemUpdateSchema,
  DealDataSchema,
  FilterDataSchema,
  SavedDealSchema,
  DealerSettingsSchema,
};
