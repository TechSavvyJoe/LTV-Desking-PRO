import { describe, it, expect } from "vitest";
import {
  calculateMonthlyPayment,
  calculateLoanAmount,
  calculateFinancials,
} from "./calculator";
import { Vehicle, DealData, Settings } from "../types";

describe("Calculator Service", () => {
  describe("calculateMonthlyPayment", () => {
    it("should calculate correct payment for standard loan", () => {
      // $30,000 at 5% for 60 months
      // Monthly rate = 0.05/12 = 0.0041666...
      // Payment = 30000 * (0.0041666 * (1.0041666)^60) / ((1.0041666)^60 - 1)
      // Expected: ~566.14
      const payment = calculateMonthlyPayment(30000, 5, 60);
      expect(payment).toBeCloseTo(566.14, 2);
    });

    it("should handle 0% interest", () => {
      const payment = calculateMonthlyPayment(30000, 0, 60);
      expect(payment).toBe(500);
    });

    it("should return 0 if principal is 0", () => {
      expect(calculateMonthlyPayment(0, 5, 60)).toBe(0);
    });

    it('should return "Error" for invalid inputs', () => {
      expect(calculateMonthlyPayment(30000, 5, 0)).toBe("Error");
      expect(calculateMonthlyPayment(30000, -5, 60)).toBe("Error");
    });
  });

  describe("calculateLoanAmount", () => {
    it("should calculate correct principal from payment", () => {
      // Reverse of first test: $566.14 at 5% for 60 months -> ~$30,000
      const principal = calculateLoanAmount(566.14, 5, 60);
      expect(principal).toBeCloseTo(30000, 0); // Allow rounding diff
    });

    it("should handle 0% interest", () => {
      const principal = calculateLoanAmount(500, 0, 60);
      expect(principal).toBe(30000);
    });
  });

  describe("calculateFinancials", () => {
    const mockVehicle: Vehicle = {
      vehicle: "Test Car",
      stock: "123",
      vin: "ABC",
      modelYear: 2023,
      mileage: 10000,
      price: 30000,
      jdPower: 28000,
      jdPowerRetail: 32000,
      unitCost: 25000,
      baseOutTheDoorPrice: "N/A",
    };

    const mockDealData: DealData = {
      downPayment: 0,
      tradeInValue: 0,
      tradeInPayoff: 0,
      interestRate: 5,
      loanTerm: 60,
      backendProducts: 0,
      stateFees: 200,
      notes: "",
    };

    const mockSettings: Settings = {
      docFee: 250,
      cvrFee: 25,
      defaultState: "MI",
      outOfStateTransitFee: 0,
      ltvThresholds: { warn: 115, danger: 125, critical: 135 },
      defaultTerm: 60,
      defaultApr: 7.99,
      defaultStateFees: 200,
      customTaxRate: null,
    };

    it("should calculate full deal structure correctly", () => {
      const result = calculateFinancials(
        mockVehicle,
        mockDealData,
        mockSettings
      );

      // Taxable: 30000 + 250 (doc) + 25 (cvr) = 30275
      // Tax (MI 6%): 30275 * 0.06 = 1816.5
      expect(result.salesTax).toBeCloseTo(1816.5, 2);

      // OTD: 30000 + 250 + 25 + 200 (state) + 1816.5 = 32291.5
      expect(result.baseOutTheDoorPrice).toBeCloseTo(32291.5, 2);

      // Amount to Finance: 32291.5
      expect(result.amountToFinance).toBeCloseTo(32291.5, 2);

      // Payment: ~609.37 (based on 32291.5 at 5% for 60mo)
      expect(result.monthlyPayment).not.toBe("Error");
      if (typeof result.monthlyPayment === "number") {
        expect(result.monthlyPayment).toBeGreaterThan(600);
        expect(result.monthlyPayment).toBeLessThan(620);
      }
    });

    it("should handle trade-in correctly", () => {
      const dealWithTrade = {
        ...mockDealData,
        tradeInValue: 10000,
        tradeInPayoff: 5000,
      };
      const result = calculateFinancials(
        mockVehicle,
        dealWithTrade,
        mockSettings
      );

      // Taxable: (30000 - 10000) + 250 + 25 = 20275
      // Tax: 20275 * 0.06 = 1216.5
      expect(result.salesTax).toBeCloseTo(1216.5, 2);

      // Net Trade: 10000 - 5000 = 5000 equity
      // Amount to Finance should decrease by 5000 equity + tax savings
    });

    it("should calculate LTV correctly", () => {
      const result = calculateFinancials(
        mockVehicle,
        mockDealData,
        mockSettings
      );

      // Front LTV: (OTD - taxes/fees) / Book? No, usually (Price - TradeEquity - Down) / Book
      // Logic in calculator.ts:
      // frontEndAmountToFinance = baseOutTheDoorPrice - downPayment - netTradeIn
      // Wait, baseOutTheDoorPrice INCLUDES taxes/fees.
      // Let's check calculator.ts logic again.
      // Line 143: frontEndAmountToFinance = baseOutTheDoorPrice - downPayment - netTradeIn;
      // This seems to be "Amount to Finance" effectively?
      // Line 128: amountToFinance = baseOutTheDoorPrice + backendProducts - downPayment - netTradeIn;
      // So frontEndAmountToFinance is amountToFinance without backend products.

      // Book Value: 28000 (Trade)
      // Amount to Finance (Front): ~32291.5
      // LTV: 32291.5 / 28000 = ~1.153 -> 115.3%

      expect(result.frontEndLtv).not.toBe("Error");
      if (typeof result.frontEndLtv === "number") {
        expect(result.frontEndLtv).toBeCloseTo(115.3, 1);
      }
    });
  });
});
