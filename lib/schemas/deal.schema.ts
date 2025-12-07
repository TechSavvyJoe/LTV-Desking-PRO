import { z } from "zod";

/**
 * Zod schema for DealData runtime validation
 * Validates deal structuring data
 */
export const DealDataSchema = z.object({
  downPayment: z.number()
    .min(0, "Down payment cannot be negative")
    .max(10000000, "Down payment seems unrealistically high"),

  tradeInValue: z.number()
    .min(0, "Trade-in value cannot be negative")
    .max(500000, "Trade-in value seems unrealistically high"),

  tradeInPayoff: z.number()
    .min(0, "Trade-in payoff cannot be negative")
    .max(500000, "Trade-in payoff seems unrealistically high"),

  backendProducts: z.number()
    .min(0, "Backend products cannot be negative")
    .max(50000, "Backend products seem unrealistically high"),

  loanTerm: z.number()
    .int("Loan term must be an integer")
    .min(6, "Loan term must be at least 6 months")
    .max(96, "Loan term cannot exceed 96 months"),

  interestRate: z.number()
    .min(0, "Interest rate cannot be negative")
    .max(50, "Interest rate seems unrealistically high"),

  stateFees: z.number()
    .min(0, "State fees cannot be negative")
    .max(50000, "State fees seem unrealistically high"),

  notes: z.string().max(5000, "Notes cannot exceed 5000 characters").default(""),
}).strict();

/**
 * Zod schema for FilterData runtime validation
 * Validates customer filter criteria
 */
export const FilterDataSchema = z.object({
  creditScore: z.number()
    .int("Credit score must be an integer")
    .min(300, "Credit score must be at least 300")
    .max(850, "Credit score cannot exceed 850")
    .nullable(),

  monthlyIncome: z.number()
    .min(0, "Monthly income cannot be negative")
    .max(1000000, "Monthly income seems unrealistically high")
    .nullable(),

  vehicle: z.string().max(500).default(""),

  maxPrice: z.number()
    .min(0, "Max price cannot be negative")
    .max(10000000, "Max price seems unrealistically high")
    .nullable(),

  maxPayment: z.number()
    .min(0, "Max payment cannot be negative")
    .max(100000, "Max payment seems unrealistically high")
    .nullable(),

  maxMiles: z.number()
    .int("Max miles must be an integer")
    .min(0, "Max miles cannot be negative")
    .max(1000000, "Max miles seems unrealistically high")
    .nullable(),

  maxOtdLtv: z.number()
    .min(0, "Max OTD LTV cannot be negative")
    .max(200, "Max OTD LTV seems unrealistically high")
    .nullable(),

  vin: z.string().max(17).default(""),
}).strict();

/**
 * Zod schema for SavedDeal runtime validation
 * Validates saved deal structure
 */
export const SavedDealSchema = z.object({
  id: z.string().optional(),
  dealer: z.string().min(1, "Dealer ID is required"),
  user: z.string().min(1, "User ID is required"),
  vehicle: z.string().optional(), // Reference to inventory item

  date: z.string(),
  customerName: z.string().min(1, "Customer name is required").max(200),
  salespersonName: z.string().max(200).default(""),

  // Store as JSON blobs (validated separately)
  vehicleData: z.record(z.any()), // Could be more specific
  dealData: DealDataSchema,

  customerFilters: z.object({
    creditScore: z.number().int().min(300).max(850).nullable(),
    monthlyIncome: z.number().min(0).nullable(),
  }),

  notes: z.string().max(5000).optional(),

  // Legacy/compatibility fields
  vehicleSnapshot: z.record(z.any()).optional(),
  dealNumber: z.number().int().optional(),
  vehicleVin: z.string().max(17).optional(),

  // Timestamps
  created: z.string().optional(),
  updated: z.string().optional(),
  createdAt: z.string().optional(),
}).strict();

/**
 * Zod schema for DealerSettings runtime validation
 */
export const DealerSettingsSchema = z.object({
  id: z.string().optional(),
  dealer: z.string().min(1, "Dealer ID is required"),

  // Settings as JSON object
  salesTaxRate: z.number().min(0).max(20).default(0),
  docFee: z.number().min(0).max(10000).default(0),
  defaultDownPayment: z.number().min(0).default(0),
  defaultTerm: z.number().int().min(6).max(96).default(72),
  defaultRate: z.number().min(0).max(50).default(5.99),

  created: z.string().optional(),
  updated: z.string().optional(),
});

/**
 * Type exports for use in application code
 */
export type ValidatedDealData = z.infer<typeof DealDataSchema>;
export type ValidatedFilterData = z.infer<typeof FilterDataSchema>;
export type ValidatedSavedDeal = z.infer<typeof SavedDealSchema>;
export type ValidatedDealerSettings = z.infer<typeof DealerSettingsSchema>;
