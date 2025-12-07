import { z } from "zod";

/**
 * Zod schema for LenderTier runtime validation
 * Validates individual tier objects within a lender profile
 */
export const RateTierSchema = z.object({
  name: z.string().min(1, "Tier name is required"),
  tierName: z.string().optional(),

  // FICO/Credit score ranges
  minFico: z.number().int().min(300).max(850).optional(),
  maxFico: z.number().int().min(300).max(850).optional(),

  // Vehicle year/age restrictions
  minYear: z.number().int().min(1900).max(new Date().getFullYear() + 2).optional(),
  maxYear: z.number().int().min(1900).max(new Date().getFullYear() + 2).optional(),
  maxAge: z.number().int().min(0).max(50).optional(),

  // Mileage restrictions
  minMileage: z.number().int().min(0).optional(),
  maxMileage: z.number().int().min(0).max(500000).optional(),

  // Loan term restrictions (months)
  minTerm: z.number().int().min(6).max(96).optional(),
  maxTerm: z.number().int().min(6).max(96).optional(),

  // LTV/Advance fields
  maxLtv: z.number().min(0).max(200).optional(),
  minLtv: z.number().min(0).max(200).optional(),
  frontEndLtv: z.number().min(0).max(200).optional(),
  otdLtv: z.number().min(0).max(200).optional(),
  maxAdvance: z.number().min(0).optional(),

  // Amount financed limits
  minAmountFinanced: z.number().min(0).optional(),
  maxAmountFinanced: z.number().min(0).optional(),

  // Rate information
  baseInterestRate: z.number().min(0).max(50).optional(),
  rateAdder: z.number().min(-10).max(10).optional(),
  maxRate: z.number().min(0).max(50).optional(),

  // Vehicle type and restrictions
  vehicleType: z.enum(["new", "used", "certified", "all"]).optional(),
  excludedMakes: z.array(z.string()).optional(),
  includedMakes: z.array(z.string()).optional(),

  // Income/DTI requirements
  minIncome: z.number().min(0).optional(),
  maxPti: z.number().min(0).max(100).optional(),
  maxDti: z.number().min(0).max(100).optional(),

  // Backend product limits
  maxBackend: z.number().min(0).optional(),
  maxBackendPercent: z.number().min(0).max(100).optional(),

  // Extraction metadata
  confidence: z.number().min(0).max(1).optional(),
  extractionSource: z.enum(["table", "text", "inferred"]).optional(),
}).refine(
  (data) => {
    // Validate FICO ranges if both are present
    if (data.minFico !== undefined && data.maxFico !== undefined) {
      return data.minFico <= data.maxFico;
    }
    return true;
  },
  { message: "minFico must be less than or equal to maxFico" }
).refine(
  (data) => {
    // Validate year ranges if both are present
    if (data.minYear !== undefined && data.maxYear !== undefined) {
      return data.minYear <= data.maxYear;
    }
    return true;
  },
  { message: "minYear must be less than or equal to maxYear" }
).refine(
  (data) => {
    // Validate mileage ranges if both are present
    if (data.minMileage !== undefined && data.maxMileage !== undefined) {
      return data.minMileage <= data.maxMileage;
    }
    return true;
  },
  { message: "minMileage must be less than or equal to maxMileage" }
).refine(
  (data) => {
    // Validate term ranges if both are present
    if (data.minTerm !== undefined && data.maxTerm !== undefined) {
      return data.minTerm <= data.maxTerm;
    }
    return true;
  },
  { message: "minTerm must be less than or equal to maxTerm" }
);

/**
 * Zod schema for LenderProfile runtime validation
 * Validates complete lender profile including all tiers
 */
export const LenderProfileSchema = z.object({
  id: z.string().optional(), // Optional for new profiles
  name: z.string().min(1, "Lender name is required").max(200),
  active: z.boolean().default(true),
  bookValueSource: z.enum(["Trade", "Retail"]).optional(),
  minIncome: z.number().min(0).optional(),
  maxPti: z.number().min(0).max(100).optional(),
  effectiveDate: z.string().optional(),
  tiers: z.array(RateTierSchema).min(1, "At least one tier is required"),
}).strict(); // Reject unknown fields

/**
 * Type exports for use in application code
 */
export type ValidatedLenderProfile = z.infer<typeof LenderProfileSchema>;
export type ValidatedRateTier = z.infer<typeof RateTierSchema>;
