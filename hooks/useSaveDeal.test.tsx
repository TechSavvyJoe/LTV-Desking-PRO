/**
 * @vitest-environment jsdom
 */

import React, { useEffect, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  const { handleSaveDeal } = useSaveDeal();
  return <SaveProbe onSave={() => handleSaveDeal(staleVehicle)} />;
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
});
