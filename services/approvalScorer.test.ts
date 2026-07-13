import { describe, it, expect } from "vitest";
import { scoreApprovalOdds, APPROVAL_CONFIG, BAND_META } from "./approvalScorer";
import type { CalculatedVehicle } from "../types";

/**
 * The scorer only reads vehicle.otdLtv and vehicle.monthlyPayment — the rest of
 * the shape is boilerplate to satisfy CalculatedVehicle.
 */
const mkVehicle = (
  otdLtv: number | "N/A" | "Error",
  monthlyPayment: number | "N/A" | "Error" = "N/A"
): CalculatedVehicle => ({
  vehicle: "2020 Test Car",
  stock: "STK1",
  vin: "VIN1TEST",
  modelYear: 2020,
  mileage: 40000,
  price: 20000,
  jdPower: 20000,
  jdPowerRetail: 22000,
  unitCost: 18000,
  baseOutTheDoorPrice: 21000,
  salesTax: 1200,
  frontEndLtv: 100,
  frontEndGross: 2000,
  amountToFinance: 20000,
  otdLtv,
  monthlyPayment,
});

const noIncome = { creditScore: null, monthlyIncome: null };

describe("approvalScorer (mockup formula + retained hardening)", () => {
  describe("config sanity", () => {
    it("carries the mockup weights and the hardening knobs", () => {
      expect(APPROVAL_CONFIG.weights).toEqual({ credit: 0.36, ltv: 0.5, pti: 0.14 });
      expect(APPROVAL_CONFIG.ptiSoftCap).toEqual({ threshold: 20, cap: 55 });
      expect(APPROVAL_CONFIG.ptiHardCap).toEqual({ threshold: 25, cap: 35 });
      expect(APPROVAL_CONFIG.noFitCap).toBe(45);
      expect(APPROVAL_CONFIG.pti.unknown).toBe(50);
      expect(APPROVAL_CONFIG.bands).toEqual({ strong: 72, moderate: 50 });
      expect(APPROVAL_CONFIG.clamp).toEqual({ floor: 8, ceil: 98 });
    });
  });

  describe("band boundaries (strong ≥ 72, moderate ≥ 50)", () => {
    it("scores exactly 72 as strong", () => {
      // Missing income is neutral (7 weighted points), not best-in-class.
      const r = scoreApprovalOdds(mkVehicle(100), { creditScore: 589, monthlyIncome: null }, 3);
      expect(r.internalScore).toBe(72);
      expect(r.band).toBe("strong");
    });

    it("scores just below 72 as moderate", () => {
      const r = scoreApprovalOdds(mkVehicle(100), { creditScore: 580, monthlyIncome: null }, 3);
      expect(r.internalScore).toBe(71);
      expect(r.band).toBe("moderate");
    });

    it("scores at/above 50 as moderate and below 50 as weak", () => {
      // fico unknown contributes 18 and neutral PTI contributes 7.
      const atBoundary = scoreApprovalOdds(mkVehicle(129.55), noIncome, 3);
      expect(atBoundary.internalScore).toBe(50);
      expect(atBoundary.band).toBe("moderate");

      const below = scoreApprovalOdds(mkVehicle(131), noIncome, 3);
      expect(below.internalScore).toBe(48);
      expect(below.band).toBe("weak");
    });
  });

  describe("score clamp [8, 98]", () => {
    it("floors a hopeless structure at 8", () => {
      // creditComp 0, ltvComp clamped to 0, ptiComp 0 (pti 100%).
      const r = scoreApprovalOdds(
        mkVehicle(200, 2000),
        { creditScore: 450, monthlyIncome: 2000 },
        1
      );
      expect(r.internalScore).toBe(8);
      expect(r.band).toBe("weak");
    });

    it("ceils a perfect structure at 98", () => {
      const r = scoreApprovalOdds(mkVehicle(80, 200), { creditScore: 850, monthlyIncome: 5000 }, 8);
      expect(r.internalScore).toBe(98);
      expect(r.band).toBe("strong");
    });
  });

  describe("PTI affordability caps (retained hardening)", () => {
    it("caps the score at 55 when PTI hits the soft-cap threshold (20%)", () => {
      // pti = 200/1000 = 20% on an otherwise excellent deal.
      const r = scoreApprovalOdds(mkVehicle(80, 200), { creditScore: 850, monthlyIncome: 1000 }, 8);
      expect(r.ptiRatio).toBeCloseTo(20, 5);
      expect(r.internalScore).toBeLessThanOrEqual(55);
      expect(r.internalScore).toBe(55);
    });

    it("caps the score at 35 when PTI hits the hard-cap threshold (25%)", () => {
      // pti = 250/1000 = 25% on an otherwise excellent deal.
      const r = scoreApprovalOdds(mkVehicle(80, 250), { creditScore: 850, monthlyIncome: 1000 }, 8);
      expect(r.ptiRatio).toBeCloseTo(25, 5);
      expect(r.internalScore).toBeLessThanOrEqual(35);
      expect(r.band).toBe("weak");
    });
  });

  describe("eligibility cap (retained hardening)", () => {
    it("caps at 45 and bands 'none' when no active lender fits", () => {
      const r = scoreApprovalOdds(mkVehicle(80), { creditScore: 850, monthlyIncome: null }, 0);
      expect(r.internalScore).toBeLessThanOrEqual(45);
      expect(r.band).toBe("none");
      expect(r.reasons).toContain("No active lender fits this structure");
    });
  });

  describe("unknown inputs", () => {
    it("holds unknown income neutral instead of awarding the best PTI component", () => {
      const r = scoreApprovalOdds(mkVehicle(100), { creditScore: 650, monthlyIncome: null }, 4);
      expect(r.internalScore).toBe(78);
      expect(r.ptiRatio).toBeUndefined();
      expect(r.reasons).toContain("Monthly income missing; PTI held neutral");
    });

    it("treats missing fico and missing ltv as neutral 50 components", () => {
      // creditComp 50 → 18; ltvComp 50 → 25; neutral PTI → 7 ⇒ 50.
      const r = scoreApprovalOdds(mkVehicle("N/A"), noIncome, 2);
      expect(r.internalScore).toBe(50);
      expect(r.band).toBe("moderate");
    });
  });

  describe("mockup reference case", () => {
    it("scores fico 712 / otd 112 / pti 7.5 / 7 fits as strong", () => {
      // creditComp = 65.5 → 23.58; ltvComp = 115 − 12·2.2 = 88.6 → 44.3;
      // pti = 300/4000 = 7.5% ≤ 12 ⇒ ptiComp 100 → 14 ⇒ 81.88 → 82.
      const r = scoreApprovalOdds(
        mkVehicle(112, 300),
        { creditScore: 712, monthlyIncome: 4000 },
        7
      );
      expect(r.ptiRatio).toBeCloseTo(7.5, 5);
      expect(r.internalScore).toBe(82);
      expect(r.band).toBe("strong");
    });
  });

  describe("BAND_META", () => {
    it("carries the dc-contract labels and colors", () => {
      expect(BAND_META.strong).toEqual({
        label: "Strong approval",
        colorVar: "var(--color-success)",
      });
      expect(BAND_META.moderate).toEqual({
        label: "Moderate odds",
        colorVar: "var(--color-warning)",
      });
      expect(BAND_META.weak).toEqual({
        label: "Weak — restructure",
        colorVar: "var(--color-danger)",
      });
      expect(BAND_META.none).toEqual({
        label: "No lender fit",
        colorVar: "var(--color-danger)",
      });
    });
  });

  describe("additional scorer edges for coverage", () => {
    it("handles very high LTV and low income producing low score and reasons", () => {
      const r = scoreApprovalOdds(mkVehicle(200, 900), { creditScore: 500, monthlyIncome: 800 }, 1);
      expect(r.internalScore).toBeLessThan(50);
      expect(r.reasons.length).toBeGreaterThan(0);
    });

    it("handles Error payment string in vehicle", () => {
      const v = mkVehicle(105, "Error");
      const r = scoreApprovalOdds(v, { creditScore: 700, monthlyIncome: 3000 }, 3);
      expect(r.band).toBeDefined();
    });

    it("APPROVAL_CONFIG and BAND_META are exported and stable", () => {
      expect(APPROVAL_CONFIG).toHaveProperty("weights");
      expect(BAND_META.strong.label).toMatch(/Strong/);
    });
  });
});
