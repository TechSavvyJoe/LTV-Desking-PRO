/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_SETTINGS } from "../../lib/aiModelRegistry";
import { splitPay } from "../../utils/format";
import { calculateFinancials } from "../../services/calculator";
import type { CalculatedVehicle, DealData, FilterData, LenderProfile, Settings } from "../../types";
import type { LenderFitEntry } from "../../services/lenderFit";
import { ApprovalGauge } from "../common/ApprovalGauge";
import BackendAddons from "./BackendAddons";
import { DealInspector } from "./DealInspector";
import InspectorSummary from "./InspectorSummary";
import { InventoryGrid } from "./InventoryGrid";
import LenderLadder from "./LenderLadder";
import StructureMatrix from "./StructureMatrix";
import { DeskTermsRail } from "./DeskTermsRail";

const settings: Settings = {
  defaultTerm: 72,
  defaultApr: 8.9,
  defaultState: "MI",
  docFee: 280,
  cvrFee: 24,
  defaultStateFees: 31,
  outOfStateTransitFee: 10,
  customTaxRate: null,
  miTradeInCreditCap: 12000,
  vscPrice: 2495,
  gapPrice: 895,
  ltvThresholds: { warn: 115, danger: 125, critical: 135 },
  ai: DEFAULT_AI_SETTINGS,
};

const dealData: DealData = {
  downPayment: 1000,
  tradeInValue: 0,
  tradeInPayoff: 0,
  backendProducts: 3390,
  loanTerm: 72,
  interestRate: 8.9,
  stateFees: 31,
  notes: "",
  vscAmount: 2495,
  gapAmount: 895,
};

const vehicle: CalculatedVehicle = {
  vehicle: "2020 Ford Escape SEL",
  stock: "5101",
  vin: "1FMCU0H60LUA00001",
  modelYear: 2020,
  mileage: 71478,
  price: 24500,
  jdPower: 22000,
  jdPowerRetail: 25000,
  unitCost: 20000,
  baseOutTheDoorPrice: 26323,
  make: "Ford",
  model: "Escape",
  trim: "SEL",
  salesTax: 1540,
  frontEndLtv: 111,
  frontEndGross: 4500,
  amountToFinance: 26323,
  otdLtv: 120,
  monthlyPayment: 473.19,
  approvalScore: 68,
  approvalBand: "moderate",
  ptiRatio: 9.1,
  fitCount: 2,
  fitNames: ["Ford Credit", "Lake Trust CU"],
};

const lenderProfiles: LenderProfile[] = [
  {
    id: "ford",
    name: "Ford Credit",
    tiers: [{ name: "Prime", maxLtv: 135, maxTerm: 72 }],
  },
  {
    id: "lake",
    name: "Lake Trust CU",
    tiers: [{ name: "A", maxLtv: 125, maxTerm: 84 }],
  },
];

const entries: LenderFitEntry[] = [
  {
    lenderId: "ford",
    name: "Ford Credit",
    eligible: true,
    reasons: [],
    matchedTier: lenderProfiles[0]?.tiers[0] ?? null,
  },
  {
    lenderId: "lake",
    name: "Lake Trust CU",
    eligible: true,
    reasons: [],
    matchedTier: lenderProfiles[1]?.tiers[0] ?? null,
  },
];

