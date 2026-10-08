/**
 * @vitest-environment jsdom
 */

import React, { useEffect, useRef } from "react";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import type { InventoryItem } from "../lib/pocketbase";
import { queryClient } from "../lib/queryClient";
import { announcePrivateSessionBoundary } from "../lib/privateSession";

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(() => true),
  getInventory: vi.fn(),
  getLenderProfiles: vi.fn(),
  getSavedDeals: vi.fn(),
  getDealerSettings: vi.fn(),
  subscribeToInventory: vi.fn<(callback: (data: InventoryItem[]) => void) => () => void>(
    () => () => {}
  ),
  subscribeToSavedDeals: vi.fn(() => () => {}),
  subscribeToLenderProfiles: vi.fn(() => () => {}),
  capture: vi.fn(),
  updateDealerSettings: vi.fn(),
  updateInventoryItem: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  getInventory: mocks.getInventory,
  getLenderProfiles: mocks.getLenderProfiles,
  getSavedDeals: mocks.getSavedDeals,
  getDealerSettings: mocks.getDealerSettings,
  subscribeToInventory: mocks.subscribeToInventory,
  subscribeToSavedDeals: mocks.subscribeToSavedDeals,
  subscribeToLenderProfiles: mocks.subscribeToLenderProfiles,
  updateDealerSettings: mocks.updateDealerSettings,
  updateInventoryItem: mocks.updateInventoryItem,
}));

vi.mock("../lib/auth", () => ({
  isAuthenticated: mocks.isAuthenticated,
}));

vi.mock("../lib/pocketbase", () => ({
  getCurrentDealerId: () => "dealer-test",
}));

vi.mock("../lib/analytics", () => ({
  capture: mocks.capture,
}));
vi.mock("../lib/toast", () => ({ toast: { error: mocks.toastError } }));

import { DealProvider, useDealContext } from "./DealContext";

const emptyInventory: InventoryItem[] = [];

function ContextProbe({ onReady }: { onReady: (ctx: ReturnType<typeof useDealContext>) => void }) {
  const ctx = useDealContext();
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    readyRef.current(ctx);
  });
  return (
    <div>
      <span data-testid="processed-count">{ctx.processedInventory.length}</span>
      <span data-testid="paginated-count">{ctx.paginatedInventory.length}</span>
      <span data-testid="page">{ctx.pagination.currentPage}</span>
      <span data-testid="inventory-count">{ctx.inventory.length}</span>
      <span data-testid="first-payment">
        {typeof ctx.processedInventory[0]?.monthlyPayment === "number"
          ? ctx.processedInventory[0].monthlyPayment
          : "na"}
      </span>
      <span data-testid="units-accu">{ctx.unitsPerLender["accu"] ?? "missing"}</span>
    </div>
  );
}

const renderProvider = (onReady: (ctx: ReturnType<typeof useDealContext>) => void) =>
  render(
    <QueryClientProvider client={queryClient}>
      <DealProvider>
        <ContextProbe onReady={onReady} />
      </DealProvider>
    </QueryClientProvider>
  );

