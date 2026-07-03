import { describe, it, expect } from "vitest";
import { lenderFitForVehicle, unitsForEachLender, activeLenderCount } from "./lenderFit";
import { INITIAL_DEAL_DATA, INITIAL_FILTER_DATA } from "../constants";
import type { CalculatedVehicle, DealData, FilterData, LenderProfile } from "../types";

// Real LenderProfile shapes with tiers — Alpha has a prime tier that falls back
// to a standard tier, Beta is prime-only, Ghost is inactive but would fit
// everything if it were counted.
const alpha: LenderProfile = {
  id: "alpha",
  name: "Alpha Bank",
  bookValueSource: "Trade",
  tiers: [
    { name: "Prime", minFico: 700, maxLtv: 110, maxTerm: 84 },
    { name: "Standard", minFico: 600, maxLtv: 120, maxTerm: 84 },
  ],
};

const beta: LenderProfile = {
  id: "beta",
  name: "Beta CU",
  bookValueSource: "Trade",
  tiers: [{ name: "Prime Only", minFico: 700, maxLtv: 110, maxTerm: 72 }],
};

const ghost: LenderProfile = {
  id: "ghost",
  name: "Ghost Finance",
  active: false,
  bookValueSource: "Trade",
  tiers: [{ name: "Anything Goes" }],
};

const LENDERS = [alpha, beta, ghost];

const mkVehicle = (over: Partial<CalculatedVehicle> = {}): CalculatedVehicle => ({
  vehicle: "2020 Test Car",
  stock: "STK1",
  vin: "VIN1TEST",
  modelYear: 2020,
  mileage: 50000,
  price: 21000,
  jdPower: 20000, // book — the matcher computes LTV as amountToFinance / book
  jdPowerRetail: 22000,
  unitCost: 18000,
  baseOutTheDoorPrice: 22000,
  salesTax: 1260,
  frontEndLtv: 105,
  frontEndGross: 3000,
  amountToFinance: 20000, // ⇒ OTD LTV 100%
  otdLtv: 100,
  monthlyPayment: 400,
  ...over,
});

const mkDeal = (over: Partial<DealData & FilterData> = {}): DealData & FilterData => ({
  ...INITIAL_DEAL_DATA,
  ...INITIAL_FILTER_DATA,
  loanTerm: 72,
  creditScore: 650,
  monthlyIncome: 4000,
  ...over,
});

describe("lenderFit", () => {
  describe("lenderFitForVehicle", () => {
    it("evaluates only active lenders and reports fitCount + fitNames", () => {
      const fit = lenderFitForVehicle(mkVehicle(), mkDeal(), LENDERS);

      // Ghost (active: false) is not evaluated at all.
      expect(fit.entries).toHaveLength(2);
      expect(fit.entries.map((e) => e.name)).not.toContain("Ghost Finance");

      // fico 650: Alpha fits via its Standard tier, Beta (700+) does not.
      expect(fit.fitCount).toBe(1);
      expect(fit.fitNames).toEqual(["Alpha Bank"]);

      const alphaEntry = fit.entries.find((e) => e.lenderId === "alpha");
      expect(alphaEntry?.eligible).toBe(true);
      expect(alphaEntry?.matchedTier?.name).toBe("Standard");

      const betaEntry = fit.entries.find((e) => e.lenderId === "beta");
      expect(betaEntry?.eligible).toBe(false);
      expect(betaEntry?.reasons.length).toBeGreaterThan(0);
    });

    it("matches the prime tier once the credit supports it", () => {
      const fit = lenderFitForVehicle(mkVehicle(), mkDeal({ creditScore: 720 }), LENDERS);
      expect(fit.fitCount).toBe(2);
      expect(fit.fitNames).toEqual(["Alpha Bank", "Beta CU"]);

      const alphaEntry = fit.entries.find((e) => e.lenderId === "alpha");
      expect(alphaEntry?.matchedTier?.name).toBe("Prime");
    });

    it("fits nobody when the structure exceeds every LTV cap", () => {
      // amountToFinance 26000 on a 20000 book ⇒ 130% LTV, above both caps.
      const fit = lenderFitForVehicle(
        mkVehicle({ amountToFinance: 26000, otdLtv: 130 }),
        mkDeal({ creditScore: 720 }),
        LENDERS
      );
      expect(fit.fitCount).toBe(0);
      expect(fit.fitNames).toEqual([]);
    });
  });

  describe("unitsForEachLender", () => {
    it("counts fitting units per active lender (inactive lenders get no key)", () => {
      const inventory = [
        mkVehicle(), // LTV 100 — fits Alpha (Standard) at fico 650
        mkVehicle({ vin: "VIN2TEST", amountToFinance: 25000, otdLtv: 125 }), // 125% — fits nobody
      ];
      const counts = unitsForEachLender(inventory, mkDeal(), LENDERS);
      expect(counts).toEqual({ alpha: 1, beta: 0 });
      expect(counts).not.toHaveProperty("ghost");
    });

    it("re-counts as the customer's credit changes", () => {
      const inventory = [mkVehicle(), mkVehicle({ vin: "VIN2TEST" })];
      const counts = unitsForEachLender(inventory, mkDeal({ creditScore: 720 }), LENDERS);
      expect(counts).toEqual({ alpha: 2, beta: 2 });
    });
  });

  describe("activeLenderCount", () => {
    it("counts only active lenders", () => {
      expect(activeLenderCount(LENDERS)).toBe(2);
      expect(activeLenderCount([ghost])).toBe(0);
      expect(activeLenderCount([])).toBe(0);
    });
  });
});
