/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DealAssessment } from "../../services/dealAssessment";
import type { CalculatedVehicle, LenderProfile } from "../../types";
import { INITIAL_DEAL_DATA, INITIAL_FILTER_DATA } from "../../constants";

const mocks = vi.hoisted(() => ({
  inventory: [] as CalculatedVehicle[],
  lenders: [] as LenderProfile[],
}));

vi.mock("../../context/DealContext", () => ({
  useDealContext: () => ({
    settings: { ltvThresholds: { warn: 115, danger: 125, critical: 135 } },
    processedInventory: mocks.inventory,
    safeLenderProfiles: mocks.lenders,
    savedDeals: [],
    unitsPerLender: {},
    dealData: INITIAL_DEAL_DATA,
    filters: { ...INITIAL_FILTER_DATA, creditScore: 720, monthlyIncome: 6500, monthlyDebt: 500 },
  }),
}));

import ReportsScreen from "./ReportsScreen";

const unit = (
  vin: string,
  approvalScore: number,
  over: Partial<CalculatedVehicle> = {}
): CalculatedVehicle => ({
  vehicle: `2021 Ford Escape ${vin}`,
  stock: vin,
  vin,
  modelYear: 2021,
  mileage: 30000,
  price: 20000,
  jdPower: 19000,
  jdPowerRetail: 21000,
  unitCost: 17000,
  baseOutTheDoorPrice: 21500,
  make: "Ford",
  model: "Escape",
  salesTax: 1200,
  frontEndLtv: 100,
  frontEndGross: 2000,
  amountToFinance: 20000,
  otdLtv: 105,
  monthlyPayment: 400,
  approvalScore,
  readinessScore: approvalScore,
  assessment: {
    version: "rules-v1",
    readiness: approvalScore,
    label: over.approvalBand === "pending" ? "Inputs needed" : "Checks passed",
    fitCount: over.fitCount ?? 0,
  } as DealAssessment,
  ...over,
});

const pendingUnit = (vin: string) =>
  unit(vin, 45, {
    approvalBand: "pending",
    fitCount: 0,
    pendingCount: 13,
    pendingCause: "fico",
    make: "Kia",
    model: "Soul",
  });

/** The text of the KPI card whose label is `label` (visible text + screen-reader text). */
const kpiValue = (label: string): string =>
  screen.getByText(label).parentElement?.textContent?.replace(label, "") ?? "";

/** What a screen reader hears for each distribution value cell whose visible share reads `share`. */
const valueCells = (share: string): string[] =>
  screen
    .getAllByText(share)
    .map((el) => el.parentElement?.querySelector(".sr-only")?.textContent ?? "");

afterEach(() => {
  cleanup();
  mocks.inventory = [];
  mocks.lenders = [];
});

describe("ReportsScreen pending units", () => {
  it("keeps an unchecked mileage program pending even when another lender has checked results", () => {
    mocks.inventory = [unit("UNKNOWN", 80, { mileage: "N/A" })];
    mocks.lenders = [
      { id: "checked", name: "Credit checked", tiers: [{ name: "Prime", minFico: 700 }] },
      {
        id: "mileage",
        name: "Needs mileage",
        tiers: [{ name: "Prime", minFico: 700, maxMileage: 100000 }],
      },
    ];
    render(<ReportsScreen />);
    const list = screen.getByRole("list", { name: "Lender reach and units fitting" });
    const pendingRow = screen.getByText("Needs mileage").closest('[role="listitem"]');
    expect(pendingRow?.textContent).toContain("Pending");
    expect(list.textContent).toContain("Credit checked");
    expect(list.textContent).toContain("0/1");
  });
  it("shows sample lender reach as pending instead of a zero-fit result", () => {
    mocks.inventory = [pendingUnit("C")];
    mocks.lenders = [{ id: "sample", name: "Example lender", tiers: [], isSample: true }];
    render(<ReportsScreen />);
    const list = screen.getByRole("list", { name: "Lender reach and units fitting" });
    expect(list.textContent).toContain("Pending");
    expect(list.textContent).not.toContain("0/1");
  });
  it("shows known checklist counts even while inputs are missing", () => {
    mocks.inventory = [
      unit("A", 100, { approvalBand: "strong", fitCount: 3 }),
      unit("B", 60, { approvalBand: "moderate", fitCount: 2 }),
      pendingUnit("C"),
      pendingUnit("D"),
    ];
    render(<ReportsScreen />);

    expect(screen.getByText("Readiness distribution — 4 units")).toBeTruthy();
    // Shares are of the 2 ranked units; the pending 45s are not "weak".
    expect(valueCells("25%")).toEqual(["1 unit, 25%", "1 unit, 25%"]);
    expect(valueCells("50%")).toEqual(["2 units, 50%"]); // strong + moderate
    expect(screen.getByTestId("reports-pending-note").textContent).toBe(
      "2 of 4 units are pending — complete missing checks on the desk"
    );
    expect(kpiValue("Avg readiness")).toBe("63");
    expect(screen.getByText("100% checks passed")).toBeTruthy();
    // Approval by make averages only ranked units — the all-pending make is absent.
    expect(screen.getByText("Kia")).toBeTruthy();
  });

  it("shows checklist progress rather than an approval score for incomplete deals", () => {
    mocks.inventory = [pendingUnit("C"), pendingUnit("D"), pendingUnit("E")];
    render(<ReportsScreen />);

    expect(kpiValue("Avg readiness")).toBe("45");
    expect(screen.getByText("45% checks passed")).toBeTruthy();
    expect(screen.getByTestId("reports-pending-note").textContent).toBe(
      "3 of 3 units are pending — complete missing checks on the desk"
    );
    expect(valueCells("0%")).toEqual(["0 units, 0%", "0 units, 0%"]);
  });

  it("renders no note when nothing is pending", () => {
    mocks.inventory = [unit("A", 100, { approvalBand: "strong", fitCount: 3 })];
    render(<ReportsScreen />);

    expect(screen.queryByTestId("reports-pending-note")).toBeNull();
    expect(screen.getByText("Readiness distribution — 1 unit")).toBeTruthy();
  });

  it("keeps each distribution value on one line", () => {
    mocks.inventory = Array.from({ length: 35 }, (_, i) =>
      unit(`V${i}`, 100, { approvalBand: "strong", fitCount: 3 })
    );
    render(<ReportsScreen />);

    const value = screen.getByText("100%").parentElement as HTMLElement;
    expect(value.className).toContain("bar-row-value");
    expect(document.querySelectorAll(".bar-row-label")).toHaveLength(3);
    expect(value.style.whiteSpace).toBe("nowrap");
    expect(value.style.width).toBe("92px");
  });

  it("keeps status regions outside role=list containers", () => {
    mocks.inventory = [pendingUnit("C")];
    render(<ReportsScreen />);

    const statuses = screen.getAllByRole("status");
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) {
      expect(status.closest('[role="list"]')).toBeNull();
    }
    expect(screen.getByTestId("reports-pending-note").closest('[role="list"]')).toBeNull();
  });
});
