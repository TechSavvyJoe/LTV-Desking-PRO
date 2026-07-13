/**
 * @vitest-environment jsdom
 */

import React, { useEffect, useRef } from "react";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import type { InventoryItem } from "../lib/pocketbase";
import { queryClient } from "../lib/queryClient";

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(() => true),
  getInventory: vi.fn(),
  getLenderProfiles: vi.fn(),
  getSavedDeals: vi.fn(),
  getDealerSettings: vi.fn(),
  subscribeToInventory: vi.fn(() => () => {}),
  subscribeToSavedDeals: vi.fn(() => () => {}),
  subscribeToLenderProfiles: vi.fn(() => () => {}),
  capture: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  getInventory: mocks.getInventory,
  getLenderProfiles: mocks.getLenderProfiles,
  getSavedDeals: mocks.getSavedDeals,
  getDealerSettings: mocks.getDealerSettings,
  subscribeToInventory: mocks.subscribeToInventory,
  subscribeToSavedDeals: mocks.subscribeToSavedDeals,
  subscribeToLenderProfiles: mocks.subscribeToLenderProfiles,
  updateDealerSettings: vi.fn(),
  updateInventoryItem: vi.fn(),
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
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
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
