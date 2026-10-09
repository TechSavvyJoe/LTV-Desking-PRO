import { describe, expect, it } from "vitest";
import { INITIAL_DEAL_DATA, INITIAL_SETTINGS, SAMPLE_INVENTORY } from "../constants";
import { calculateFinancials } from "./calculator";
import { cashToPaymentTarget } from "./paymentTarget";
import type { DealData, Vehicle } from "../types";

const vehicle: Vehicle = { ...SAMPLE_INVENTORY[0]!, price: 30_000 };
const settings = { ...INITIAL_SETTINGS, customTaxRate: null };
const deal: DealData = {
  ...INITIAL_DEAL_DATA,
  downPayment: 1000,
  interestRate: 8.9,
  loanTerm: 72,
  buyerState: "MI",
};

describe("cash to payment ceiling", () => {
  it.each([
    { interestRate: 0, loanTerm: 60, ceiling: 400, tradeInValue: 0, tradeInPayoff: 0 },
    { interestRate: 8.9, loanTerm: 72, ceiling: 450.01, tradeInValue: 0, tradeInPayoff: 0 },
    { interestRate: 22, loanTerm: 48, ceiling: 500, tradeInValue: 5000, tradeInPayoff: 12_000 },
    { interestRate: 1.99, loanTerm: 84, ceiling: 210.009, tradeInValue: 10_000, tradeInPayoff: 0 },
  ])("proves the minimum cent using full repricing: %j", ({ ceiling, ...patch }) => {
    const structure = {
      ...deal,
      ...patch,
      backendProducts: 3500,
      manufacturerRebate: 1250,
      dealerDiscount: 250,
      transactionFees: 150,
    };
    const result = cashToPaymentTarget(vehicle, structure, settings, ceiling);
    expect(result.status).toBe("proposal");
    if (result.status !== "proposal") throw new Error("Expected a cash proposal");
    expect(result.proposed.monthlyPayment).toBeLessThanOrEqual(ceiling);
    const oneCentLess = calculateFinancials(
      vehicle,
      {
        ...structure,
        downPayment: result.totalCash - 0.01,
      },
      settings
    );
    expect(oneCentLess.monthlyPayment).toBeGreaterThan(ceiling);
    expect(result.proposed.salesTax).toBe(result.current.salesTax);
    expect(result.proposed.frontEndGross).toBe(result.current.frontEndGross);
    expect(result.additionalCash).toBeCloseTo(result.totalCash - structure.downPayment, 2);
    expect(structure.interestRate).toBe(patch.interestRate);
    if (patch.interestRate === 0) expect(result.interestSavings).toBe(0);
  });

  it("uses current engine inputs rather than a stale calculated payment", () => {
    const stale = { ...vehicle, monthlyPayment: 1, amountToFinance: 1 };
    expect(cashToPaymentTarget(stale, deal, settings, 300).status).toBe("proposal");
  });

  it("does not recommend more cash when the payment is already in budget", () => {
    expect(cashToPaymentTarget(vehicle, deal, settings, 1000).status).toBe("within-budget");
  });

  it.each([null, undefined, 0, -1, NaN, Infinity])(
    "rejects an unknown/invalid ceiling %s",
    (ceiling) => {
      expect(cashToPaymentTarget(vehicle, deal, settings, ceiling).status).toBe("inputs-needed");
    }
  );

  it.each([
    { interestRate: "" },
    { interestRate: null },
    { interestRate: NaN },
    { interestRate: -1 },
    { interestRate: 50.1 },
    { loanTerm: 0 },
    { loanTerm: 72.5 },
    { loanTerm: 121 },
    { downPayment: "" },
    { downPayment: 1.001 },
    { tradeInPayoff: Infinity },
    { backendProducts: NaN },
    { manufacturerRebate: -1 },
    { transactionFees: NaN },
  ])("rejects unsupported source inputs: %j", (patch) => {
    expect(
      cashToPaymentTarget(vehicle, { ...deal, ...patch } as DealData, settings, 300).status
    ).toBe("inputs-needed");
  });

  it("holds missing price and unsupported tax settings", () => {
    expect(cashToPaymentTarget({ ...vehicle, price: "N/A" }, deal, settings, 300).status).toBe(
      "inputs-needed"
    );
    expect(
      cashToPaymentTarget(
        vehicle,
        { ...deal, buyerState: "CA" } as unknown as DealData,
        settings,
        300
      ).status
    ).toBe("inputs-needed");
  });
});
