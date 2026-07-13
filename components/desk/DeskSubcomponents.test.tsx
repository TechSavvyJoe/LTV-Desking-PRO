/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_SETTINGS } from "../../lib/aiModelRegistry";
import type { CalculatedVehicle, DealData, LenderProfile, Settings } from "../../types";
import type { LenderFitEntry } from "../../services/lenderFit";
import BackendAddons from "./BackendAddons";
import { DealInspector } from "./DealInspector";
import { InventoryGrid } from "./InventoryGrid";
import StructureMatrix from "./StructureMatrix";

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

    fireEvent.click(screen.getByRole("button", { name: "$545" }));
    expect(onSetTermDown).toHaveBeenCalledWith(60, 0);
  });

  it("keeps top lender paths visible above the inspector tabs", () => {
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

    const fordCredit = screen.getAllByText("Ford Credit");
    expect(fordCredit.length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Add-ons" })).toBeTruthy();
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
});
