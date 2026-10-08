/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AI_SETTINGS } from "../../lib/aiModelRegistry";
import type { DealPdfData, Settings } from "../../types";
import { INTERNAL_USE_POLICY } from "./InternalUseNotice";
import { calculateFinancials } from "../../services/calculator";
import { PdfTemplate } from "./PdfTemplate";

// Paper colors are fixed in both themes; printing never inherits dark ink.
const PAPER_TOKENS = new Set([
  "#ffffff",
  "#13283e",
  "#17344f",
  "#315a7f",
  "#465c70",
  "#c7d2dd",
  "#edf2f6",
  "#15803d",
  "#dcfce7",
  "#b45309",
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

  it("labels lenders Fit, No fit or Pending — a held check is never a decline — fits first", () => {
    const sampleReason =
      "Sample program - illustrative only; verify or convert it before using it as an approval path.";
    const mixed = {
      ...data,
      lenderEligibility: [
        {
          name: "Held Bank",
          eligible: false,
          status: "pending" as const,
          reasons: [sampleReason],
          matchedTier: null,
          uncheckedConstraints: ["sample program - verify or convert before use"],
        },
        {
          name: "Declining Bank",
          eligible: false,
          status: "ineligible" as const,
          reasons: ["Amount financed too high ($38,335 > $30,000)"],
          matchedTier: null,
          // A definite decline that also has an unchecked field is still a decline.
          uncheckedConstraints: ["monthly income for max PTI"],
        },
        {
          name: "Fitting Bank",
          eligible: true,
          status: "eligible" as const,
          reasons: [],
          matchedTier: { name: "A", maxLtv: 125, maxTerm: 84 },
        },
      ],
    };
    const { container } = render(<PdfTemplate {...mixed} settings={settings} />);

    const badges = Array.from(container.querySelectorAll(".fit-badge")).map((b) => b.textContent);
    expect(badges).toEqual(["Fit", "No fit", "Pending"]);
    expect(container.textContent).not.toMatch(/\bReview\b/);

    // The held bank's long reason is cut at a word boundary, never mid-word.
    const heldRow = Array.from(container.querySelectorAll("tr")).find((tr) =>
      tr.textContent?.includes("Held Bank")
    );
    const result = heldRow?.querySelector("td:last-child")?.textContent ?? "";
    expect(result).toMatch(/ … \[continued in app\]$/);
    const kept = result.replace(/ … \[continued in app\]$/, "");
    expect(sampleReason.startsWith(kept)).toBe(true);
    expect(sampleReason[kept.length]).toBe(" ");
  });

  it("marks both pages internal-use, quoting MODEL_CARD §10, and no longer calls itself a customer worksheet", () => {
    const { container } = render(<PdfTemplate {...data} settings={settings} />);
    const pages = Array.from(container.querySelectorAll("[data-pdf-page]"));
    expect(pages).toHaveLength(2);
    for (const page of pages) {
      const footer = page.querySelector(".page-footer")?.textContent ?? "";
      expect(footer).toContain("Internal use only.");
      expect(footer).toContain(INTERNAL_USE_POLICY);
    }
    expect(screen.getByText("Preliminary deal worksheet, not a credit offer")).toBeTruthy();
    expect(container.textContent).not.toMatch(/customer worksheet/i);
  });

  it("prints the out-of-state transit fee in the tax and fees subtotal", () => {
    render(
      <PdfTemplate
        {...data}
        dealData={{ ...data.dealData, buyerState: "OH" }}
        settings={settings}
      />
    );

    expect(screen.getAllByText("Out-of-state transit fee")).toHaveLength(1);
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

  it("never prints the approval score, band, buy rate, or dealer cost (MODEL_CARD §5)", () => {
    const { container } = render(
      <PdfTemplate
        {...data}
        vehicle={{ ...data.vehicle, unitCost: 19_876, frontEndGross: 4_321 }}
        lenderEligibility={[
          {
            name: "Ford Credit",
            eligible: true,
            reasons: [],
            matchedTier: { name: "Used Tier A", otdLtv: 135, baseInterestRate: 5.49 },
          },
        ]}
        settings={settings}
      />
    );
    const printed = Array.from(container.querySelectorAll("[data-pdf-page]"))
      .map((page) => page.textContent ?? "")
      .join("\n");

    expect(printed).toContain("Ford Credit");
    expect(printed).not.toMatch(/\b68\b/); // approvalScore
    expect(printed).not.toMatch(/moderate/i); // approvalBand
    expect(printed).not.toMatch(/approval (odds|score)/i);
    expect(printed).not.toContain("5.49"); // lender buy rate on the matched tier
    expect(printed).not.toContain("19,876"); // unitCost
    expect(printed).not.toContain("4,321"); // frontEndGross
  });

  it("keeps paper contrast and style selectors isolated from the app theme", () => {
    const { container } = render(<PdfTemplate {...data} settings={settings} />);
    const css = cssOf(container);
    expect(css).toMatch(/background: #ffffff !important; color: #13283e;/);
    expect(hexesOf(css).filter((hex) => !PAPER_TOKENS.has(hex))).toEqual([]);
    expect(unscopedSelectors(css, ".deal-pdf-page")).toEqual([]);
  });

  it("itemizes discounts, fees, products, rebate and negative equity without double counting", () => {
    const edited = {
      ...data.dealData,
      buyerState: "OH" as const,
      dealerDiscount: 1000,
      manufacturerRebate: 500,
      rebate: 9999,
      transactionFees: 125,
      tradeInPayoff: 5000,
    };
    const taxSettings = { ...settings, customTaxRate: 0 };
    const calculated = calculateFinancials(data.vehicle, edited, taxSettings);
    render(
      <PdfTemplate
        {...data}
        dealerName="Bob Maxey Ford"
        vehicle={calculated}
        dealData={edited}
        settings={taxSettings}
      />
    );
    const pricing = screen.getByRole("table", { name: "Vehicle pricing and fees" });
    const financing = screen.getByRole("table", { name: "Financing breakdown" });
    const rowValue = (table: HTMLElement, label: string) =>
      within(table).getByText(label).closest("tr")?.lastElementChild?.textContent;
    expect(screen.getAllByText("Bob Maxey Ford")).toHaveLength(2);
    expect(rowValue(pricing, "Dealer discount")).toBe("− $1,000.00");
    expect(rowValue(pricing, "Transaction fees")).toBe("+ $125.00");
    expect(rowValue(pricing, "Out-the-door price")).toBe("$23,970.00");
    expect(rowValue(financing, "Total with products")).toBe("$27,860.00");
    expect(rowValue(financing, "Negative trade equity")).toBe("+ $2,000.00");
    expect(rowValue(financing, "Manufacturer rebate")).toBe("− $500.00");
    expect(rowValue(financing, "Amount financed")).toBe("$28,360.00");
    const rows = within(financing).getAllByRole("row");
    const sum = rows
      .filter((row) => !row.className)
      .reduce((total, row) => {
        const text = row.lastElementChild?.textContent ?? "";
        const value = Number(text.replace(/[^0-9.]/g, ""));
        return total + (text.includes("−") ? -value : value);
      }, 0);
    expect(sum).toBe(calculated.amountToFinance);
  });

  it("preserves unset APR and term and shows no fabricated payment or interest", () => {
    const edited = { ...data.dealData, interestRate: "" as const, loanTerm: 0 };
    const calculated = calculateFinancials(data.vehicle, edited, settings);
    const { container } = render(
      <PdfTemplate
        {...data}
        vehicle={calculated}
        dealData={edited}
        settings={settings}
        previewPage={1}
      />
    );
    expect(container.querySelectorAll("[data-pdf-page]")).toHaveLength(1);
    expect(container.querySelector(".payment")?.textContent).toBe("— /mo");
    expect(screen.queryByText("0.00%")).toBeNull();
    expect(screen.getByText("Estimated loan interest").closest(".kv")?.textContent).toBe(
      "Estimated loan interest—"
    );
    expect(container.textContent).not.toMatch(/FICO|Gross income|Payment-to-income/);
  });
});
