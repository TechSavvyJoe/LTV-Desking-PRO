/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AI_SETTINGS } from "../../lib/aiModelRegistry";
import type { DealPdfData, LenderProfile, Settings } from "../../types";
import { FavoritesPdfTemplate } from "./FavoritesPdfTemplate";
import { INTERNAL_USE_POLICY } from "./InternalUseNotice";
import { LenderCheatSheetTemplate } from "./LenderCheatSheetTemplate";

// Light tokens from index.css that printed paper may use.
const PAPER_TOKENS = new Set([
  "#ffffff",
  "#111827",
  "#4b5563",
  "#e5e7eb",
  "#f3f4f6",
  "#eef2ff",
  "#4f46e5",
  "#15803d",
  "#dcfce7",
  "#b45309",
  "#fef3c7",
  "#b91c1c",
  "#fee2e2",
]);
const cssOf = (container: HTMLElement): string =>
  Array.from(container.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n");
const hexesOf = (css: string): string[] =>
  Array.from(new Set((css.match(/#[0-9a-f]{3,8}\b/gi) ?? []).map((hex) => hex.toLowerCase())));
// The <style> tag is live in the app document while a PDF renders off-screen,
// so every selector must stay inside the template root.
const unscopedSelectors = (css: string, root: string): string[] =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .map((block) => block.split("{")[0]?.trim() ?? "")
    .filter(Boolean)
    .flatMap((selectors) => selectors.split(",").map((selector) => selector.trim()))
    .filter((selector) => !selector.startsWith(root));
const ruleFor = (css: string, selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  return start === -1 ? "" : css.slice(start, css.indexOf("}", start));
};

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

const profile = (index: number): LenderProfile => ({
  id: `lender-${index}`,
  name: `Lender ${String(index).padStart(2, "0")}`,
  tiers: [{ name: "Tier A", minFico: 600, maxTerm: 72, otdLtv: 125 }],
});

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

    expect(screen.getByText("Lender quick reference")).toBeTruthy();
    expect(screen.getByText("Ford Credit")).toBeTruthy();
    expect(screen.getByText("No Published Program")).toBeTruthy();
    expect(screen.getByText("620–850")).toBeTruthy();
    expect(screen.getByText("2017–2026")).toBeTruthy();
    expect(screen.getByText("120K")).toBeTruthy();
    expect(screen.getByText("$5K")).toBeTruthy();
    expect(screen.getByText("Retail")).toBeTruthy();
    expect(screen.getByText(/Confidential/)).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  });

  it("continues long lender lists on further Letter-landscape pages instead of clipping", () => {
    const profiles = Array.from({ length: 40 }, (_, index) => profile(index + 1));
    const { container } = render(<LenderCheatSheetTemplate profiles={profiles} />);
    const pages = Array.from(container.querySelectorAll(".lcs-page"));

    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.querySelectorAll("tbody tr").length)).toEqual([18, 18, 4]);
    expect(screen.getByText("Page 3 of 3")).toBeTruthy();
    for (const p of profiles) expect(screen.getByText(p.name)).toBeTruthy();

    // generateLenderCheatSheetPdf captures 279.4mm and slices every 215.9mm.
    const pageRule = ruleFor(cssOf(container), ".lcs-pdf .lcs-page");
    expect(pageRule).toContain("width: 279.4mm");
    expect(pageRule).toContain("height: 215.9mm");
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

    const { container } = render(
      <FavoritesPdfTemplate
        deals={[{ ...baseDeal, lenderEligibility: extraFits }, negativeEquityDeal]}
        settings={settings}
      />
    );

    expect(screen.getByText("Vehicle deal comparison")).toBeTruthy();
    expect(screen.getByText(/2 vehicles in Compare/)).toBeTruthy();
    expect(screen.getAllByText("2020 Ford Escape SEL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2021 Honda CR-V EX").length).toBeGreaterThan(0);
    expect(screen.getByText(/Negative equity/)).toBeTruthy();
    expect(screen.getByText(/\+ 1 more possible fits/)).toBeTruthy();
    expect(screen.getByText(/No verified lender fits/)).toBeTruthy();
    expect(container.querySelectorAll(".fav-page")).toHaveLength(3);
    expect(screen.getByText("Page 3 of 3")).toBeTruthy();
    // Deal-level notes print once, on the cover.
    expect(screen.getAllByText(/Verify proof of income/)).toHaveLength(1);
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

    expect(screen.getByText("Dealer discount / rebate").closest("tr")?.textContent).toContain(
      "$1,000.00"
    );
    expect(screen.getByText("Transaction fees").closest("tr")?.textContent).toContain("$125.00");
    expect(screen.getByText("Manufacturer rebate").closest("tr")?.textContent).toContain("$500.00");
    expect(screen.getByText("Subtotal").closest("tr")?.textContent).toContain("$22,875.00");
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
    // The cover never presents an unchecked lender as a decline (MODEL_CARD §5).
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.queryByText("✗ No fit")).toBeNull();
  });

  it("caps the cover list so it fits one Letter page; every vehicle keeps its own page", () => {
    const deals = Array.from({ length: 14 }, (_, index) => ({
      ...baseDeal,
      vehicle: {
        ...baseDeal.vehicle,
        vehicle: `Vehicle number ${index + 1}`,
        vin: `VIN${String(index).padStart(14, "0")}`,
      },
    }));
    const { container } = render(<FavoritesPdfTemplate deals={deals} settings={settings} />);

    expect(container.querySelectorAll(".overview-table tbody tr")).toHaveLength(13);
    expect(screen.getByText("2 more vehicles continue on the following pages.")).toBeTruthy();
    expect(container.querySelectorAll(".fav-page")).toHaveLength(15);
    expect(screen.getAllByText("Vehicle number 14")).toHaveLength(1);
  });

  it("never prints the approval score, band, buy rate, or dealer cost on printed paper", () => {
    const deal: DealPdfData = {
      ...baseDeal,
      vehicle: { ...baseDeal.vehicle, unitCost: 19_876, frontEndGross: 4_321 },
      // A fitting lender whose matched tier carries the confidential buy rate
      // and rate adder — the template receives them and must not print them.
      lenderEligibility: [
        {
          name: "Rate Bank",
          eligible: true,
          status: "eligible",
          reasons: [],
          matchedTier: {
            name: "A",
            maxLtv: 125,
            maxTerm: 84,
            baseInterestRate: 6.37,
            rateAdder: 1.73,
          },
        },
      ],
    };
    const { container } = render(<FavoritesPdfTemplate deals={[deal]} settings={settings} />);
    const printed = Array.from(container.querySelectorAll(".fav-page"))
      .map((page) => page.textContent ?? "")
      .join("\n");

    expect(printed).toContain("2020 Ford Escape SEL");
    expect(printed).not.toMatch(/\b68\b/); // approvalScore
    expect(printed).not.toMatch(/moderate/i); // approvalBand
    expect(printed).not.toMatch(/approval (odds|score)/i);
    expect(printed).not.toContain("19,876"); // unitCost
    expect(printed).not.toContain("4,321"); // frontEndGross
    expect(printed).toContain("Rate Bank"); // the lender itself does print
    expect(printed).not.toContain("6.37"); // buy rate (matchedTier.baseInterestRate)
    expect(printed).not.toContain("1.73"); // rate adder
  });

  it("marks every Compare page internal-use, quoting MODEL_CARD §10", () => {
    const { container } = render(
      <FavoritesPdfTemplate deals={[baseDeal, baseDeal]} settings={settings} />
    );
    const pages = Array.from(container.querySelectorAll(".fav-page"));
    expect(pages).toHaveLength(3); // cover + one page per vehicle
    for (const page of pages) {
      const footer = page.querySelector(".page-footer")?.textContent ?? "";
      expect(footer).toContain("Internal use only.");
      expect(footer).toContain(INTERNAL_USE_POLICY);
    }
  });

  it("keeps both templates on Letter paper, the light tokens, and scoped CSS", () => {
    const favorites = render(<FavoritesPdfTemplate deals={[baseDeal]} settings={settings} />);
    const favoritesCss = cssOf(favorites.container);
    const favoritesPage = ruleFor(favoritesCss, ".fav-pdf .fav-page");

    // generateFavoritesPdf slices the stack every 279.4mm; A4 pages drifted.
    expect(favoritesPage).toContain("width: 215.9mm");
    expect(favoritesPage).toContain("height: 279.4mm");
    expect(hexesOf(favoritesCss).filter((hex) => !PAPER_TOKENS.has(hex))).toEqual([]);
    expect(unscopedSelectors(favoritesCss, ".fav-pdf")).toEqual([]);
    expect(favoritesCss).toMatch(/\.mark\s*\{[^}]*background:\s*#4f46e5;[^}]*color:\s*#ffffff;/);
    favorites.unmount();

    const cheatSheet = render(<LenderCheatSheetTemplate profiles={[profile(1)]} />);
    const cheatSheetCss = cssOf(cheatSheet.container);

    expect(hexesOf(cheatSheetCss).filter((hex) => !PAPER_TOKENS.has(hex))).toEqual([]);
    expect(unscopedSelectors(cheatSheetCss, ".lcs-pdf")).toEqual([]);
    // No render-time network font fetch.
    expect(cheatSheetCss).not.toMatch(/@import|fonts\.googleapis/);
  });

  it("renders explicit empty states instead of failing", () => {
    const { rerender } = render(<LenderCheatSheetTemplate profiles={[]} />);
    expect(screen.getByText(/No lender profiles available/)).toBeTruthy();

    rerender(<FavoritesPdfTemplate deals={[]} settings={settings} />);
    expect(screen.getByText("No vehicles in Compare.")).toBeTruthy();
  });
});
