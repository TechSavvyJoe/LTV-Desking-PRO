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

/** The text of the KPI card whose label is `label`. */
const kpiValue = (label: string): string =>
  screen.getByText(label).parentElement?.textContent?.replace(label, "") ?? "";

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

    expect(screen.getByText("APPROVAL DISTRIBUTION · 2 OF 4 UNITS")).toBeTruthy();
    // Shares are of the 2 ranked units; the pending 45s are not "weak".
    expect(screen.getAllByText("1 · 50%")).toHaveLength(2); // strong + moderate
    expect(screen.getAllByText("0 · 0%")).toHaveLength(1); // weak
    expect(screen.getByTestId("reports-pending-note").textContent).toBe(
      "2 of 4 units are pending — add a FICO on the desk to rank them"
    );
    expect(kpiValue("Avg approval")).toBe("70");
    expect(screen.getByText("80 / 100 odds")).toBeTruthy();
    // Approval by make averages only ranked units — the all-pending make is absent.
    expect(screen.queryByText("Kia")).toBeNull();
  });

  it("shows '—' for the approval KPIs when every unit is pending", () => {
    mocks.inventory = [pendingUnit("C"), pendingUnit("D"), pendingUnit("E")];
    render(<ReportsScreen />);

    expect(kpiValue("Avg approval")).toBe("—");
    const mostApprovable = screen.getByText("Most approvable").parentElement;
    expect(mostApprovable?.textContent).toBe("Most approvable——");
    expect(screen.getByTestId("reports-pending-note").textContent).toBe(
      "3 of 3 units are pending — add a FICO on the desk to rank them"
    );
    expect(screen.getAllByText("0 · 0%")).toHaveLength(3);
  });

  it("renders no note when nothing is pending", () => {
    mocks.inventory = [unit("A", 80, { approvalBand: "strong", fitCount: 3 })];
    render(<ReportsScreen />);

    expect(screen.queryByTestId("reports-pending-note")).toBeNull();
    expect(screen.getByText("APPROVAL DISTRIBUTION · 1 UNITS")).toBeTruthy();
  });

  it("keeps each distribution value on one line", () => {
    mocks.inventory = Array.from({ length: 35 }, (_, i) =>
      unit(`V${i}`, 80, { approvalBand: "strong", fitCount: 3 })
    );
    render(<ReportsScreen />);

    const value = screen.getByText("35 · 100%");
    expect(value.style.whiteSpace).toBe("nowrap");
    expect(value.style.width).toBe("92px");
  });
});
