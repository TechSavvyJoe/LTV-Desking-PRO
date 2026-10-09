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

    expect(screen.getByText("No saved deals yet")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("titles the empty state as an h2 under the page's h1", () => {
    render(
      <MemoryRouter>
        <PipelineScreen />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1, name: "Pipeline" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "No saved deals yet" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });
});

describe("PipelineScreen deal row disclosure", () => {
  it("searches stock and filters exact statuses without confusing filtered emptiness with a new dealer", () => {
    mocks.savedDeals = [
      {
        id: "find1",
        date: "2026-10-08",
        customerName: "Synthetic One",
        salespersonName: "Desk",
        status: "pending",
        vehicle: { vin: "VINONE", vehicle: "2021 Ford", stock: "STK12" },
        dealData: {},
        customerFilters: {},
        calculatedData: { monthlyPayment: 400, otdLtv: 100, amountToFinance: 20000 },
      },
      {
        id: "find2",
        date: "2026-10-08",
        customerName: "Synthetic Two",
        salespersonName: "Desk",
        status: "funded",
        vehicle: { vin: "VINTWO", vehicle: "2022 Ford", stock: "STK13" },
        dealData: {},
        customerFilters: {},
        calculatedData: { monthlyPayment: 500, otdLtv: 100, amountToFinance: 30000 },
      },
    ];
    render(
      <MemoryRouter>
        <PipelineScreen />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a deal" }), {
      target: { value: "stk13" },
    });
    expect(screen.queryByRole("row", { name: "Deal for Synthetic One" })).toBeNull();
    expect(screen.getByRole("row", { name: "Deal for Synthetic Two" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Deal status" }), {
      target: { value: "pending" },
    });
    expect(screen.getByText("No matching deals")).toBeTruthy();
    expect(screen.queryByText("No saved deals yet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("row", { name: "Deal for Synthetic One" })).toBeTruthy();
  });

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

  it("does not repeat the STK prefix when the stock number already has one", () => {
    const deal = (id: string, stock: string) => ({
      id,
      date: "2026-09-01",
      customerName: `Buyer ${id}`,
      salespersonName: "Sam",
      status: "draft",
      vehicle: { vin: `V${id}`, vehicle: "2021 Camry", stock },
      dealData: {},
      customerFilters: { creditScore: 700, monthlyIncome: 5000 },
      calculatedData: { payment: 400, otdLtv: 100, financed: 20000, approvalScore: 80 },
    });
    mocks.savedDeals = [deal("a", "STK1034"), deal("b", "1035")];
    render(
      <MemoryRouter>
        <PipelineScreen />
      </MemoryRouter>
    );

    expect(screen.getByText("STK1034")).toBeTruthy();
    expect(screen.getByText("STK 1035")).toBeTruthy();
    expect(screen.queryByText(/STK STK/)).toBeNull();
  });
});
