/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ savedDeals: [] as unknown[] }));

vi.mock("../../context/DealContext", () => ({
  useDealContext: () => ({
    settings: { ltvThresholds: { warn: 115, danger: 125, critical: 135 } },
    savedDeals: mocks.savedDeals,
    setSavedDeals: vi.fn(),
    setActiveVehicle: vi.fn(),
    setFocusVin: vi.fn(),
    setMessage: vi.fn(),
    clearDealAndFilters: vi.fn(),
  }),
}));

vi.mock("../../hooks/useOpenDealInDesk", () => ({
  useOpenDealInDesk: () => vi.fn(),
}));

import PipelineScreen from "./PipelineScreen";

afterEach(() => {
  cleanup();
  mocks.savedDeals = [];
});

describe("PipelineScreen empty state", () => {
  it("renders the empty state without a table that has no rows", () => {
    render(
      <MemoryRouter>
        <PipelineScreen />
      </MemoryRouter>
    );

    expect(screen.getByText("No deals in the pipeline yet")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("PipelineScreen deal row disclosure", () => {
  it("puts aria-expanded on the chevron button, not the row", () => {
    mocks.savedDeals = [
      {
        id: "d1",
        date: "2026-09-01",
        customerName: "Pat Buyer",
        salespersonName: "Sam",
        status: "draft",
        vehicle: { vin: "V1", vehicle: "2021 Camry", stock: "S1" },
        dealData: {},
        customerFilters: { creditScore: 700, monthlyIncome: 5000 },
        calculatedData: { payment: 400, otdLtv: 100, financed: 20000, approvalScore: 80 },
      },
    ];
    render(
      <MemoryRouter>
        <PipelineScreen />
      </MemoryRouter>
    );

    const row = screen.getByRole("row", { name: "Deal for Pat Buyer" });
    expect(row.hasAttribute("aria-expanded")).toBe(false);

    const toggle = screen.getByRole("button", { name: "Show details for 2021 Camry" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("pipeline-panel-d1")).toBeNull();

    fireEvent.click(toggle);

    const hide = screen.getByRole("button", { name: "Hide details for 2021 Camry" });
    expect(hide.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("pipeline-panel-d1")).not.toBeNull();
  });
});
