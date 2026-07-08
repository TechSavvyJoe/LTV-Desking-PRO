import { describe, it, expect } from "vitest";
import { calculateMonthlyPayment, calculateLoanAmount, calculateFinancials } from "./calculator";
import { Vehicle, DealData, Settings } from "../types";
import { DEFAULT_AI_SETTINGS } from "../lib/aiModelRegistry";

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
      miTradeInCreditCap: 12000,
      vscPrice: 2495,
      gapPrice: 895,
      ai: DEFAULT_AI_SETTINGS,
    };

    it("should calculate full deal structure correctly", () => {
      const result = calculateFinancials(mockVehicle, mockDealData, mockSettings);

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
      const result = calculateFinancials(mockVehicle, dealWithTrade, mockSettings);

      // Taxable: (30000 - 10000) + 250 + 25 = 20275
      // Tax: 20275 * 0.06 = 1216.5
      expect(result.salesTax).toBeCloseTo(1216.5, 2);

      // Net Trade: 10000 - 5000 = 5000 equity
      // Amount to Finance should decrease by 5000 equity + tax savings
    });

    it("should calculate LTV correctly", () => {
      const result = calculateFinancials(mockVehicle, mockDealData, mockSettings);

      // Front-end LTV = selling price / book (trade book preferred), the
      // deal-independent unit advance metric. [reconciliation 5]
      // 30000 / 28000 = ~107.14%
      expect(result.frontEndLtv).not.toBe("Error");
      if (typeof result.frontEndLtv === "number") {
        expect(result.frontEndLtv).toBeCloseTo((30000 / 28000) * 100, 5);
      }

      // OTD LTV keeps the full deal structure: amountToFinance / book.
      if (typeof result.otdLtv === "number" && typeof result.amountToFinance === "number") {
        expect(result.otdLtv).toBeCloseTo((result.amountToFinance / 28000) * 100, 5);
      }
    });

    // --- frontEndLtv = price / book [reconciliation 5] ---

    it("frontEndLtv is deal-independent (down/trade/backend do not move it)", () => {
      const base = calculateFinancials(mockVehicle, mockDealData, mockSettings);
      const heavy = calculateFinancials(
        mockVehicle,
        { ...mockDealData, downPayment: 5000, tradeInValue: 4000, backendProducts: 3000 },
        mockSettings
      );
      expect(heavy.frontEndLtv).toBeCloseTo(base.frontEndLtv as number, 5);
      // ...while the OTD LTV does move.
      expect(heavy.otdLtv).not.toBeCloseTo(base.otdLtv as number, 1);
    });

    it("frontEndLtv falls back to retail book when the trade book is missing", () => {
      const noTradeBook: Vehicle = { ...mockVehicle, jdPower: "N/A" };
      const result = calculateFinancials(noTradeBook, mockDealData, mockSettings);
      // 30000 / 32000 (retail) = 93.75%
      expect(result.frontEndLtv).toBeCloseTo(93.75, 5);
    });

    // --- IL / FL buyer states + reciprocity caps [reconciliation 4] ---
    // MI-dealer reciprocity collects min(homeRate, MI 6%) for out-of-state buyers.

    it("taxes an IN buyer at the 6% reciprocal cap, not IN's 7%", () => {
      const deal = { ...mockDealData, stateFees: 0, buyerState: "IN" as const };
      const settings: Settings = { ...mockSettings, outOfStateTransitFee: 0 };
      const result = calculateFinancials(mockVehicle, deal, settings);
      // taxable 30275 at min(7%, 6%) = 6% → 1816.5 (7% would be 2119.25)
      expect(result.salesTax).toBeCloseTo(1816.5, 2);
    });

    it("taxes an IL buyer at the 6% reciprocal cap, not IL's 6.25%", () => {
      const deal = { ...mockDealData, stateFees: 0, buyerState: "IL" as const };
      const settings: Settings = { ...mockSettings, outOfStateTransitFee: 0 };
      const result = calculateFinancials(mockVehicle, deal, settings);
      // taxable 30275 at min(6.25%, 6%) = 6% → 1816.5 (6.25% would be 1892.19)
      expect(result.salesTax).toBeCloseTo(1816.5, 2);
    });

    it("taxes a FL buyer at FL's 6% (already at the cap) plus the transit fee", () => {
      const deal = { ...mockDealData, stateFees: 0, buyerState: "FL" as const };
      const settings: Settings = { ...mockSettings, outOfStateTransitFee: 10 };
      const result = calculateFinancials(mockVehicle, deal, settings);
      expect(result.salesTax).toBeCloseTo(1816.5, 2);
      // Out-of-state transit fee lands in OTD for FL like any non-MI buyer.
      expect(result.baseOutTheDoorPrice).toBeCloseTo(30000 + 250 + 25 + 1816.5 + 10, 2);
    });

    // --- rebate wiring [WS-C] ---

    it("subtracts the rebate from the amount financed without changing the tax", () => {
      const base = calculateFinancials(mockVehicle, mockDealData, mockSettings);
      const result = calculateFinancials(
        mockVehicle,
        { ...mockDealData, rebate: 2000 },
        mockSettings
      );
      expect(result.salesTax).toBeCloseTo(base.salesTax as number, 2);
      expect(result.amountToFinance).toBeCloseTo((base.amountToFinance as number) - 2000, 2);
    });

    it("keeps existing negative-amount semantics when the rebate exceeds the OTD (no clamp)", () => {
      const result = calculateFinancials(
        mockVehicle,
        { ...mockDealData, rebate: 50000 },
        mockSettings
      );
      expect(typeof result.amountToFinance).toBe("number");
      expect(result.amountToFinance as number).toBeLessThan(0);
      // Negative principal ⇒ no payment owed, not an "Error".
      expect(result.monthlyPayment).toBe(0);
    });

    // --- Regression: silent-wrong-number paths (B5/B6/B7) ---

    it("treats a blank APR as unset (N/A payment), not a free 0% loan [B6]", () => {
      const blankRate = { ...mockDealData, interestRate: "" as unknown as number };
      const result = calculateFinancials(mockVehicle, blankRate, mockSettings);
      expect(result.monthlyPayment).toBe("N/A");
    });

    it("still honors an explicit 0% promotional APR as a real payment [B6]", () => {
      const promo = { ...mockDealData, interestRate: 0 };
      const result = calculateFinancials(mockVehicle, promo, mockSettings);
      expect(result.monthlyPayment).not.toBe("N/A");
      expect(result.monthlyPayment).not.toBe("Error");
      // 0% => OTD / term, financed amount spread evenly.
      if (typeof result.monthlyPayment === "number" && typeof result.amountToFinance === "number") {
        expect(result.monthlyPayment).toBeCloseTo(result.amountToFinance / 60, 2);
      }
    });

    it("rounds OTD, amount-to-finance, and payment to whole cents [B7]", () => {
      const result = calculateFinancials(mockVehicle, mockDealData, mockSettings);
      for (const v of [result.baseOutTheDoorPrice, result.amountToFinance, result.monthlyPayment]) {
        if (typeof v === "number") {
          const cents = v * 100;
          expect(Math.abs(cents - Math.round(cents))).toBeLessThan(1e-6);
        }
      }
    });

    it("applies the out-of-state transit fee even when a custom tax rate is set [B5]", () => {
      const settingsCustomOOS: Settings = {
        ...mockSettings,
        defaultState: "OH",
        outOfStateTransitFee: 10,
        customTaxRate: 6.0,
      };
      const deal = { ...mockDealData, stateFees: 0 };
      const result = calculateFinancials(mockVehicle, deal, settingsCustomOOS);
      // taxable = 30000 + 250 + 25 = 30275; custom 6% => 1816.5; + transit fee 10.
      // OTD = 30000 + 250 + 25 + 0 + 1816.5 + 10 = 32101.5
      expect(result.baseOutTheDoorPrice).toBeCloseTo(32101.5, 2);
    });

    it("computes out-of-state (OH) tax at the reciprocal-capped rate + transit fee", () => {
      const settingsOOS: Settings = {
        ...mockSettings,
        defaultState: "OH",
        outOfStateTransitFee: 10,
        customTaxRate: null,
      };
      const deal = { ...mockDealData, stateFees: 0 };
      const result = calculateFinancials(mockVehicle, deal, settingsOOS);
      // OH 5.75% < MI 6% => 5.75%. taxable 30275 * 0.0575 = 1740.8125 -> 1740.81
      expect(result.salesTax).toBeCloseTo(1740.81, 2);
      // OTD includes the transit fee.
      expect(result.baseOutTheDoorPrice).toBeCloseTo(30000 + 250 + 25 + 1740.81 + 10, 2);
    });

    // --- MI trade-in credit cap [G17] ---

    it("caps the MI sales-tax trade-in credit at the statutory cap [G17]", () => {
      const bigTrade = { ...mockDealData, tradeInValue: 20000 };
      const result = calculateFinancials(mockVehicle, bigTrade, mockSettings);
      // Trade credit clamped to 12000: taxable (30000 - 12000) + 250 + 25 = 18275
      // Tax (MI 6%): 18275 * 0.06 = 1096.5
      expect(result.salesTax).toBeCloseTo(1096.5, 2);
    });

    it("does not cap the trade-in credit below the MI cap [G17]", () => {
      const smallTrade = { ...mockDealData, tradeInValue: 10000 };
      const result = calculateFinancials(mockVehicle, smallTrade, mockSettings);
      // Full credit: taxable (30000 - 10000) + 250 + 25 = 20275 -> 1216.5
      expect(result.salesTax).toBeCloseTo(1216.5, 2);
    });

    it("does not apply the MI cap to out-of-state (OH) buyers [G17]", () => {
      const deal = { ...mockDealData, tradeInValue: 20000, buyerState: "OH" as const };
      const settingsOOS: Settings = { ...mockSettings, outOfStateTransitFee: 0 };
      const result = calculateFinancials(mockVehicle, deal, settingsOOS);
      // Full 20000 credit: taxable (30000 - 20000) + 250 + 25 = 10275
      // OH 5.75% (< MI 6% reciprocal cap): 10275 * 0.0575 = 590.8125 -> 590.81
      expect(result.salesTax).toBeCloseTo(590.81, 2);
    });

    // --- per-deal buyer state [G18] ---

    it("uses the deal's buyerState instead of settings.defaultState when present [G18]", () => {
      const settingsMI: Settings = { ...mockSettings, outOfStateTransitFee: 10 };
      const deal = { ...mockDealData, stateFees: 0, buyerState: "OH" as const };
      const result = calculateFinancials(mockVehicle, deal, settingsMI);
      // OH 5.75% on 30275 = 1740.8125 -> 1740.81, plus the transit fee in OTD.
      expect(result.salesTax).toBeCloseTo(1740.81, 2);
      expect(result.baseOutTheDoorPrice).toBeCloseTo(30000 + 250 + 25 + 1740.81 + 10, 2);
    });

    it("falls back to settings.defaultState when buyerState is undefined [G18]", () => {
      const result = calculateFinancials(mockVehicle, mockDealData, mockSettings);
      // Identical to the settings-only MI path: 30275 * 0.06 = 1816.5
      expect(result.salesTax).toBeCloseTo(1816.5, 2);
    });

    // --- fail loudly on unknown states [G16] ---

    it("throws on an unsupported tax state instead of silently taxing at 6% [G16]", () => {
      const deal = {
        ...mockDealData,
        buyerState: "TX" as unknown as DealData["buyerState"],
      };
      expect(() => calculateFinancials(mockVehicle, deal, mockSettings)).toThrow(
        /Unsupported tax state: TX/
      );
    });

    it("does not error when down payment exceeds price (negative amount to finance)", () => {
      const deal = { ...mockDealData, downPayment: 50000 };
      const result = calculateFinancials(mockVehicle, deal, mockSettings);
      // Negative principal => no payment owed, must not be "Error".
      expect(result.monthlyPayment).toBe(0);
    });

    it("applies out-of-state transit fee when buyerState is OOS and defaultState is MI under custom rate [B5-edge]", () => {
      const settings: Settings = {
        ...mockSettings,
        defaultState: "MI",
        outOfStateTransitFee: 15,
        customTaxRate: 5.0,
      };
      const deal = { ...mockDealData, buyerState: "OH" as const, stateFees: 0 };
      const result = calculateFinancials(mockVehicle, deal, settings);
      // OTD should include $15 transit fee because buyerState is OH (non-MI)
      expect(result.baseOutTheDoorPrice).toBeCloseTo(30000 + 250 + 25 + 1513.75 + 15, 2); // 30275 * 0.05 = 1513.75 tax
    });

    it("treats null, undefined, and NaN interest rates as unset (N/A payment) [B6-edge]", () => {
      for (const val of [null, undefined, NaN]) {
        const deal = { ...mockDealData, interestRate: val as any };
        const result = calculateFinancials(mockVehicle, deal, mockSettings);
        expect(result.monthlyPayment).toBe("N/A");
      }
    });

    it("rounds sales tax and OTD to exact cents when values contain fractional cents [B7-edge]", () => {
      // Price with cents and custom tax rate (e.g. 5.875% -> 0.05875)
      const oddVehicle = { ...mockVehicle, price: 30000.55 };
      const settings: Settings = { ...mockSettings, customTaxRate: 5.875 }; // 5.875% custom tax
      const result = calculateFinancials(oddVehicle, { ...mockDealData, stateFees: 0 }, settings);
      // Taxable amount = 30000.55 + 250 (doc) + 25 (cvr) = 30275.55
      // Raw tax = 30275.55 * 0.05875 = 1778.6885625 -> rounds to 1778.69
      expect(result.salesTax).toBe(1778.69);
      // OTD = 30000.55 + 250 + 25 + 0 + 1778.69 = 32054.24
      expect(result.baseOutTheDoorPrice).toBe(32054.24);

      // Price with cents under standard MI 6% tax rate
      const resultMI = calculateFinancials(
        oddVehicle,
        { ...mockDealData, stateFees: 0 },
        mockSettings
      );
      // Taxable amount = 30275.55
      // Raw tax = 30275.55 * 0.06 = 1816.533 -> rounds to 1816.53
      expect(resultMI.salesTax).toBe(1816.53);
      expect(resultMI.baseOutTheDoorPrice).toBe(32092.08);
    });
  });

  describe("error-contract parity [B8]", () => {
    it("calculateLoanAmount returns 'Error' for an invalid term, matching calculateMonthlyPayment", () => {
      expect(calculateLoanAmount(500, 5, 0)).toBe("Error");
      expect(calculateLoanAmount(500, -5, 60)).toBe("Error");
    });

    it("calculateLoanAmount returns 0 only for a genuine zero payment", () => {
      expect(calculateLoanAmount(0, 5, 60)).toBe(0);
    });

    it("returns 'Error' for non-finite inputs in loan amount and monthly payment [B8-edge]", () => {
      expect(calculateMonthlyPayment(30000, NaN, 60)).toBe("Error");
      expect(calculateMonthlyPayment(30000, Infinity, 60)).toBe("Error");
      expect(calculateLoanAmount(500, NaN, 60)).toBe("Error");
      expect(calculateLoanAmount(500, Infinity, 60)).toBe("Error");
    });

    // --- additional coverage gaps from deep review (negative prices, blanks, float term, unsupported state) ---
    it("treats negative price as invalid (N/A results) [negative prices now rejected]", () => {
      const negVehicle: Vehicle = {
        vehicle: "Test",
        stock: "S1",
        vin: "TESTVIN123",
        modelYear: 2020,
        mileage: 10000,
        price: -5000,
        jdPower: 12000,
        jdPowerRetail: 15000,
        unitCost: 10000,
        baseOutTheDoorPrice: "N/A",
      };
      const simpleDeal: DealData = {
        downPayment: 0,
        tradeInValue: 0,
        tradeInPayoff: 0,
        interestRate: 5,
        loanTerm: 60,
        backendProducts: 0,
        stateFees: 0,
        notes: "",
        buyerState: "MI",
      };
      const simpleSettings: Settings = {
        defaultTerm: 72,
        defaultApr: 8.9,
        defaultState: "MI",
        docFee: 0,
        cvrFee: 0,
        defaultStateFees: 0,
        outOfStateTransitFee: 0,
        customTaxRate: null,
        miTradeInCreditCap: 12000,
        vscPrice: 0,
        gapPrice: 0,
        ltvThresholds: { warn: 100, danger: 110, critical: 120 },
        ai: { provider: "openai", lenderExtractModel: "", dealAnalysisModel: "", quickModel: "" },
      };
      const result = calculateFinancials(negVehicle, simpleDeal, simpleSettings);
      expect(result.baseOutTheDoorPrice).toBe("N/A");
      expect(result.salesTax).toBe("N/A");
      expect(result.amountToFinance).toBe("N/A");
      expect(result.monthlyPayment).toBe("N/A");
      expect(result.frontEndLtv).toBe("N/A");
    });

    it("handles blank/empty deal data and vehicle gracefully (N/A or zeroed)", () => {
      const blankVehicle: Vehicle = {
        vehicle: "",
        stock: "",
        vin: "",
        modelYear: "N/A",
        mileage: "N/A",
        price: "N/A",
        jdPower: "N/A",
        jdPowerRetail: "N/A",
        unitCost: "N/A",
        baseOutTheDoorPrice: "N/A",
      };
      const blankDeal: DealData = {
        downPayment: 0 as any,
        tradeInValue: 0 as any,
        tradeInPayoff: 0 as any,
        interestRate: "" as any,
        loanTerm: 0 as any,
        backendProducts: 0 as any,
        stateFees: 0 as any,
        notes: "",
      };
      const simpleSettings: Settings = {
        defaultTerm: 72,
        defaultApr: 8.9,
        defaultState: "MI",
        docFee: 0,
        cvrFee: 0,
        defaultStateFees: 0,
        outOfStateTransitFee: 0,
        customTaxRate: null,
        miTradeInCreditCap: 12000,
        vscPrice: 0,
        gapPrice: 0,
        ltvThresholds: { warn: 100, danger: 110, critical: 120 },
        ai: { provider: "openai", lenderExtractModel: "", dealAnalysisModel: "", quickModel: "" },
      };
      const result = calculateFinancials(blankVehicle, blankDeal, simpleSettings);
      expect(result.baseOutTheDoorPrice).toBe("N/A");
      expect(result.monthlyPayment).toBe("N/A");
    });

    it("accepts float loanTerm (coerces via toNumber; validator elsewhere enforces int)", () => {
      const simpleVehicle: Vehicle = {
        vehicle: "Test",
        stock: "S1",
        vin: "TESTVIN123",
        modelYear: 2020,
        mileage: 10000,
        price: 30000,
        jdPower: 12000,
        jdPowerRetail: 15000,
        unitCost: 10000,
        baseOutTheDoorPrice: "N/A",
      };
      const simpleDeal: DealData = {
        downPayment: 0,
        tradeInValue: 0,
        tradeInPayoff: 0,
        interestRate: 5,
        loanTerm: 60.7,
        backendProducts: 0,
        stateFees: 0,
        notes: "",
        buyerState: "MI",
      };
      const simpleSettings: Settings = {
        defaultTerm: 72,
        defaultApr: 8.9,
        defaultState: "MI",
        docFee: 0,
        cvrFee: 0,
        defaultStateFees: 0,
        outOfStateTransitFee: 0,
        customTaxRate: null,
        miTradeInCreditCap: 12000,
        vscPrice: 0,
        gapPrice: 0,
        ltvThresholds: { warn: 100, danger: 110, critical: 120 },
        ai: { provider: "openai", lenderExtractModel: "", dealAnalysisModel: "", quickModel: "" },
      };
      const result = calculateFinancials(simpleVehicle, simpleDeal, simpleSettings);
      expect(result.monthlyPayment).not.toBe("Error");
      expect(result.monthlyPayment).not.toBe("N/A");
      if (typeof result.monthlyPayment === "number") {
        expect(result.monthlyPayment).toBeGreaterThan(0);
      }
    });

    it("still throws on unsupported state even with other blanks", () => {
      const simpleVehicle: Vehicle = {
        vehicle: "Test",
        stock: "S1",
        vin: "TESTVIN123",
        modelYear: 2020,
        mileage: 10000,
        price: 30000,
        jdPower: 12000,
        jdPowerRetail: 15000,
        unitCost: 10000,
        baseOutTheDoorPrice: "N/A",
      };
      const dealBadState: DealData = {
        downPayment: 0,
        tradeInValue: 0,
        tradeInPayoff: 0,
        interestRate: 5,
        loanTerm: 60,
        backendProducts: 0,
        stateFees: 0,
        notes: "",
        buyerState: "XX" as any,
      };
      const simpleSettings: Settings = {
        defaultTerm: 72,
        defaultApr: 8.9,
        defaultState: "MI",
        docFee: 0,
        cvrFee: 0,
        defaultStateFees: 0,
        outOfStateTransitFee: 0,
        customTaxRate: null,
        miTradeInCreditCap: 12000,
        vscPrice: 0,
        gapPrice: 0,
        ltvThresholds: { warn: 100, danger: 110, critical: 120 },
        ai: { provider: "openai", lenderExtractModel: "", dealAnalysisModel: "", quickModel: "" },
      };
      expect(() => calculateFinancials(simpleVehicle, dealBadState, simpleSettings)).toThrow(
        /Unsupported tax state/
      );
    });
  });

  describe("more calculator financial edge paths", () => {
    it("handles zero everything producing N/A payments without crash", () => {
      const zVeh: Vehicle = {
        vehicle: "Z",
        stock: "0",
        vin: "0",
        modelYear: 2024,
        mileage: 0,
        price: 0,
        jdPower: 0,
        jdPowerRetail: 0,
        unitCost: 0,
        baseOutTheDoorPrice: "N/A",
      };
      const zDeal: DealData = {
        downPayment: 0,
        tradeInValue: 0,
        tradeInPayoff: 0,
        interestRate: 0,
        loanTerm: 0,
        backendProducts: 0,
        stateFees: 0,
        notes: "",
      };
      const zSet: Settings = {
        defaultTerm: 60,
        defaultApr: 0,
        defaultState: "MI",
        docFee: 0,
        cvrFee: 0,
        defaultStateFees: 0,
        outOfStateTransitFee: 0,
        customTaxRate: null,
        miTradeInCreditCap: 0,
        vscPrice: 0,
        gapPrice: 0,
        ltvThresholds: { warn: 100, danger: 100, critical: 100 },
        ai: { provider: "openai", lenderExtractModel: "", dealAnalysisModel: "", quickModel: "" },
      };
      const r = calculateFinancials(zVeh, zDeal, zSet);
      expect(r.amountToFinance).toBe("N/A");
    });

    it("calculateFinancials clamps extreme negative inputs safely", () => {
      const v = {
        vehicle: "Neg",
        stock: "N",
        vin: "N",
        modelYear: 2020,
        mileage: 0,
        price: 10000,
        jdPower: 0,
        jdPowerRetail: 0,
        unitCost: 0,
        baseOutTheDoorPrice: "N/A",
      } as Vehicle;
      const d: DealData = {
        downPayment: -999,
        tradeInValue: -100,
        tradeInPayoff: 0,
        interestRate: -1,
        loanTerm: 12,
        backendProducts: -10,
        stateFees: 0,
        notes: "",
      };
      const s: Settings = {
        defaultTerm: 60,
        defaultApr: 5,
        defaultState: "MI",
        docFee: 0,
        cvrFee: 0,
        defaultStateFees: 0,
        outOfStateTransitFee: 0,
        customTaxRate: null,
        miTradeInCreditCap: 0,
        vscPrice: 0,
        gapPrice: 0,
        ltvThresholds: { warn: 200, danger: 300, critical: 400 },
        ai: { provider: "openai", lenderExtractModel: "", dealAnalysisModel: "", quickModel: "" },
      };
      const r = calculateFinancials(v, d, s);
      expect(typeof r.salesTax).toBe("number");
    });
  });
});
