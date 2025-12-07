import { describe, it, expect } from "vitest";
import { checkBankEligibility } from "./lenderMatcher";
import type {
  CalculatedVehicle,
  LenderProfile,
  DealData,
  FilterData,
} from "../types";

// Helper to create a mock vehicle
const mockVehicle = (
  overrides: Partial<CalculatedVehicle> = {}
): CalculatedVehicle => ({
  vehicle: "2021 Toyota Camry",
  stock: "123",
  vin: "TEST123",
  modelYear: 2021,
  mileage: 25000,
  price: 25000,
  jdPower: 22000,
  jdPowerRetail: 24000,
  unitCost: 20000,
  baseOutTheDoorPrice: 27000,
  salesTax: 1500,
  frontEndLtv: 100,
  frontEndGross: 5000,
  amountToFinance: 25000,
  otdLtv: 113,
  monthlyPayment: 450,
  ...overrides,
});

// Helper to create mock deal+filter data
const mockDeal = (
  overrides: Partial<DealData & FilterData> = {}
): DealData & FilterData => ({
  downPayment: 2000,
  tradeInValue: 0,
  tradeInPayoff: 0,
  backendProducts: 0,
  loanTerm: 60,
  interestRate: 6.99,
  stateFees: 200,
  notes: "",
  creditScore: 720,
  monthlyIncome: 5000,
  vehicle: "",
  maxPrice: null,
  maxPayment: null,
  maxMiles: null,
  maxOtdLtv: null,
  vin: "",
  ...overrides,
});

// Helper to create mock lender profile
const mockLender = (overrides: Partial<LenderProfile> = {}): LenderProfile => ({
  id: "test-lender",
  name: "Test Bank",
  bookValueSource: "Trade",
  tiers: [
    {
      name: "Prime",
      minFico: 700,
      maxFico: 850,
      maxLtv: 125,
      maxTerm: 72,
      minYear: 2018,
      maxMileage: 100000,
    },
    {
      name: "Near Prime",
      minFico: 600,
      maxFico: 699,
      maxLtv: 110,
      maxTerm: 60,
      minYear: 2019,
      maxMileage: 80000,
    },
  ],
  ...overrides,
});

describe("checkBankEligibility", () => {
  describe("successful matching", () => {
    it("matches a prime customer with prime tier", () => {
      const result = checkBankEligibility(
        mockVehicle({ otdLtv: 110, amountToFinance: 22000 }),
        mockDeal({ creditScore: 720 }),
        mockLender()
      );

      expect(result.eligible).toBe(true);
      expect(result.matchedTier?.name).toBe("Prime");
      expect(result.reasons).toHaveLength(0);
    });

    it("matches near-prime customer with near-prime tier", () => {
      const result = checkBankEligibility(
        mockVehicle({
          modelYear: 2020,
          mileage: 50000,
          amountToFinance: 20000,
          jdPower: 22000,
        }),
        mockDeal({ creditScore: 650, loanTerm: 48 }),
        mockLender()
      );

      expect(result.eligible).toBe(true);
      expect(result.matchedTier?.name).toBe("Near Prime");
    });
  });

  describe("credit score rejections", () => {
    it("rejects when credit score is below all tiers", () => {
      const result = checkBankEligibility(
        mockVehicle(),
        mockDeal({ creditScore: 550 }),
        mockLender()
      );

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain(
        "No eligible lending tier found for this deal structure and vehicle."
      );
    });

    it("handles null credit score", () => {
      const result = checkBankEligibility(
        mockVehicle(),
        mockDeal({ creditScore: null }),
        mockLender()
      );

      expect(result.eligible).toBe(false);
    });
  });

  describe("vehicle year restrictions", () => {
    it("rejects vehicle too old for all tiers", () => {
      const result = checkBankEligibility(
        mockVehicle({ modelYear: 2015 }),
        mockDeal({ creditScore: 720 }),
        mockLender()
      );

      expect(result.eligible).toBe(false);
    });
  });

  describe("mileage restrictions", () => {
    it("rejects vehicle with too many miles", () => {
      const result = checkBankEligibility(
        mockVehicle({ mileage: 150000 }),
        mockDeal({ creditScore: 720 }),
        mockLender()
      );

      expect(result.eligible).toBe(false);
    });
  });

  describe("LTV restrictions", () => {
    it("rejects when LTV exceeds tier maximum", () => {
      const result = checkBankEligibility(
        mockVehicle({ amountToFinance: 30000, jdPower: 20000 }), // 150% LTV
        mockDeal({ creditScore: 720 }),
        mockLender()
      );

      expect(result.eligible).toBe(false);
    });
  });

  describe("income/PTI checks", () => {
    it("rejects when income is below minimum", () => {
      const result = checkBankEligibility(
        mockVehicle(),
        mockDeal({ creditScore: 720, monthlyIncome: 1500 }),
        mockLender({ minIncome: 2000 })
      );

      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes("Income too low"))).toBe(
        true
      );
    });

    it("rejects when PTI exceeds maximum", () => {
      const result = checkBankEligibility(
        mockVehicle({ monthlyPayment: 800 }),
        mockDeal({ creditScore: 720, monthlyIncome: 2000 }),
        mockLender({ maxPti: 25 }) // PTI would be 40%
      );

      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes("PTI too high"))).toBe(true);
    });
  });

  describe("defensive programming", () => {
    it("handles null bank profile", () => {
      const result = checkBankEligibility(
        mockVehicle(),
        mockDeal(),
        null as unknown as LenderProfile
      );

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("Invalid bank profile data.");
    });

    it("handles null deal data", () => {
      const result = checkBankEligibility(
        mockVehicle(),
        null as unknown as DealData & FilterData,
        mockLender()
      );

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("Invalid deal data.");
    });

    it("handles empty tiers array", () => {
      const result = checkBankEligibility(
        mockVehicle(),
        mockDeal(),
        mockLender({ tiers: [] })
      );

      expect(result.eligible).toBe(false);
    });

    it("handles undefined tiers", () => {
      const result = checkBankEligibility(mockVehicle(), mockDeal(), {
        id: "test",
        name: "Bad Bank",
      } as unknown as LenderProfile);

      expect(result.eligible).toBe(false);
    });
  });

  describe("book value source", () => {
    it("uses trade book by default", () => {
      const result = checkBankEligibility(
        mockVehicle({
          jdPower: 20000,
          jdPowerRetail: 25000,
          amountToFinance: 24000,
        }),
        mockDeal({ creditScore: 720 }),
        mockLender({ bookValueSource: "Trade" }) // 120% Trade LTV - too high for 125% cap
      );

      // With trade book of 20000 and 24000 financed, LTV = 120% (within 125%)
      expect(result.eligible).toBe(true);
    });

    it("uses retail book when specified", () => {
      const result = checkBankEligibility(
        mockVehicle({
          jdPower: 20000,
          jdPowerRetail: 25000,
          amountToFinance: 28000,
        }),
        mockDeal({ creditScore: 720 }),
        mockLender({ bookValueSource: "Retail" }) // 112% Retail LTV
      );

      // With retail book of 25000 and 28000 financed, LTV = 112% (within 125%)
      expect(result.eligible).toBe(true);
    });
  });
});
