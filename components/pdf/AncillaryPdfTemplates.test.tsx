/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AI_SETTINGS } from "../../lib/aiModelRegistry";
import type { DealPdfData, LenderProfile, Settings } from "../../types";
import { FavoritesPdfTemplate } from "./FavoritesPdfTemplate";
import { LenderCheatSheetTemplate } from "./LenderCheatSheetTemplate";

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

const baseDeal: DealPdfData = {
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
    notes: "Verify proof of income.",
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
  ],
};

describe("ancillary PDF templates", () => {
  afterEach(cleanup);

  it("renders the lender reference with aggregated program limits", () => {
    const profiles: LenderProfile[] = [
      {
        id: "ford-credit",
        name: "Ford Credit",
        bookValueSource: "Retail",
        minIncome: 2_500,
        maxPti: 18,
        tiers: [
          {
            name: "Tier A",
            minFico: 680,
            maxFico: 850,
            minYear: 2019,
            maxYear: 2026,
            maxMileage: 80_000,
            maxTerm: 84,
            frontEndLtv: 125,
            otdLtv: 135,
            maxBackend: 5_000,
            baseInterestRate: 6.49,
          },
          {
            name: "Tier B",
            minFico: 620,
            maxFico: 679,
            minYear: 2017,
            maxYear: 2024,
            maxMileage: 120_000,
            maxTerm: 72,
            maxLtv: 120,
            baseInterestRate: 8.25,
          },
        ],
      },
      {
        id: "empty-program",
        name: "No Published Program",
        tiers: [],
      },
    ];

    render(<LenderCheatSheetTemplate profiles={profiles} />);

    expect(screen.getByText("Lender Quick Reference")).toBeTruthy();
    expect(screen.getByText("Ford Credit")).toBeTruthy();
    expect(screen.getByText("No Published Program")).toBeTruthy();
    expect(screen.getByText("620-850")).toBeTruthy();
    expect(screen.getByText("2017-2026")).toBeTruthy();
    expect(screen.getByText("120K")).toBeTruthy();
    expect(screen.getByText("$5K")).toBeTruthy();
  });

  it("renders comparison pages for lender-fit and negative-equity deals", () => {
    const extraFits = Array.from({ length: 10 }, (_, index) => ({
      name: `Lender ${index + 1}`,
      eligible: true,
      reasons: [],
      matchedTier: { name: `Program ${index + 1}` },
    }));
    const negativeEquityDeal: DealPdfData = {
      ...baseDeal,
      dealData: {
        ...baseDeal.dealData,
        tradeInValue: 1_000,
        tradeInPayoff: 4_000,
        interestRate: "",
      },
      vehicle: {
        ...baseDeal.vehicle,
        vehicle: "2021 Honda CR-V EX",
        stock: "5104",
        vin: "2HKRW2H50MH000004",
      },
      lenderEligibility: [],
    };

    render(
      <FavoritesPdfTemplate
        deals={[{ ...baseDeal, lenderEligibility: extraFits }, negativeEquityDeal]}
        settings={settings}
      />
    );

    expect(screen.getByText("Vehicle Deal Comparison")).toBeTruthy();
    expect(screen.getByText(/2 favorited vehicles/)).toBeTruthy();
    expect(screen.getAllByText("2020 Ford Escape SEL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2021 Honda CR-V EX").length).toBeGreaterThan(0);
    expect(screen.getByText(/Negative Equity/)).toBeTruthy();
    expect(screen.getByText(/\+ 1 more possible fits/)).toBeTruthy();
    expect(screen.getByText(/No verified lender fits/)).toBeTruthy();
  });

  it("reconciles dealer discounts and manufacturer rebates without double-counting", () => {
    const deal: DealPdfData = {
      ...baseDeal,
      dealData: {
        ...baseDeal.dealData,
        rebate: 500,
        rebateType: "manufacturer",
        manufacturerRebate: 500,
        dealerDiscount: 1000,
        transactionFees: 125,
      },
    };

    render(<FavoritesPdfTemplate deals={[deal]} settings={settings} />);

    expect(screen.getByText("Dealer Discount / Rebate").closest("tr")?.textContent).toContain(
      "$1,000.00"
    );
    expect(screen.getByText("Transaction Fees").closest("tr")?.textContent).toContain("$125.00");
    expect(screen.getByText("Manufacturer Rebate").closest("tr")?.textContent).toContain("$500.00");
    expect(screen.getByText("Sub-Total").closest("tr")?.textContent).toContain("$22,875.00");
  });

  it("labels sample programs as pending rather than verified fits", () => {
    render(
      <FavoritesPdfTemplate
        deals={[
          {
            ...baseDeal,
            lenderEligibility: [
              {
                name: "Illustrative Bank",
                eligible: false,
                status: "pending",
                reasons: [
                  "Sample program - illustrative only; verify or convert it before using it as an approval path.",
                ],
                uncheckedConstraints: ["sample program - verify or convert before use"],
                matchedTier: { name: "Sample tier" },
              },
            ],
          },
        ]}
        settings={settings}
      />
    );

    expect(screen.getByText(/No verified lender fits/)).toBeTruthy();
    expect(screen.getByText(/Pending verification \(1\).*illustrative only/i)).toBeTruthy();
  });

  it("renders explicit empty states instead of failing", () => {
    const { rerender } = render(<LenderCheatSheetTemplate profiles={[]} />);
    expect(screen.getByText(/No lender profiles available/)).toBeTruthy();

    rerender(<FavoritesPdfTemplate deals={[]} settings={settings} />);
    expect(screen.getByText("No favorited vehicles to report.")).toBeTruthy();
  });
});
