/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalculatedVehicle } from "../../types";

const mocks = vi.hoisted(() => ({
  inventory: [] as CalculatedVehicle[],
}));

vi.mock("../../context/DealContext", () => ({
  useDealContext: () => ({
    settings: { ltvThresholds: { warn: 115, danger: 125, critical: 135 } },
    processedInventory: mocks.inventory,
    safeLenderProfiles: [],
    savedDeals: [],
    unitsPerLender: {},
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
});

describe("ReportsScreen pending units", () => {
  it("excludes pending units from the distribution and approval KPIs, with a note", () => {
    mocks.inventory = [
      unit("A", 80, { approvalBand: "strong", fitCount: 3 }),
      unit("B", 60, { approvalBand: "moderate", fitCount: 2 }),
      pendingUnit("C"),
      pendingUnit("D"),
    ];
    render(<ReportsScreen />);

    expect(screen.getByText("Approval distribution — 2 of 4 units")).toBeTruthy();
    // Shares are of the 2 ranked units; the pending 45s are not "weak".
    expect(valueCells("50%")).toEqual(["1 unit, 50%", "1 unit, 50%"]); // strong + moderate
    expect(valueCells("0%")).toEqual(["0 units, 0%"]); // weak
    expect(screen.getByTestId("reports-pending-note").textContent).toBe(
      "2 of 4 units are pending — add a FICO on the desk to rank them"
    );
    expect(kpiValue("Avg approval")).toBe("70");
    expect(screen.getByText("80 / 100 odds")).toBeTruthy();
    // Approval by make averages only ranked units — the all-pending make is absent.
    expect(screen.queryByText("Kia")).toBeNull();
  });

  it("shows '—' for the approval KPIs when every unit is pending, and says 'pending' to screen readers", () => {
    mocks.inventory = [pendingUnit("C"), pendingUnit("D"), pendingUnit("E")];
    render(<ReportsScreen />);

    expect(kpiValue("Avg approval")).toBe("—pending");
    const avgApproval = screen.getByText("Avg approval").parentElement as HTMLElement;
    expect(avgApproval.querySelector('[aria-hidden="true"]')?.textContent).toBe("—");
    expect(avgApproval.querySelector(".sr-only")?.textContent).toBe("pending");
    // The unit name says "pending"; its score line is a bare, hidden dash.
    const mostApprovable = screen.getByText("Most approvable").parentElement;
    expect(mostApprovable?.textContent).toBe("Most approvable—pending—");
    expect(screen.getByTestId("reports-pending-note").textContent).toBe(
      "3 of 3 units are pending — add a FICO on the desk to rank them"
    );
    expect(valueCells("0%")).toEqual(["0 units, 0%", "0 units, 0%", "0 units, 0%"]);
  });

  it("renders no note when nothing is pending", () => {
    mocks.inventory = [unit("A", 80, { approvalBand: "strong", fitCount: 3 })];
    render(<ReportsScreen />);

    expect(screen.queryByTestId("reports-pending-note")).toBeNull();
    expect(screen.getByText("Approval distribution — 1 unit")).toBeTruthy();
  });

  it("keeps each distribution value on one line", () => {
    mocks.inventory = Array.from({ length: 35 }, (_, i) =>
      unit(`V${i}`, 80, { approvalBand: "strong", fitCount: 3 })
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
