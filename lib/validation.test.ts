/**
 * Tests for validation utilities and Zod schemas
 */

import { describe, it, expect } from "vitest";
import {
  validateLenderProfile,
  validateRateTier,
  validateInventoryItem,
  validateDealData,
  validateFilterData,
  sanitizeString,
  sanitizeVin,
  sanitizeNumber,
  sanitizeFormData,
} from "../lib/validation";

describe("validateLenderProfile", () => {
  it("should validate a valid lender profile", () => {
    const profile = {
      name: "Test Bank",
      bookValueSource: "Trade" as const,
      tiers: [
        {
          name: "Tier 1",
          minFico: 700,
          maxLtv: 125,
          maxTerm: 72,
        },
      ],
    };

    const result = validateLenderProfile(profile);
    expect(result.success).toBe(true);
  });

  it("should reject profile without name", () => {
    const profile = {
      tiers: [{ name: "Tier 1" }],
    };

    const result = validateLenderProfile(profile);
    expect(result.success).toBe(false);
  });

  it("should reject profile without tiers", () => {
    const profile = {
      name: "Test Bank",
      tiers: [],
    };

    const result = validateLenderProfile(profile);
    expect(result.success).toBe(false);
  });
});

describe("validateRateTier", () => {
  it("should validate a valid tier", () => {
    const tier = {
      name: "Prime Tier",
      minFico: 720,
      maxFico: 850,
      maxLtv: 130,
      maxTerm: 84,
    };

    const result = validateRateTier(tier);
    expect(result.success).toBe(true);
  });

  it("should reject invalid FICO range", () => {
    const tier = {
      name: "Invalid Tier",
      minFico: 800,
      maxFico: 700, // Invalid: min > max
    };

    const result = validateRateTier(tier);
    expect(result.success).toBe(false);
  });

  it("should reject FICO outside valid range", () => {
    const tier = {
      name: "Bad FICO",
      minFico: 200, // Below 300 minimum
    };

    const result = validateRateTier(tier);
    expect(result.success).toBe(false);
  });
});

describe("validateDealData", () => {
  it("should validate valid deal data", () => {
    const deal = {
      downPayment: 5000,
      tradeInValue: 10000,
      tradeInPayoff: 8000,
      backendProducts: 2000,
      loanTerm: 72,
      interestRate: 6.99,
      stateFees: 500,
    };

    const result = validateDealData(deal);
    expect(result.success).toBe(true);
  });

  it("should reject negative down payment", () => {
    const deal = {
      downPayment: -100,
      tradeInValue: 0,
      tradeInPayoff: 0,
      backendProducts: 0,
      loanTerm: 72,
      interestRate: 5,
      stateFees: 0,
    };

    const result = validateDealData(deal);
    expect(result.success).toBe(false);
  });
});

describe("validateFilterData", () => {
  it("should validate valid filter data", () => {
    const filters = {
      creditScore: 720,
      monthlyIncome: 5000,
      vehicle: "Toyota Camry",
      maxPrice: 30000,
      maxPayment: 500,
      maxMiles: 50000,
      maxOtdLtv: 125,
      vin: "",
    };

    const result = validateFilterData(filters);
    expect(result.success).toBe(true);
  });

  it("should accept null values for optional fields", () => {
    const filters = {
      creditScore: null,
      monthlyIncome: null,
      maxPrice: null,
      maxPayment: null,
      maxMiles: null,
      maxOtdLtv: null,
    };

    const result = validateFilterData(filters);
    expect(result.success).toBe(true);
  });
});

describe("sanitizeString", () => {
  it("should trim whitespace", () => {
    expect(sanitizeString("  hello  ")).toBe("hello");
  });

  it("should remove null bytes", () => {
    expect(sanitizeString("hello\0world")).toBe("helloworld");
  });

  it("should return empty string for non-string input", () => {
    expect(sanitizeString(123 as unknown as string)).toBe("");
  });

  it("should limit string length", () => {
    const longString = "a".repeat(60000);
    expect(sanitizeString(longString).length).toBeLessThanOrEqual(50000);
  });
});

describe("sanitizeVin", () => {
  it("should validate valid VIN", () => {
    expect(sanitizeVin("1HGBH41JXMN109186")).toBe("1HGBH41JXMN109186");
  });

  it("should convert to uppercase", () => {
    expect(sanitizeVin("1hgbh41jxmn109186")).toBe("1HGBH41JXMN109186");
  });

  it("should remove spaces", () => {
    expect(sanitizeVin("1HG BH41 JXM N109186")).toBe("1HGBH41JXMN109186");
  });

  it("should reject invalid characters", () => {
    expect(sanitizeVin("1HGBH41JXMN10918I")).toBeNull(); // I is not valid
  });

  it("should reject too short VIN", () => {
    expect(sanitizeVin("1HGBH")).toBeNull();
  });
});

describe("sanitizeNumber", () => {
  it("should convert string numbers", () => {
    expect(sanitizeNumber("123")).toBe(123);
  });

  it("should return null for empty string", () => {
    expect(sanitizeNumber("")).toBeNull();
  });

  it("should return null for NaN", () => {
    expect(sanitizeNumber("not a number")).toBeNull();
  });

  it("should handle null and undefined", () => {
    expect(sanitizeNumber(null)).toBeNull();
    expect(sanitizeNumber(undefined)).toBeNull();
  });
});

describe("sanitizeFormData", () => {
  it("should sanitize string values in object", () => {
    const data = {
      name: "  John Doe  ",
      email: "john@example.com",
      age: 30,
    };

    const result = sanitizeFormData(data);
    expect(result.name).toBe("John Doe");
    expect(result.email).toBe("john@example.com");
    expect(result.age).toBe(30);
  });

  it("should handle nested objects", () => {
    const data = {
      user: {
        name: "  Jane  ",
      },
    };

    const result = sanitizeFormData(data);
    expect((result.user as { name: string }).name).toBe("Jane");
  });
});
