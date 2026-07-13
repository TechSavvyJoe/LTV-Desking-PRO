/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AI_SETTINGS } from "../../lib/aiModelRegistry";
import type { DealPdfData, Settings } from "../../types";
import { PdfTemplate } from "./PdfTemplate";

const settings: Settings = {
  defaultTerm: 72,
  defaultApr: 8.9,
  defaultState: "MI",
  docFee: 280,
  cvrFee: 24,
  defaultStateFees: 31,
  outOfStateTransitFee: 10,
  customTaxRate: null,
  miTradeInCreditCap: 12_000,
  vscPrice: 2_495,
  gapPrice: 895,
  ltvThresholds: { warn: 115, danger: 125, critical: 135 },
  ai: DEFAULT_AI_SETTINGS,
};

const data: DealPdfData = {
  dealNumber: 1042,
  customerName: "Taylor Morgan",
  salespersonName: "Jordan Lee",
  customerFilters: { creditScore: 680, monthlyIncome: 5_200 },
  dealData: {
    downPayment: 1_000,
    tradeInValue: 3_000,
    tradeInPayoff: 1_000,
    backendProducts: 3_890,
    loanTerm: 72,
    interestRate: 8.9,
    stateFees: 31,
    rebate: 500,
    vscAmount: 2_495,
    gapAmount: 895,
    notes: "Verify proof of income and insurance before submission.",
    buyerState: "MI",
  },
  vehicle: {
    vehicle: "2020 Ford Escape SEL",
    stock: "5101",
    vin: "1FMCU0H60LUA00001",
    modelYear: 2020,
    mileage: 71_478,
    price: 24_500,
    jdPower: 22_000,
    jdPowerRetail: 25_000,
    unitCost: 20_000,
    baseOutTheDoorPrice: 26_375,
    salesTax: 1_540,
    frontEndLtv: 111,
    frontEndGross: 4_500,
    amountToFinance: 27_765,
    otdLtv: 126,
    monthlyPayment: 498.42,
    approvalScore: 68,
    approvalBand: "moderate",
    ptiRatio: 9.6,
    fitCount: 1,
    fitNames: ["Ford Credit"],
  },
  lenderEligibility: [
    {
      name: "Ford Credit",
      eligible: true,
      reasons: [],
      matchedTier: { name: "Used Tier A", otdLtv: 135, minTerm: 48, maxTerm: 84 },
    },
    {
      name: "Lake Trust CU",
      eligible: false,
      reasons: ["OTD LTV exceeds the entered 120% program cap."],
      matchedTier: { name: "Standard used", otdLtv: 120, maxTerm: 72 },
    },
  ],
};

describe("PdfTemplate", () => {
  afterEach(cleanup);

  it("renders exactly two explicit Letter pages with complete deal detail", () => {
    const { container } = render(<PdfTemplate {...data} settings={settings} />);

    expect(container.querySelectorAll("[data-pdf-page]")).toHaveLength(2);
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    expect(screen.getAllByText("Deal #1042")).toHaveLength(2);
    expect(screen.getAllByText("Service contract").length).toBeGreaterThan(0);
    expect(screen.getByText("Ford Credit")).toBeTruthy();
    expect(screen.getByText("Lake Trust CU")).toBeTruthy();
    expect(screen.getByText("Used Tier A")).toBeTruthy();
    expect(screen.getByText(/OTD LTV exceeds/)).toBeTruthy();
    expect(screen.getByText(/Verify proof of income/)).toBeTruthy();
  });

  it("prints the out-of-state transit fee in the tax and fees subtotal", () => {
    render(
      <PdfTemplate
        {...data}
        dealData={{ ...data.dealData, buyerState: "OH" }}
        settings={settings}
      />
    );

    expect(screen.getAllByText("Out-of-state transit fee")).toHaveLength(2);
    expect(screen.getByText("$1,885.00")).toBeTruthy();
  });

  it("bounds variable lender and note content with visible continuation notices", () => {
    const lenderEligibility = Array.from({ length: 12 }, (_, index) => ({
      name: `Lender ${index + 1} with an intentionally long printable name`,
      eligible: false,
      reasons: [
        `Lender ${index + 1} requires additional verification. ${"Long rule detail ".repeat(20)}`,
      ],
      matchedTier: {
        name: `Program ${index + 1} with an intentionally long printable description`,
        otdLtv: 120,
        maxTerm: 72,
      },
    }));

    const { container } = render(
      <PdfTemplate
        {...data}
        dealData={{ ...data.dealData, notes: "Detailed deal note ".repeat(80) }}
        lenderEligibility={lenderEligibility}
        settings={settings}
      />
    );

    expect(container.querySelectorAll(".lender-table tbody tr")).toHaveLength(7);
    expect(
      screen.getByText("6 additional lender screens continue in the application.")
    ).toBeTruthy();
    expect(screen.queryByText(/Lender 7 with/)).toBeNull();
    expect(screen.getByText(/Deal notes continue in the application/)).toBeTruthy();
    expect(screen.getAllByText(/\[continued in app\]/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Final approval, rate, advance/)).toBeTruthy();
    expect(screen.getByText(/Recheck the lender.s current rate sheet/)).toBeTruthy();
  });
});