describe("DealProvider derivations", () => {
  beforeEach(() => {
    queryClient.clear();
    mocks.isAuthenticated.mockReturnValue(true);
    mocks.getInventory.mockResolvedValue(emptyInventory);
    mocks.getLenderProfiles.mockResolvedValue([]);
    mocks.getSavedDeals.mockResolvedValue([]);
    mocks.getDealerSettings.mockResolvedValue(null);
    mocks.updateDealerSettings.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps sold units out of the working inventory on fetch, refetch and realtime updates", async () => {
    const available: InventoryItem = {
      id: "available-unit",
      dealer: "dealer-test",
      vin: "1AVAILABLE00000001",
      year: 2024,
      make: "Ford",
      model: "Escape",
      price: 26000,
      status: "available",
      created: "2026-01-01",
      updated: "2026-01-01",
    };
    const sold: InventoryItem = {
      ...available,
      id: "sold-unit",
      vin: "1SOLDUNIT00000001",
      status: "sold",
    };
    mocks.getInventory.mockResolvedValue([available, sold]);
    let ctx!: ReturnType<typeof useDealContext>;
    renderProvider((c) => {
      ctx = c;
    });
    await waitFor(() => expect(ctx.inventory.map((v) => v.id)).toEqual([available.id]));

    await act(async () => {
      await ctx.refetchData();
    });
    expect(ctx.inventory.map((v) => v.id)).toEqual([available.id]);

    const onInventory = mocks.subscribeToInventory.mock.calls[0]?.[0];
    if (!onInventory) throw new Error("Inventory subscription was not initialized.");
    act(() => {
      onInventory([
        { ...available, status: "sold" },
        { ...sold, status: "available" },
      ]);
    });
    await waitFor(() => expect(ctx.inventory.map((v) => v.id)).toEqual([sold.id]));
  });

  it("rejects stale manager responses and cache setters after a same-dealer session switch", async () => {
    const item: InventoryItem = {
      id: "unit",
      vin: "1HGCM82633A004352",
      year: 2024,
      make: "Ford",
      model: "Escape",
      price: 26000,
      unitCost: 19000,
      status: "available",
      dealer: "dealer-test",
      created: "",
      updated: "",
    };
    mocks.getInventory.mockResolvedValue([item]);
    let release!: (value: InventoryItem) => void;
    mocks.updateInventoryItem.mockReturnValue(
      new Promise<InventoryItem>((resolve) => {
        release = resolve;
      })
    );
    let manager!: ReturnType<typeof useDealContext>;
    const mounted = renderProvider((c) => {
      manager = c;
    });
    await waitFor(() => expect(manager.inventory[0]?.id).toBe("unit"));
    let pending!: Promise<void>;
    act(() => {
      pending = manager.handleInventoryUpdate(item.vin, { price: 27000 });
    });
    act(() => {
      // Both transitions happen before React unmount: returning to A must not revive its old request.
      announcePrivateSessionBoundary();
      announcePrivateSessionBoundary();
      manager.setInventory([{ ...manager.inventory[0]!, unitCost: 99999 }]);
    });
    expect(queryClient.getQueryData(["dealerData", "inventory", "dealer-test"])).toBeUndefined();
    mounted.unmount();
    mocks.getInventory.mockResolvedValue([{ ...item, unitCost: undefined }]);
    let sales!: ReturnType<typeof useDealContext>;
    renderProvider((c) => {
      sales = c;
    });
    await waitFor(() => expect(sales.inventory[0]?.unitCost).toBe("N/A"));
    await act(async () => {
      release({ ...item, price: 27000 });
      await pending;
    });
    expect(sales.inventory[0]?.unitCost).toBe("N/A");
    expect(sales.inventory[0]?.price).toBe(26000);
    act(() => {
      manager.setLenderProfiles([{ id: "private", name: "Private", tiers: [] }]);
      manager.setSavedDeals([]);
    });
    expect(sales.lenderProfiles).toEqual([]);
    expect(queryClient.getQueryData(["dealerData", "lenderProfiles", "dealer-test"])).toEqual([]);
  });

  it("persists settings once per edit in StrictMode and surfaces a null save", async () => {
    mocks.updateDealerSettings.mockResolvedValue(null);
    let ctx!: ReturnType<typeof useDealContext>;
    render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <DealProvider>
            <ContextProbe
              onReady={(c) => {
                ctx = c;
              }}
            />
          </DealProvider>
        </QueryClientProvider>
      </React.StrictMode>
    );
    await waitFor(() => expect(ctx.dataLoading).toBe(false));
    act(() => ctx.setSettings((prev) => ({ ...prev, docFee: 321, customTaxRate: null })));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Server save failed — settings kept in this browser."
      )
    );
    expect(mocks.updateDealerSettings).toHaveBeenCalledTimes(1);
    expect(mocks.updateDealerSettings).toHaveBeenCalledWith(
      expect.objectContaining({ docFee: 321, customTaxRate: null })
    );
  });

  it("runs the processedInventory scoring pass after sample data loads", async () => {
    let ctx!: ReturnType<typeof useDealContext>;
    renderProvider((c) => {
      ctx = c;
    });

    await waitFor(() => expect(screen.getByTestId("inventory-count").textContent).toBe("0"));

    act(() => {
      ctx.loadSampleData();
    });

    await waitFor(
      () => expect(Number(screen.getByTestId("processed-count").textContent)).toBeGreaterThan(0),
      { timeout: 2000 }
    );

    expect(screen.getByTestId("first-payment").textContent).not.toBe("na");
    expect(Number(screen.getByTestId("units-accu").textContent)).toBeGreaterThanOrEqual(0);
  });

  it.each([
    [undefined, 1816.5],
    [false, 1816.5],
    [true, 0],
  ])(
    "uses standard Michigan tax unless a stored zero override is explicitly enabled (%s)",
    async (enabled, expectedTax) => {
      mocks.getDealerSettings.mockResolvedValue({
        docFee: 250,
        cvrFee: 25,
        defaultState: "MI",
        outOfStateTransitFee: 10,
        customTaxRate: 0,
        customTaxRateEnabled: enabled,
      });
      mocks.getInventory.mockResolvedValue([
        {
          id: "tax-unit",
          vin: "1HGCM82633A004352",
          year: 2024,
          make: "Ford",
          model: "Escape",
          price: 30000,
          mileage: 30000,
          jdPower: 30000,
          status: "available",
        },
      ]);
      let ctx!: ReturnType<typeof useDealContext>;
      renderProvider((c) => {
        ctx = c;
      });
      await waitFor(() => expect(ctx.settings.docFee).toBe(250));
      act(() =>
        ctx.setDealData((prev) => ({
          ...prev,
          tradeInValue: 0,
          tradeInPayoff: 0,
          dealerDiscount: 0,
        }))
      );
      await waitFor(() => expect(ctx.processedInventory[0]?.salesTax).toBe(expectedTax));
    }
  );

  it("clamps pagination when filters shrink the result set", async () => {
    let ctx!: ReturnType<typeof useDealContext>;
    renderProvider((c) => {
      ctx = c;
    });

    await waitFor(() => expect(screen.getByTestId("inventory-count").textContent).toBe("0"));

    act(() => {
      ctx.loadSampleData();
      ctx.setPagination({ currentPage: 5, itemsPerPage: 2 });
    });

    await waitFor(
      () => expect(Number(screen.getByTestId("processed-count").textContent)).toBeGreaterThan(2),
      { timeout: 2000 }
    );

    act(() => {
      ctx.setSearchQuery("2012 Honda Civic");
    });

    await waitFor(() => expect(Number(screen.getByTestId("paginated-count").textContent)).toBe(1));
    await waitFor(() => expect(Number(screen.getByTestId("page").textContent)).toBeLessThan(5));
  });
});