describe("desk subcomponents", () => {
  it("lender ladder chips keep fit, pending and declined distinct", () => {
    // A held check must never read as a decline (and vice versa) — the
    // pending band exists precisely to separate "not checked" from "no".
    const mixed: LenderFitEntry[] = [
      { lenderId: "fit", name: "Fits Bank", eligible: true, reasons: [], matchedTier: null },
      {
        lenderId: "hold",
        name: "Held Bank",
        eligible: false,
        status: "pending",
        reasons: [],
        matchedTier: null,
        uncheckedConstraints: ["credit score"],
      },
      {
        lenderId: "decl",
        name: "Declined Bank",
        eligible: false,
        status: "ineligible",
        reasons: ["FICO below minimum"],
        matchedTier: null,
      },
    ];
    const { container } = render(
      <LenderLadder
        entries={mixed}
        fitNames={["Fits Bank"]}
        profilesById={new Map()}
        fitCount={1}
        totalLenders={3}
        pendingCount={1}
      />
    );
    const chips = Array.from(container.querySelectorAll(".desk-lender-badge")).map((el) => ({
      text: el.textContent,
      status: el.getAttribute("data-status"),
    }));
    expect(chips).toEqual([
      { text: "Fit", status: "eligible" },
      { text: "Pending", status: "pending" },
      { text: "No fit", status: "ineligible" },
    ]);
  });

  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("edits back-end add-on line items while preserving a visible calculator total", () => {
    const onToggleVsc = vi.fn();
    const onVscAmountChange = vi.fn();

    render(
      <BackendAddons
        vscAmount={2495}
        gapAmount={895}
        otherBackend={250}
        defaultVsc={2495}
        defaultGap={895}
        onToggleVsc={onToggleVsc}
        onToggleGap={vi.fn()}
        onVscAmountChange={onVscAmountChange}
        onGapAmountChange={vi.fn()}
        onOtherBackendChange={vi.fn()}
      />
    );

    expect(screen.getAllByText("$3,640")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /service contract/i }));
    fireEvent.change(screen.getByLabelText(/service contract amount/i), {
      target: { value: "$3,100" },
    });

    expect(onToggleVsc).toHaveBeenCalledTimes(1);
    expect(onVscAmountChange).toHaveBeenCalledWith(3100);
  });

  it("reprices from the structure matrix by term and down payment", () => {
    const onSetTermDown = vi.fn();

    render(
      <StructureMatrix
        grid={[
          { term: 60, cells: [{ down: 0, pay: 545 }] },
          { term: 72, cells: [{ down: 0, pay: 473 }] },
        ]}
        loanTerm={72}
        downPayment={0}
        onSetTermDown={onSetTermDown}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "60 months, $0 down, $545 estimated payment" })
    );
    expect(onSetTermDown).toHaveBeenCalledWith(60, 0);
  });

  it("keeps lender details reachable without squeezing the tab panel", () => {
    render(
      <DealInspector
        vehicle={vehicle}
        entries={entries}
        profilesById={new Map(lenderProfiles.map((profile) => [profile.id, profile]))}
        totalLenders={2}
        dealData={dealData}
        settings={settings}
        pinned={false}
        onPin={vi.fn()}
        onSetTermDown={vi.fn()}
        compactMode={false}
        compactOpen={false}
        onCloseCompact={vi.fn()}
        vscAmount={2495}
        gapAmount={895}
        otherBackend={0}
        onToggleVsc={vi.fn()}
        onToggleGap={vi.fn()}
        onVscAmountChange={vi.fn()}
        onGapAmountChange={vi.fn()}
        onOtherBackendChange={vi.fn()}
        onDealSheet={vi.fn()}
        onSaveDeal={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Lenders" }));
    const fordCredit = screen.getAllByText("Ford Credit");
    expect(fordCredit.length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Add-ons" })).toBeTruthy();
  });

  it("separates dealer discounts from tax and adds negative equity without a double minus", () => {
    const structure = {
      ...dealData,
      dealerDiscount: 2000,
      manufacturerRebate: 1000,
      tradeInValue: 5000,
      tradeInPayoff: 10000,
    };
    const zeroTaxSettings = { ...settings, customTaxRate: 0 };
    render(
      <DealInspector
        vehicle={calculateFinancials(vehicle, structure, zeroTaxSettings)}
        entries={entries}
        profilesById={new Map()}
        totalLenders={2}
        dealData={structure}
        settings={zeroTaxSettings}
        pinned={false}
        onPin={vi.fn()}
        onSetTermDown={vi.fn()}
        compactMode={false}
        compactOpen={false}
        onCloseCompact={vi.fn()}
        vscAmount={2495}
        gapAmount={895}
        otherBackend={0}
        onToggleVsc={vi.fn()}
        onToggleGap={vi.fn()}
        onVscAmountChange={vi.fn()}
        onGapAmountChange={vi.fn()}
        onOtherBackendChange={vi.fn()}
        onDealSheet={vi.fn()}
        onSaveDeal={vi.fn()}
      />
    );
    const breakdown = screen.getByText("Selling price").closest("section")!;
    expect(within(breakdown).getByText("$22,500")).toBeTruthy();
    expect(within(breakdown).getByText("$335")).toBeTruthy();
    expect(within(breakdown).getByText("+$3,000")).toBeTruthy();
    expect(breakdown.textContent).not.toContain("--$");
  });

  it("makes the inspector tab panel keyboard-focusable so its scroll region is reachable", () => {
    render(
      <DealInspector
        vehicle={vehicle}
        entries={entries}
        profilesById={new Map(lenderProfiles.map((profile) => [profile.id, profile]))}
        totalLenders={2}
        dealData={dealData}
        settings={settings}
        pinned={false}
        onPin={vi.fn()}
        onSetTermDown={vi.fn()}
        compactMode={false}
        compactOpen={false}
        onCloseCompact={vi.fn()}
        vscAmount={2495}
        gapAmount={895}
        otherBackend={0}
        onToggleVsc={vi.fn()}
        onToggleGap={vi.fn()}
        onVscAmountChange={vi.fn()}
        onGapAmountChange={vi.fn()}
        onOtherBackendChange={vi.fn()}
        onDealSheet={vi.fn()}
        onSaveDeal={vi.fn()}
      />
    );

    expect(screen.getByRole("tabpanel").tabIndex).toBe(0);
  });

  it("shows the model-card disclaimer under the approval-odds gauge, described via aria-describedby", () => {
    render(
      <DealInspector
        vehicle={vehicle}
        entries={entries}
        profilesById={new Map(lenderProfiles.map((profile) => [profile.id, profile]))}
        totalLenders={2}
        dealData={dealData}
        settings={settings}
        pinned={false}
        onPin={vi.fn()}
        onSetTermDown={vi.fn()}
        compactMode={false}
        compactOpen={false}
        onCloseCompact={vi.fn()}
        vscAmount={2495}
        gapAmount={895}
        otherBackend={0}
        onToggleVsc={vi.fn()}
        onToggleGap={vi.fn()}
        onVscAmountChange={vi.fn()}
        onGapAmountChange={vi.fn()}
        onOtherBackendChange={vi.fn()}
        onDealSheet={vi.fn()}
        onSaveDeal={vi.fn()}
      />
    );

    const disclaimer = screen.getByText(
      /Readiness counts passed checks\. Estimates require confirmed inputs and a lender decision\./
    );
    expect(disclaimer).toBeTruthy();
    // The describedby must land on the gauge's own role="img" svg (its
    // accessible name), not an unnamed wrapper a screen reader would skip.
    // [ship-gate SHOULD-FIX #7]
    const describedElement = document.querySelector(`[aria-describedby="${disclaimer.id}"]`);
    expect(describedElement).toBeTruthy();
    expect(describedElement?.getAttribute("role")).toBe("img");
  });

  it("ApprovalGauge indeterminate: no value arc, '—' numeral, pending accessible name", () => {
    const { container, rerender } = render(
      <ApprovalGauge
        score={45}
        colorVar="var(--color-text-subtle)"
        label="Pending lender checks"
        indeterminate
      />
    );
    const gauge = screen.getByRole("img");
    expect(gauge.getAttribute("aria-label")).toBe("Structure index pending, Pending lender checks");
    expect(container.querySelector("[data-gauge-value]")).toBeNull();
    expect(gauge.textContent).toBe("—");

    rerender(<ApprovalGauge score={45} colorVar="var(--color-danger)" label="No lender fit" />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Structure index 45 of 100, No lender fit"
    );
    expect(container.querySelector("[data-gauge-value]")).toBeTruthy();
    expect(screen.getByRole("img").textContent).toBe("45");
  });

  it("DealInspector shows a pending (unknown) summary instead of a red no-fit verdict", () => {
    const pendingVehicle: CalculatedVehicle = {
      ...vehicle,
      approvalScore: 45,
      approvalBand: "pending",
      fitCount: 0,
      pendingCount: 2,
      pendingCause: "fico",
      fitNames: [],
    };
    const pendingEntries: LenderFitEntry[] = entries.map((entry) => ({
      ...entry,
      eligible: false,
      status: "pending",
      uncheckedConstraints: ["credit score"],
    }));
    const { container } = render(
      <DealInspector
        vehicle={pendingVehicle}
        entries={pendingEntries}
        profilesById={new Map(lenderProfiles.map((profile) => [profile.id, profile]))}
        totalLenders={2}
        dealData={dealData}
        settings={settings}
        pinned={false}
        onPin={vi.fn()}
        onSetTermDown={vi.fn()}
        compactMode={false}
        compactOpen={false}
        onCloseCompact={vi.fn()}
        vscAmount={2495}
        gapAmount={895}
        otherBackend={0}
        onToggleVsc={vi.fn()}
        onToggleGap={vi.fn()}
        onVscAmountChange={vi.fn()}
        onGapAmountChange={vi.fn()}
        onOtherBackendChange={vi.fn()}
        onDealSheet={vi.fn()}
        onSaveDeal={vi.fn()}
      />
    );

    const gauge = screen.getByRole("img", { name: /Deal readiness/ });
    expect(gauge.getAttribute("aria-label")).toBe("Deal readiness pending, Not assessed");
    expect(gauge.textContent).toBe("—");
    const label = container.querySelector(".desk-score-label") as HTMLElement;
    expect(label.textContent).toBe("Not assessed");
    expect(label.style.color).toBe("var(--color-text-muted)");
    expect(screen.queryByText("No lender fit")).toBeNull();

    const caption = container.querySelector(".desk-score-cell .desk-fit-caption") as HTMLElement;
    expect(caption.textContent).toBe("0 fit, 2 pending");
    // The unblock hint is visible text, not a hover-only title [PR #25 review].
    expect(caption.getAttribute("title")).toBeNull();
    const reason = container.querySelector(".desk-score-cell .desk-pending-reason");
    expect(reason?.textContent).toBe("Add a FICO score to check 2 lenders");
  });

  it("InspectorSummary keeps the X/Y fit caption (and its color) when not pending", () => {
    const { container } = render(
      <InspectorSummary
        score={45}
        bandLabel="No lender fit"
        gaugeColor="var(--color-danger)"
        pay={null}
        loanTerm={72}
        apr="8.9%"
        fitCount={0}
        totalLenders={13}
        financed={null}
        backendProducts={0}
        otdLtv={120}
        pti={undefined}
        thresholds={settings.ltvThresholds}
      />
    );
    const caption = container.querySelector(".desk-score-cell .desk-fit-caption") as HTMLElement;
    expect(caption.textContent).toBe("0/13 lenders fit");
    expect((caption.querySelector("strong") as HTMLElement).style.color).toBe(
      "var(--color-danger)"
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Deal readiness 45 of 100, No lender fit"
    );
  });

  it("InventoryGrid exposes table/cell ARIA semantics for virtualized rows", () => {
    const { container } = render(
      <InventoryGrid
        rows={[vehicle]}
        inventoryCount={1}
        focusedVin={vehicle.vin}
        thresholds={settings.ltvThresholds}
        searchQuery=""
        sortKey="approvalScore"
        sortDirection="desc"
        onSearchChange={vi.fn()}
        onSort={vi.fn()}
        onFocus={vi.fn()}
        onOpenInspector={vi.fn()}
        onLoadSampleData={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );

    const table = screen.getByRole("table", { name: "Ranked inventory table" });
    expect(table.getAttribute("aria-rowcount")).toBe("2");
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(0);
    expect(container.querySelector('[role="rowgroup"]')).toBeTruthy();
    // Header is always present; body cells depend on the virtualizer scrollport
    // (often 0-height in jsdom), so assert markup roles rather than getByRole("cell").
    expect(container.querySelector('[role="row"][aria-rowindex="1"]')).toBeTruthy();
  });

  it("InventoryGrid renders its empty state outside the table element", () => {
    render(
      <InventoryGrid
        rows={[]}
        inventoryCount={0}
        focusedVin={null}
        thresholds={settings.ltvThresholds}
        searchQuery=""
        sortKey="approvalScore"
        sortDirection="desc"
        onSearchChange={vi.fn()}
        onSort={vi.fn()}
        onFocus={vi.fn()}
        onOpenInspector={vi.fn()}
        onLoadSampleData={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );

    const table = screen.getByRole("table", { name: "Ranked inventory table" });
    expect(table.contains(screen.getByText("No inventory yet"))).toBe(false);
  });

  it("StructureMatrix handles empty grid without crash (edge)", () => {
    const on = vi.fn();
    const { container } = render(
      <StructureMatrix grid={[]} loanTerm={60} downPayment={0} onSetTermDown={on} />
    );
    expect(container).toBeTruthy();
  });

  it("BackendAddons renders zero amounts and toggles", () => {
    render(
      <BackendAddons
        vscAmount={0}
        gapAmount={0}
        otherBackend={0}
        defaultVsc={0}
        defaultGap={0}
        onToggleVsc={vi.fn()}
        onToggleGap={vi.fn()}
        onVscAmountChange={vi.fn()}
        onGapAmountChange={vi.fn()}
        onOtherBackendChange={vi.fn()}
      />
    );
    expect(screen.getAllByText("$0").length).toBeGreaterThan(0);
  });

  it("keeps the buyer-state hint out of the grid cell so it doesn't stretch the state select", () => {
    const filters: FilterData = {
      creditScore: null,
      monthlyIncome: null,
      monthlyDebt: null,
      vehicle: "",
      maxPrice: null,
      maxPayment: null,
      maxMiles: null,
      maxOtdLtv: null,
      vin: "",
      minScore: null,
    };

    const { container } = render(
      <DeskTermsRail
        customerName=""
        setCustomerName={vi.fn()}
        filters={filters}
        setFilter={vi.fn()}
        dealData={dealData}
        setDeal={vi.fn()}
        buyerState="MI"
        aprText="8.9"
        onAprChange={vi.fn()}
        buyRate={null}
        applyBuyRate={vi.fn()}
        advancedOpen={true}
        onToggleAdvanced={vi.fn()}
        onReset={vi.fn()}
        onClearFilters={vi.fn()}
        onScanIncome={vi.fn()}
      />
    );

    const hint = container.querySelector(".desk-field-hint");
    expect(hint).toBeTruthy();
    expect(hint?.closest(".desk-field")).toBeNull();

    const advanced = container.querySelector(".desk-terms-advanced");
    expect(advanced).toBeTruthy();
    const fields = advanced?.querySelectorAll(".desk-field") ?? [];
    const lastField = fields[fields.length - 1];
    expect(lastField).toBeTruthy();
    // The hint must appear after every .desk-field cell in the advanced grid,
    // i.e. it is not nested inside one and doesn't precede the grid's fields.
    expect(
      Boolean(
        lastField &&
        hint &&
        lastField.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
  });
});

const emptyFilters: FilterData = {
  creditScore: null,
  monthlyIncome: null,
  monthlyDebt: null,
  vehicle: "",
  maxPrice: null,
  maxPayment: null,
  maxMiles: null,
  maxOtdLtv: null,
  vin: "",
  minScore: null,
};

const renderTermsRail = (
  advancedOpen = false,
  overrides: Partial<React.ComponentProps<typeof DeskTermsRail>> = {}
) =>
  render(
    <DeskTermsRail
      customerName=""
      setCustomerName={vi.fn()}
      filters={emptyFilters}
      setFilter={vi.fn()}
      dealData={dealData}
      setDeal={vi.fn()}
      buyerState="MI"
      aprText="8.9"
      onAprChange={vi.fn()}
      buyRate={null}
      applyBuyRate={vi.fn()}
      advancedOpen={advancedOpen}
      onToggleAdvanced={vi.fn()}
      onReset={vi.fn()}
      onClearFilters={vi.fn()}
      onScanIncome={vi.fn()}
      {...overrides}
    />
  );

const renderInspector = (overrides: Partial<React.ComponentProps<typeof DealInspector>> = {}) =>
  render(
    <DealInspector
      vehicle={vehicle}
      entries={entries}
      profilesById={new Map(lenderProfiles.map((profile) => [profile.id, profile]))}
      totalLenders={2}
      dealData={dealData}
      settings={settings}
      pinned={false}
      onPin={vi.fn()}
      onSetTermDown={vi.fn()}
      compactMode={false}
      compactOpen={false}
      onCloseCompact={vi.fn()}
      vscAmount={2495}
      gapAmount={895}
      otherBackend={0}
      onToggleVsc={vi.fn()}
      onToggleGap={vi.fn()}
      onVscAmountChange={vi.fn()}
      onGapAmountChange={vi.fn()}
      onOtherBackendChange={vi.fn()}
      onDealSheet={vi.fn()}
      onSaveDeal={vi.fn()}
      {...overrides}
    />
  );

describe("desk reading order", () => {
  afterEach(() => {
    cleanup();
  });

  it("term buttons say their unit and which one is selected", () => {
    const setDeal = vi.fn();
    render(
      <DeskTermsRail
        customerName=""
        setCustomerName={vi.fn()}
        filters={emptyFilters}
        setFilter={vi.fn()}
        dealData={dealData}
        setDeal={setDeal}
        buyerState="MI"
        aprText="8.9"
        onAprChange={vi.fn()}
        buyRate={null}
        applyBuyRate={vi.fn()}
        advancedOpen={false}
        onToggleAdvanced={vi.fn()}
        onReset={vi.fn()}
        onClearFilters={vi.fn()}
        onScanIncome={vi.fn()}
      />
    );
    const group = screen.getByRole("group", { name: "Term" });
    const terms = within(group).getAllByRole("button");
    expect(terms.length).toBeGreaterThan(1);
    for (const button of terms) {
      const months = button.textContent;
      expect(button.getAttribute("aria-label")).toBe(`${months} months`);
      expect(button.getAttribute("aria-pressed")).toBe(months === "72" ? "true" : "false");
    }
    const selected = within(group).getByRole("button", { name: "72 months", pressed: true });
    expect(selected.textContent).toBe("72");
    const other = terms.find((button) => button.textContent !== "72") as HTMLElement;
    fireEvent.click(other);
    expect(setDeal).toHaveBeenCalledWith({ loanTerm: Number(other.textContent) });
  });

  it("deal terms is a heading; the numeral, filters toggle and reset read plainly", () => {
    const { container, unmount } = renderTermsRail(false);
    expect(screen.getByRole("heading", { level: 2, name: "Deal terms" })).toBeTruthy();
    expect(container.querySelector(".desk-section-title > span")?.getAttribute("aria-hidden")).toBe(
      "true"
    );

    const filters = screen.getByRole("button", { name: "More filters" });
    expect(filters.getAttribute("aria-expanded")).toBe("false");
    expect(filters.hasAttribute("aria-controls")).toBe(false);
    expect(screen.getByRole("button", { name: "Reset deal" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^reset$/i })).toBeNull();

    // Units are part of the field names.
    expect(screen.getByLabelText("Down ($)").id).toBe("desk-down");
    expect(screen.getByLabelText("Interest rate (%)").id).toBe("desk-apr");
    unmount();

    renderTermsRail(true);
    const open = screen.getByRole("button", { name: "More filters" });
    expect(open.getAttribute("aria-expanded")).toBe("true");
    const controlled = document.getElementById(open.getAttribute("aria-controls") ?? "");
    expect(controlled?.classList.contains("desk-terms-advanced")).toBe(true);
    expect(screen.queryByRole("button", { name: /hide filters/i })).toBeNull();
  });

  it("the inspector is a named landmark with an h2, the vehicle as h3 and a quiet numeral", () => {
    const { container } = renderInspector();
    const inspector = screen.getByRole("complementary", { name: "Deal inspector" });
    expect(
      within(inspector).getByRole("heading", { level: 2, name: "Deal inspector" })
    ).toBeTruthy();
    expect(
      within(inspector).getByRole("heading", { level: 3, name: "2020 Ford Escape SEL" })
    ).toBeTruthy();

    const kicker = container.querySelector(".desk-inspector-kicker") as HTMLElement;
    expect(kicker.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(kicker.firstElementChild?.textContent).toBe("03");
    expect(kicker.textContent).toContain("STK 5101");
  });

  it("the inspector does not repeat an STK prefix the stock number already has", () => {
    const { container } = renderInspector({ vehicle: { ...vehicle, stock: "STK1034" } });
    const kicker = container.querySelector(".desk-inspector-kicker") as HTMLElement;
    expect(kicker.textContent).toContain("STK1034");
    expect(kicker.textContent).not.toContain("STK STK");
  });

  it("the drawer inspector is a dialog named Deal inspector", () => {
    renderInspector({ compactMode: true, compactOpen: true });
    const dialog = screen.getByRole("dialog", { name: "Deal inspector" });
    // ARIA in HTML forbids role="dialog" on <aside>; the drawer is a <div>.
    expect(dialog.tagName).toBe("DIV");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("Compare keeps one name and exposes its state as pressed", () => {
    const onPin = vi.fn();
    const { unmount } = renderInspector({ onPin });
    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(compare);
    expect(onPin).toHaveBeenCalledTimes(1);
    unmount();

    renderInspector({ pinned: true });
    const pinned = screen.getByRole("button", { name: "Compare", pressed: true });
    expect(pinned.textContent).toBe("Compare");
    expect(screen.queryByRole("button", { name: "Comparing" })).toBeNull();
  });

  it("the payment reads as one amount per month and the band label is not read twice", () => {
    const pay = splitPay(743.04);
    const { container } = render(
      <InspectorSummary
        score={68}
        bandLabel="Moderate"
        gaugeColor="var(--color-warning)"
        pay={pay}
        loanTerm={72}
        apr="8.9%"
        fitCount={2}
        totalLenders={2}
        financed={26323}
        backendProducts={3390}
        otdLtv={120}
        pti={9.1}
        thresholds={settings.ltvThresholds}
      />
    );
    const value = container.querySelector(".desk-payment-value") as HTMLElement;
    expect(value.querySelector(".sr-only")?.textContent).toBe("$743.04 per month");
    const visible = Array.from(value.children).filter((el) => !el.classList.contains("sr-only"));
    expect(visible.length).toBe(2);
    for (const el of visible) expect(el.getAttribute("aria-hidden")).toBe("true");

    // The gauge's name already ends with the band label.
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Deal readiness 68 of 100, Moderate"
    );
    expect(container.querySelector(".desk-score-label")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("group", { name: "Deal structure metrics" })).toBeTruthy();
  });

  it("lender paths and ladder rows are lists with spoken limits", () => {
    const { container } = render(
      <LenderLadder
        entries={[
          ...entries,
          {
            lenderId: "bare",
            name: "Bare Bank",
            eligible: true,
            reasons: [],
            matchedTier: null,
          },
        ]}
        fitNames={["Ford Credit", "Lake Trust CU"]}
        profilesById={
          new Map<string, LenderProfile>([
            ...lenderProfiles.map((profile) => [profile.id, profile] as [string, LenderProfile]),
            ["bare", { id: "bare", name: "Bare Bank", tiers: [] }],
          ])
        }
        fitCount={3}
        totalLenders={3}
        pendingCount={0}
      />
    );

    const paths = screen.getByRole("list", { name: "Lenders that fit" });
    expect(
      within(paths)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["Ford Credit", "Lake Trust CU"]);
    // Each item is a shrinkable flex box, so the pill keeps its ellipsis.
    for (const item of within(paths).getAllByRole("listitem")) {
      expect(item.className).toContain("flex");
      expect(item.className).toContain("min-w-0");
    }

    const ladder = container.querySelector(".desk-lender-list") as HTMLElement;
    expect(ladder.tagName).toBe("UL");
    const rows = within(ladder).getAllByRole("listitem");
    expect(rows.length).toBe(3);

    const fordMeta = rows[0]?.querySelector(".desk-lender-meta") as HTMLElement;
    expect(fordMeta.textContent).toBe("max LTV 135% max term 72 mo");
    const srOnly = Array.from(fordMeta.querySelectorAll(".sr-only")).map((el) => el.textContent);
    expect(srOnly).toEqual(["max LTV ", "max term "]);

    // No limits at all: a visual dash, "none listed" to a screen reader.
    const bareMeta = rows[2]?.querySelector(".desk-lender-meta") as HTMLElement;
    expect(bareMeta.querySelector('[aria-hidden="true"]')?.textContent).toBe("—");
    expect(bareMeta.querySelector(".sr-only")?.textContent).toBe("limits none listed");
  });
});

describe("DeskTermsRail unit condition confirmation", () => {
  afterEach(cleanup);
  it("confirms only the selected VIN and shows its independent value on the next unit", () => {
    const setDeal = vi.fn();
    const { unmount } = renderTermsRail(true, {
      selectedVehicle: { vin: "VIN-A", condition: "new" },
      setDeal,
      dealData: { ...dealData, vehicleConditions: { "VIN-B": "used" } },
    });
    const condition = screen.getByLabelText("Vehicle condition") as HTMLSelectElement;
    expect(condition.value).toBe("new");
    fireEvent.change(condition, { target: { value: "certified" } });
    expect(setDeal).toHaveBeenCalledWith({
      vehicleConditions: { "VIN-A": "certified", "VIN-B": "used" },
    });
    unmount();
    renderTermsRail(true, { selectedVehicle: { vin: "VIN-B", condition: "used" }, setDeal });
    expect((screen.getByLabelText("Vehicle condition") as HTMLSelectElement).value).toBe("used");
  });
  it("does not allow a condition confirmation without a selected unit", () => {
    renderTermsRail(true);
    expect((screen.getByLabelText("Vehicle condition") as HTMLSelectElement).disabled).toBe(true);
  });
});
