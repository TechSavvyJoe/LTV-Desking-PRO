/** @vitest-environment jsdom */
import React, { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getInventory: vi.fn() }));
vi.mock("../../lib/api", () => ({
  getInventory: mocks.getInventory,
  getLenderProfiles: vi.fn().mockResolvedValue([]),
  getSavedDeals: vi.fn().mockResolvedValue([]),
  getDealerSettings: vi.fn().mockResolvedValue(null),
  updateDealerSettings: vi.fn(),
  updateInventoryItem: vi.fn(),
  logDealEvent: vi.fn(),
  subscribeToInventory: vi.fn(() => () => {}),
  subscribeToSavedDeals: vi.fn(() => () => {}),
  subscribeToLenderProfiles: vi.fn(() => () => {}),
}));
vi.mock("../../lib/auth", () => ({ isAuthenticated: () => true }));
vi.mock("../../lib/pocketbase", () => ({
  getCurrentDealerId: () => "dealer-budget",
  getCurrentUser: () => ({ role: "admin" }),
}));
vi.mock("../../lib/analytics", () => ({ capture: vi.fn() }));
vi.mock("../../hooks/useSaveDeal", () => ({
  useSaveDeal: () => ({ handleSaveDeal: vi.fn(), isSaving: false }),
}));
import { DealProvider, useDealContext } from "../../context/DealContext";
import { queryClient } from "../../lib/queryClient";
import DeskScreen from "./DeskScreen";

const VIN = "1FMCU0H60LUA00001";
function Probe({ onReady }: { onReady: (ctx: ReturnType<typeof useDealContext>) => void }) {
  const ctx = useDealContext();
  useEffect(() => {
    onReady(ctx);
  });
  return null;
}

describe("selected unit and payment ceiling", () => {
  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    );
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    mocks.getInventory.mockResolvedValue([
      {
        id: "selected-unit",
        dealer: "dealer-budget",
        vin: VIN,
        year: 2022,
        make: "Ford",
        model: "Escape",
        stockNumber: "A1",
        price: 24000,
        mileage: 30000,
        jdPower: 22000,
        status: "available",
      },
      {
        id: "cheap-unit",
        dealer: "dealer-budget",
        vin: "1FAHP3F20CL000002",
        year: 2012,
        make: "Ford",
        model: "Focus",
        stockNumber: "B1",
        price: 4000,
        mileage: 90000,
        jdPower: 4500,
        status: "available",
      },
    ]);
  });
  afterEach(() => {
    cleanup();
    queryClient.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("retains the selected VIN after the budget debounce and keeps its cash proposal reachable", async () => {
    let ctx!: ReturnType<typeof useDealContext>;
    render(
      <QueryClientProvider client={queryClient}>
        <DealProvider>
          <Probe
            onReady={(value) => {
              ctx = value;
            }}
          />
          <DeskScreen />
        </DealProvider>
      </QueryClientProvider>
    );
    await waitFor(() => expect(ctx.processedInventory.length).toBe(2));
    act(() => {
      ctx.setFocusVin(VIN);
      ctx.setDealData((current) => ({
        ...current,
        loanTerm: 60,
        interestRate: 8,
        downPayment: 1000,
        backendProducts: 0,
        vscAmount: 0,
        gapAmount: 0,
      }));
    });
    await waitFor(() => expect(ctx.focusVin).toBe(VIN));
    fireEvent.change(screen.getByLabelText("Payment budget ($/mo)"), { target: { value: "100" } });
    await waitFor(
      () => {
        expect(ctx.filteredInventory.some((unit) => unit.vin === VIN)).toBe(false);
        expect(
          ctx.processedInventory.find((unit) => unit.vin === VIN)?.assessment?.budgetUsedPercent
        ).toBeGreaterThan(100);
      },
      { timeout: 5000 }
    );
    expect(ctx.focusVin).toBe(VIN);
    expect(screen.getByText(/Selected unit is outside the current inventory results/)).toBeTruthy();
    const inspector = screen.getByRole("complementary", { name: "Deal inspector" });
    expect(within(inspector).getByRole("heading", { level: 3 }).textContent).toContain("Escape");
    fireEvent.click(within(inspector).getByRole("button", { name: "Apply cash down" }));
    await waitFor(
      () => {
        const selected = ctx.processedInventory.find((unit) => unit.vin === VIN);
        expect(ctx.focusVin).toBe(VIN);
        expect(ctx.dealData.downPayment).toBeGreaterThan(1000);
        expect(selected?.monthlyPayment).toBeLessThanOrEqual(100);
      },
      { timeout: 5000 }
    );
    fireEvent.click(within(inspector).getByRole("button", { name: "Undo cash change" }));
    await waitFor(
      () => {
        const selected = ctx.processedInventory.find((unit) => unit.vin === VIN);
        expect(ctx.focusVin).toBe(VIN);
        expect(ctx.dealData.downPayment).toBe(1000);
        expect(selected?.monthlyPayment).toBeGreaterThan(100);
        expect(ctx.filteredInventory.some((unit) => unit.vin === VIN)).toBe(false);
      },
      { timeout: 5000 }
    );
    expect(within(inspector).getByRole("button", { name: "Apply cash down" })).toBeTruthy();
  });
});
