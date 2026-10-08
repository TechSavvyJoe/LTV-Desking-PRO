import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PaymentBreakdownChart, LenderComparisonChart } from "./DealCharts";
import {
  INITIAL_DEAL_DATA,
  INITIAL_FILTER_DATA,
  INITIAL_SETTINGS,
  SAMPLE_INVENTORY,
} from "../constants";
import { calculateFinancials } from "../services/calculator";
import type { LenderProfile } from "../types";

const vehicle = {
  ...calculateFinancials(SAMPLE_INVENTORY[0]!, INITIAL_DEAL_DATA, INITIAL_SETTINGS),
  amountToFinance: 18000,
};
const dealData = { ...INITIAL_DEAL_DATA, interestRate: 0, loanTerm: 60 };
const customerFilters = {
  ...INITIAL_FILTER_DATA,
  creditScore: 720,
  monthlyIncome: 6500,
  monthlyDebt: 500,
};
const lender: LenderProfile = {
  id: "checked",
  name: "Checked CU",
  tiers: [{ name: "Prime", minFico: 700, baseInterestRate: 0 }],
};
afterEach(cleanup);

describe("Loan analytics", () => {
  it("shows actual financed principal and zero interest for a genuine zero APR", () => {
    render(<PaymentBreakdownChart activeVehicle={vehicle} dealData={dealData} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "$18,000.00 principal and $0.00 estimated interest"
    );
    expect(screen.getAllByText("$18,000.00")).toHaveLength(2);
    expect(screen.getByText("$0.00")).toBeTruthy();
  });

  it("does not invent loan costs for a blank APR or nonfinite principal", () => {
    const { rerender } = render(
      <PaymentBreakdownChart activeVehicle={vehicle} dealData={{ ...dealData, interestRate: "" }} />
    );
    expect(screen.queryByRole("img")).toBeNull();
    rerender(
      <PaymentBreakdownChart
        activeVehicle={{ ...vehicle, amountToFinance: Infinity }}
        dealData={dealData}
      />
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/Enter an amount financed/)).toBeTruthy();
  });

  it("quotes zero APR only for a checked fit and excludes inactive and sample programs", () => {
    render(
      <LenderComparisonChart
        activeVehicle={vehicle}
        dealData={dealData}
        customerFilters={customerFilters}
        lenderProfiles={[
          lender,
          { ...lender, id: "sample", name: "Sample CU", isSample: true },
          { ...lender, id: "inactive", name: "Inactive CU", active: false },
        ]}
      />
    );
    expect(screen.getByText("Checked CU")).toBeTruthy();
    expect(screen.getByText("$300.00")).toBeTruthy();
    expect(screen.queryByText("Sample CU")).toBeNull();
    expect(screen.queryByText("Inactive CU")).toBeNull();
  });

  it("holds lender quotes when baseline credit inputs or financed principal are missing", () => {
    const props = { activeVehicle: vehicle, dealData, customerFilters, lenderProfiles: [lender] };
    const { rerender } = render(
      <LenderComparisonChart
        {...props}
        customerFilters={{ ...customerFilters, creditScore: null }}
      />
    );
    expect(screen.getByText("No checked lender quotes")).toBeTruthy();
    rerender(
      <LenderComparisonChart {...props} activeVehicle={{ ...vehicle, amountToFinance: 0 }} />
    );
    expect(screen.getByText("No checked lender quotes")).toBeTruthy();
    expect(screen.queryByText("$0.00")).toBeNull();
  });
});
