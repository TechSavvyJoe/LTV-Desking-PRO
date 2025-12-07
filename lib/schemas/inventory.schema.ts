import { z } from "zod";

/**
 * Zod schema for InventoryItem runtime validation
 * Validates vehicle data before saving to database
 */
export const InventoryItemSchema = z.object({
  id: z.string().optional(), // Optional for new items
  dealer: z.string().min(1, "Dealer ID is required"),

  // Required vehicle identifiers
  vin: z.string()
    .min(11, "VIN must be at least 11 characters")
    .max(17, "VIN must be at most 17 characters")
    .regex(/^[A-HJ-NPR-Z0-9]+$/i, "VIN contains invalid characters"),

  stockNumber: z.string().optional(),

  // Vehicle details
  year: z.number()
    .int("Year must be an integer")
    .min(1900, "Year must be 1900 or later")
    .max(new Date().getFullYear() + 2, "Year cannot be more than 2 years in the future"),

  make: z.string().min(1, "Make is required").max(100),
  model: z.string().min(1, "Model is required").max(100),
  trim: z.string().max(100).optional(),

  // Numeric fields
  mileage: z.number()
    .int("Mileage must be an integer")
    .min(0, "Mileage cannot be negative")
    .max(1000000, "Mileage seems unrealistically high")
    .optional(),

  price: z.number()
    .min(0, "Price cannot be negative")
    .max(10000000, "Price seems unrealistically high"),

  unitCost: z.number()
    .min(0, "Unit cost cannot be negative")
    .max(10000000, "Unit cost seems unrealistically high")
    .optional(),

  jdPower: z.number()
    .min(0, "JD Power value cannot be negative")
    .max(10000000, "JD Power value seems unrealistically high")
    .optional(),

  jdPowerRetail: z.number()
    .min(0, "JD Power Retail value cannot be negative")
    .max(10000000, "JD Power Retail value seems unrealistically high")
    .optional(),

  // Status field (if present in your schema)
  status: z.enum(["available", "sold", "pending"]).optional(),

  // Timestamps (handled by PocketBase)
  created: z.string().optional(),
  updated: z.string().optional(),
}).strict(); // Reject unknown fields

/**
 * Type export for use in application code
 */
export type ValidatedInventoryItem = z.infer<typeof InventoryItemSchema>;

/**
 * Partial schema for updates (all fields optional except ID)
 */
export const InventoryItemUpdateSchema = InventoryItemSchema.partial().extend({
  id: z.string().min(1, "ID is required for updates"),
});

export type ValidatedInventoryItemUpdate = z.infer<typeof InventoryItemUpdateSchema>;
