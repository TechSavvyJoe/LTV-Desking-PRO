/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateFinancials } from "../../services/calculator";
import { assessDeal } from "../../services/dealAssessment";
import { lenderFitForVehicle } from "../../services/lenderFit";
import {
  INITIAL_DEAL_DATA,
  INITIAL_FILTER_DATA,
  INITIAL_SETTINGS,
  SAMPLE_INVENTORY,
} from "../../constants";

const mocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  confirm: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("../../context/DealContext", () => ({ useDealContext: () => mocks.context }));
vi.mock("../../lib/confirm", () => ({ confirmAction: mocks.confirm }));
vi.mock("../../lib/pocketbase", () => ({ getCurrentUser: () => ({ role: "admin" }) }));
vi.mock("../../hooks/useSaveDeal", () => ({
  useSaveDeal: () => ({ handleSaveDeal: vi.fn(), isSaving: false }),
}));
vi.mock("../../hooks/useDeskShortcuts", () => ({ useDeskShortcuts: vi.fn() }));
vi.mock("./DeskTermsRail", () => ({
  DeskTermsRail: ({ onReset, advancedOpen }: { onReset: () => void; advancedOpen: boolean }) => (
    <>
      <button onClick={onReset}>Reset deal</button>
      <input id="desk-fico" aria-label="Customer FICO" />
      <input id="desk-income" aria-label="Monthly income" />
      <input id="desk-max-payment" aria-label="Payment ceiling" />
      <input id="desk-apr" aria-label="Interest rate" />
      <div id="desk-term">
        <button data-active="true">Selected term</button>
      </div>
      {advancedOpen && (
        <>
          <input id="desk-monthly-debt" aria-label="Monthly debt" />
          <select id="desk-vehicle-condition" aria-label="Vehicle condition">
            <option>Unknown</option>
          </select>
        </>
      )}
    </>
  ),
}));
vi.mock("./InventoryGrid", () => ({
  InventoryGrid: ({ onOpenInspector }: { onOpenInspector: () => void }) => (
    <button onClick={onOpenInspector}>Open inspector</button>
  ),
}));
vi.mock("./PaymentTarget", () => ({ PaymentTarget: () => null }));
vi.mock("./DeskShortcutsHelp", () => ({ DeskShortcutsHelp: () => null }));
import DeskScreen from "./DeskScreen";

describe("desk reset boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context = {
      settings: INITIAL_SETTINGS,
      dealData: INITIAL_DEAL_DATA,
      filters: INITIAL_FILTER_DATA,
      setDealData: vi.fn(),
      setFilters: vi.fn(),
      customerName: "Previous Buyer",
      setCustomerName: vi.fn(),
      setActiveVehicle: vi.fn(),
      favorites: [],
      toggleFavorite: vi.fn(),
      safeLenderProfiles: [],
      processedInventory: [],
      filteredInventory: [],
      inventorySort: { key: "vehicle", direction: "asc" },
      setInventorySort: vi.fn(),
      focusVin: null,
      setFocusVin: vi.fn(),
      searchQuery: "",
      setSearchQuery: vi.fn(),
      loadSampleData: vi.fn(),
      resetDealState: mocks.reset,
      isDealDirty: true,
    };
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("retains all work when the dirty reset is canceled", async () => {
    mocks.confirm.mockResolvedValue(false);
    render(<DeskScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Reset deal" }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Previous Buyer's") })
    );
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.context.setSearchQuery).not.toHaveBeenCalled();
  });

  it("uses the shared full customer reset after confirmation", async () => {
    mocks.confirm.mockResolvedValue(true);
    render(<DeskScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Reset deal" }));
    await waitFor(() => expect(mocks.reset).toHaveBeenCalledOnce());
    expect(mocks.context.setSearchQuery).toHaveBeenCalledWith("");
  });

  it("resets untouched work without a discard prompt", async () => {
    mocks.context.isDealDirty = false;
    render(<DeskScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Reset deal" }));
    await waitFor(() => expect(mocks.reset).toHaveBeenCalledOnce());
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it.each([
    ["debt", "Monthly obligations", "desk-monthly-debt"],
    ["condition", "Vehicle condition", "desk-vehicle-condition"],
    ["fico", "Customer FICO", "desk-fico"],
    ["income", "Monthly income", "desk-income"],
    ["budget", "Customer payment budget", "desk-max-payment"],
    ["terms", "Payment calculation", "selected-term"],
    ["terms", "Payment calculation", "desk-apr"],
  ])(
    "reveals and focuses %s after closing the compact inspector",
    async (checkId, label, fieldId) => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
      );
      const vehicle = calculateFinancials(
        SAMPLE_INVENTORY[0]!,
        INITIAL_DEAL_DATA,
        INITIAL_SETTINGS
      );
      const assessment = assessDeal(
        vehicle,
        INITIAL_DEAL_DATA,
        INITIAL_FILTER_DATA,
        [],
        lenderFitForVehicle(vehicle, { ...INITIAL_DEAL_DATA, ...INITIAL_FILTER_DATA }, [])
      );
      vehicle.assessment = {
        ...assessment,
        checks: [{ id: checkId, label, status: "missing", detail: `Confirm ${label}.` }],
      };
      mocks.context.processedInventory = [vehicle];
      mocks.context.filteredInventory = [vehicle];
      mocks.context.focusVin = vehicle.vin;
      if (fieldId === "desk-apr")
        mocks.context.dealData = { ...INITIAL_DEAL_DATA, interestRate: "" };
      render(<DeskScreen />);
      fireEvent.click(screen.getByRole("button", { name: "Open inspector" }));
      const resolve = await screen.findByRole("button", { name: `Resolve ${label}` });
      resolve.focus();
      fireEvent.click(resolve);
      await waitFor(() => {
        if (fieldId === "selected-term")
          expect(document.activeElement?.textContent).toBe("Selected term");
        else expect(document.activeElement?.id).toBe(fieldId);
      });
      expect(screen.queryByRole("dialog", { name: "Deal inspector" })).toBeNull();
      if (checkId === "debt" || checkId === "condition")
        expect(document.getElementById(fieldId)).toBeTruthy();
    }
  );
});
