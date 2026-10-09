/**
 * @vitest-environment jsdom
 */

import React, { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import type { CalculatedVehicle } from "../types";
import { queryClient } from "../lib/queryClient";

const mocks = vi.hoisted(() => ({
  saveDeal: vi.fn(),
  logDealEvent: vi.fn(),
  capture: vi.fn(),
  isAuthenticated: vi.fn(() => true),
  getInventory: vi.fn().mockResolvedValue([]),
  getLenderProfiles: vi.fn().mockResolvedValue([]),
  getSavedDeals: vi.fn().mockResolvedValue([]),
  getDealerSettings: vi.fn().mockResolvedValue(null),
  subscribeToInventory: vi.fn(() => () => {}),
  subscribeToSavedDeals: vi.fn(() => () => {}),
  subscribeToLenderProfiles: vi.fn(() => () => {}),
}));

vi.mock("../lib/api", () => ({
  saveDeal: mocks.saveDeal,
  logDealEvent: mocks.logDealEvent,
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

import { DealProvider, useDealContext } from "../context/DealContext";
import useSaveDeal from "./useSaveDeal";
import { DEFAULT_LENDER_PROFILES } from "../constants";
import { announcePrivateSessionBoundary } from "../lib/privateSession";

const staleVehicle: CalculatedVehicle = {
  id: "veh-1",
  vehicle: "2020 Honda Accord",
  stock: "A1",
  vin: "1HGCV1F3XLA000001",
  modelYear: 2020,
  mileage: 45000,
  price: 22000,
  jdPower: 20000,
  jdPowerRetail: 23000,
  unitCost: 18000,
  baseOutTheDoorPrice: 24000,
  salesTax: 1320,
  frontEndLtv: 110,
  frontEndGross: 4000,
  amountToFinance: 21000,
  otdLtv: 105,
  monthlyPayment: 399,
  approvalScore: 55,
  approvalBand: "moderate",
  fitCount: 1,
  fitNames: ["Sample Lender"],
};

function SaveProbe({ onSave }: { onSave: () => void }) {
  const { setDealData, setCustomerName, setActiveVehicle, setLenderProfiles } = useDealContext();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLenderProfiles(DEFAULT_LENDER_PROFILES);
    setCustomerName("Jane Buyer");
    setActiveVehicle(staleVehicle);
    setDealData((prev) => ({
      ...prev,
      loanTerm: 72,
      interestRate: 8.5,
      downPayment: 3000,
    }));
    setReady(true);
  }, [setDealData, setCustomerName, setActiveVehicle, setLenderProfiles]);

  return (
    <button type="button" disabled={!ready} onClick={onSave}>
      Save deal
    </button>
  );
}

function SaveHarness() {
  const { handleSaveDeal, isSaving, saveError } = useSaveDeal();
  const { isDealDirty, savedDeals, setCustomerName, setInventory, setSettings } = useDealContext();
  const [receipt, setReceipt] = useState<string>("None");
  return (
    <>
      <SaveProbe
        onSave={() => {
          setReceipt("Pending");
          void handleSaveDeal(staleVehicle).then((saved) => setReceipt(String(saved)));
        }}
      />
      <button onClick={() => setCustomerName("Newer Buyer")}>Edit customer</button>
      <button onClick={() => setInventory([{ ...staleVehicle, price: 23000 }])}>
        Update same VIN price
      </button>
      <button onClick={() => setSettings((prev) => ({ ...prev, docFee: prev.docFee + 10 }))}>
        Update fees
      </button>
      <span data-testid="receipt">{receipt}</span>
      <span data-testid="dirty">{String(isDealDirty)}</span>
      <span data-testid="saved-count">{savedDeals.length}</span>
      {saveError && <p role="alert">{saveError}</p>}
      <output role="status">{isSaving ? "Saving" : "Ready"}</output>
    </>
  );
}

describe("useSaveDeal", () => {
  beforeEach(() => {
    queryClient.clear();
    mocks.saveDeal.mockResolvedValue({
      id: "saved-1",
      name: "2026-07-13 - Jane Buyer",
      customerName: "Jane Buyer",
      vehicleData: {},
      dealData: {},
      customerFilters: {},
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("recomputes financials from live deal inputs instead of the stale vehicle snapshot", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <DealProvider>
          <SaveHarness />
        </DealProvider>
      </QueryClientProvider>
    );

    const button = await screen.findByRole("button", { name: /save deal/i });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);

    await waitFor(() => expect(mocks.saveDeal).toHaveBeenCalledOnce());

    const payload = mocks.saveDeal.mock.calls[0]![0] as {
      vehicleData: { monthlyPayment: number | string };
      dealData: { loanTerm: number };
    };

    expect(payload.dealData.loanTerm).toBe(72);
    expect(payload.vehicleData.monthlyPayment).not.toBe(staleVehicle.monthlyPayment);
    expect(typeof payload.vehicleData.monthlyPayment).toBe("number");
  });

  it("surfaces a backend failure without mutating saved deals optimistically", async () => {
    mocks.saveDeal.mockRejectedValue(new Error("write denied"));

    render(
      <QueryClientProvider client={queryClient}>
        <DealProvider>
          <SaveHarness />
        </DealProvider>
      </QueryClientProvider>
    );

    const button = await screen.findByRole("button", { name: /save deal/i });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);

    await waitFor(() => expect(mocks.saveDeal).toHaveBeenCalledOnce());
    expect(mocks.logDealEvent).not.toHaveBeenCalled();
  });

  it("permits only one pending write, then releases the guard after failure", async () => {
    let rejectWrite!: (error: Error) => void;
    mocks.saveDeal.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectWrite = reject;
        })
    );
    render(
      <QueryClientProvider client={queryClient}>
        <DealProvider>
          <SaveHarness />
        </DealProvider>
      </QueryClientProvider>
    );
    const button = await screen.findByRole("button", { name: /save deal/i });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(mocks.saveDeal).toHaveBeenCalledOnce());
    rejectWrite(new Error("write failed"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Ready"));
    fireEvent.click(button);
    await waitFor(() => expect(mocks.saveDeal).toHaveBeenCalledTimes(2));
  });
  it("returns no success receipt until the server resolves and keeps newer edits dirty", async () => {
    let release!: (saved: Record<string, unknown>) => void;
    mocks.saveDeal.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    render(
      <QueryClientProvider client={queryClient}>
        <DealProvider>
          <SaveHarness />
        </DealProvider>
      </QueryClientProvider>
    );
    const button = await screen.findByRole("button", { name: /save deal/i });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(mocks.saveDeal).toHaveBeenCalledOnce());
    expect(screen.getByTestId("receipt").textContent).toBe("Pending");
    fireEvent.click(screen.getByRole("button", { name: "Edit customer" }));
    await act(async () =>
      release({
        id: "saved-delayed",
        customerName: "Jane Buyer",
        vehicleData: {},
        dealData: {},
        customerFilters: {},
      })
    );
    await waitFor(() => expect(screen.getByTestId("receipt").textContent).toBe("false"));
    expect(screen.getByTestId("dirty").textContent).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain("Newer edits are still unsaved");
  });

  it("returns a confirmed success receipt and clears only the saved version's dirty state", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <DealProvider>
          <SaveHarness />
        </DealProvider>
      </QueryClientProvider>
    );
    const button = await screen.findByRole("button", { name: /save deal/i });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Edit customer" }));
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByTestId("receipt").textContent).toBe("true"));
    expect(screen.getByTestId("dirty").textContent).toBe("false");
  });

  it.each(["Update same VIN price", "Update fees"])(
    "retains unsaved state when %s changes during a write",
    async (label) => {
      let release!: (value: Record<string, unknown>) => void;
      mocks.saveDeal.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          })
      );
      render(
        <QueryClientProvider client={queryClient}>
          <DealProvider>
            <SaveHarness />
          </DealProvider>
        </QueryClientProvider>
      );
      const button = await screen.findByRole("button", { name: /save deal/i });
      await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(button);
      await waitFor(() => expect(mocks.saveDeal).toHaveBeenCalledOnce());
      fireEvent.click(screen.getByRole("button", { name: label }));
      await act(async () =>
        release({ id: "old-quote", vehicleData: {}, dealData: {}, customerFilters: {} })
      );
      await waitFor(() => expect(screen.getByTestId("receipt").textContent).toBe("false"));
      expect(screen.getByRole("alert").textContent).toContain("Newer edits are still unsaved");
      expect(screen.getByTestId("dirty").textContent).toBe("true");
    }
  );

  it("drops post-save events and receipts after switching private sessions", async () => {
    let release!: (value: Record<string, unknown>) => void;
    mocks.saveDeal.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    render(
      <QueryClientProvider client={queryClient}>
        <DealProvider>
          <SaveHarness />
        </DealProvider>
      </QueryClientProvider>
    );
    const button = await screen.findByRole("button", { name: /save deal/i });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(mocks.saveDeal).toHaveBeenCalledOnce());
    await act(async () => {
      announcePrivateSessionBoundary();
      release({ id: "old-session", vehicleData: {}, dealData: {}, customerFilters: {} });
    });
    await waitFor(() => expect(screen.getByTestId("receipt").textContent).toBe("false"));
    expect(mocks.logDealEvent).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(screen.getByTestId("saved-count").textContent).toBe("0");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
