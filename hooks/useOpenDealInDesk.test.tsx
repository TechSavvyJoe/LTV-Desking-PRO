import { describe, expect, it } from "vitest";
import { mergeFiltersFromDeal } from "./useOpenDealInDesk";
import { INITIAL_FILTER_DATA } from "../constants";
import type { SavedDeal } from "../types";

function makeDeal(customerFilters: SavedDeal["customerFilters"]): SavedDeal {
  return {
    id: "d1",
    date: "2026-01-01",
    customerName: "Customer",
    salespersonName: "Rep",
    vehicle: {} as SavedDeal["vehicle"],
    dealData: {} as SavedDeal["dealData"],
    customerFilters,
  };
}

describe("mergeFiltersFromDeal", () => {
  it("replaces monthlyDebt from the incoming deal instead of carrying over the previous customer's value [ship-gate SHOULD-FIX #1]", () => {
    // Customer A's filters, including a monthlyDebt the old code would leak.
    const afterCustomerA = mergeFiltersFromDeal(INITIAL_FILTER_DATA, {
      ...makeDeal({ creditScore: 700, monthlyIncome: 6000, monthlyDebt: 1800 }),
    });
    expect(afterCustomerA.monthlyDebt).toBe(1800);

    // Opening customer B's deal, whose saved filters have no debt, must
    // clear A's monthlyDebt rather than spreading it forward.
    const afterCustomerB = mergeFiltersFromDeal(afterCustomerA, {
      ...makeDeal({ creditScore: 620, monthlyIncome: 4000, monthlyDebt: null }),
    });

    expect(afterCustomerB.monthlyDebt).toBeNull();
    expect(afterCustomerB.creditScore).toBe(620);
    expect(afterCustomerB.monthlyIncome).toBe(4000);
  });

  it("defaults monthlyDebt to null when the saved deal predates the field", () => {
    const legacyDeal = makeDeal({ creditScore: 650, monthlyIncome: 5000 });
    const merged = mergeFiltersFromDeal(INITIAL_FILTER_DATA, legacyDeal);
    expect(merged.monthlyDebt).toBeNull();
  });

  it("preserves other filter fields untouched by the deal (e.g. inventory search filters)", () => {
    const withSearchFilters = { ...INITIAL_FILTER_DATA, maxPrice: 30000, vin: "1HGCV1F3XLA000001" };
    const merged = mergeFiltersFromDeal(
      withSearchFilters,
      makeDeal({ creditScore: 700, monthlyIncome: 6000, monthlyDebt: 900 })
    );
    expect(merged.maxPrice).toBe(30000);
    expect(merged.vin).toBe("1HGCV1F3XLA000001");
  });
});
