/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalculatedVehicle } from "../../types";

const mocks = vi.hoisted(() => ({
  inventory: [] as CalculatedVehicle[],
  focusVin: null as string | null,
  sort: { key: "price", direction: "desc" } as { key: string; direction: "asc" | "desc" },
  setInventorySort: vi.fn(),
  setFocusVin: vi.fn(),
  setActiveVehicle: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("../../lib/pocketbase", () => ({
  getCurrentUser: () => ({ role: "sales" }),
}));

vi.mock("../../hooks/useInventoryImport", () => ({
  useInventoryImport: () => ({
    fileInputRef: { current: null },
    isUploadingInventory: false,
    handleFileUpload: vi.fn(),
    downloadSampleCsv: vi.fn(),
    vinLookup: "",
    setVinLookup: vi.fn(),
    vinLookupResult: "",
    isVinLoading: false,
    handleVinLookup: vi.fn(),
    handleDownloadFavorites: vi.fn(),
  }),
}));

vi.mock("../../context/DealContext", () => ({
  useDealContext: () => ({
    settings: { ltvThresholds: { warn: 115, danger: 125, critical: 135 } },
    inventory: mocks.inventory,
    sortedInventory: mocks.inventory,
    inventorySort: mocks.sort,
    setInventorySort: mocks.setInventorySort,
    searchQuery: "",
    setSearchQuery: vi.fn(),
    setFilters: vi.fn(),
    focusVin: mocks.focusVin,
    setFocusVin: mocks.setFocusVin,
    setActiveVehicle: mocks.setActiveVehicle,
    safeLenderProfiles: [],
  }),
}));

import InventoryScreen from "./InventoryScreen";

const unit = (vin: string, over: Partial<CalculatedVehicle> = {}): CalculatedVehicle => ({
  vehicle: `2021 Ford Escape ${vin}`,
  stock: `S${vin}`,
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
  approvalScore: 80,
  approvalBand: "strong",
  fitCount: 3,
  ...over,
});

beforeEach(() => {
  mocks.inventory = [unit("A"), unit("B", { approvalBand: "pending", stock: "STK1034" })];
  mocks.focusVin = null;
  mocks.sort = { key: "price", direction: "desc" };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InventoryScreen sort headers", () => {
  it("exposes aria-sort on the columnheader and a real button inside it", () => {
    render(<InventoryScreen />);

    const priceHeader = screen.getByRole("columnheader", { name: /^Price/ });
    expect(priceHeader.tagName).toBe("DIV");
    expect(priceHeader.getAttribute("aria-sort")).toBe("descending");

    // The sort control is a real button named by the column only (no "Sort by …").
    const priceButton = within(priceHeader).getByRole("button", { name: "Price" });
    expect(priceButton.tagName).toBe("BUTTON");
    expect(priceButton.hasAttribute("aria-sort")).toBe(false);

    // Unsorted columns say so, and the columnheader is not itself the button.
    const vehicleHeader = screen.getByRole("columnheader", { name: "Vehicle" });
    expect(vehicleHeader.getAttribute("aria-sort")).toBe("none");
    expect(vehicleHeader.tagName).not.toBe("BUTTON");

    fireEvent.click(priceButton);
    expect(mocks.setInventorySort).toHaveBeenCalledTimes(1);
  });

  it("marks the header row so CSS can hide it when the table stacks", () => {
    render(<InventoryScreen />);
    const headerRow = screen.getAllByRole("row")[0] as HTMLElement;
    expect(headerRow.className).toContain("inventory-screen-columns");
  });
});

describe("InventoryScreen rows", () => {
  it("opens a unit from a real button in the vehicle cell, not a labelled row", () => {
    mocks.focusVin = "A";
    render(<InventoryScreen />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.hasAttribute("aria-label")).toBe(false);
      expect(row.hasAttribute("tabindex")).toBe(false);
    }

    const focused = screen.getByRole("button", { name: "2021 Ford Escape A" });
    expect(focused.getAttribute("aria-current")).toBe("true");
    expect(
      screen.getByRole("button", { name: "2021 Ford Escape B" }).hasAttribute("aria-current")
    ).toBe(false);

    fireEvent.click(focused);
    expect(mocks.setFocusVin).toHaveBeenCalledTimes(1);
    expect(mocks.setFocusVin).toHaveBeenCalledWith("A");
    expect(mocks.navigate).toHaveBeenCalledWith("/desk");
  });

  it("labels body cells for the stacked layout and tags the columns hidden on phones", () => {
    render(<InventoryScreen />);
    const row = screen.getAllByRole("row")[1] as HTMLElement;
    for (const key of ["book", "front-ltv", "lenders"]) {
      expect(row.querySelector(`[data-col="${key}"]`)).not.toBeNull();
    }
    expect(row.querySelector('[data-col="price"]')?.getAttribute("data-label")).toBe("Price");
    expect(row.querySelector('[data-col="otd-ltv"]')?.getAttribute("data-label")).toBe("OTD LTV");
  });

  it("says why a pending approval has no number, and keeps the dash out of the reading", () => {
    render(<InventoryScreen />);
    const cell = screen
      .getAllByRole("row")[2]
      ?.querySelector('[data-col="approval"]') as HTMLElement;
    expect(cell.querySelector('[aria-hidden="true"]')?.textContent).toBe("—");
    expect(cell.querySelector(".sr-only")?.textContent).toBe("Approval odds pending lender checks");
  });

  it("does not repeat the STK prefix", () => {
    render(<InventoryScreen />);
    expect(screen.getByText("STK1034")).toBeTruthy();
    expect(screen.getByText("STK SA")).toBeTruthy();
    expect(screen.queryByText(/STK STK/)).toBeNull();
  });
});

describe("InventoryScreen toolbar and live regions", () => {
  it("announces the result count as a status", () => {
    render(<InventoryScreen />);
    const count = screen.getByText(/2 of 2 units/);
    expect(count.getAttribute("role")).toBe("status");
  });

  it("names the sample CSV and Compare PDF buttons with a verb, keeping the visible label", () => {
    render(<InventoryScreen />);
    const sample = screen.getByRole("button", { name: "Download sample CSV" });
    expect(sample.textContent).toBe("Sample CSV");
    const pdf = screen.getByRole("button", { name: "Download Compare PDF" });
    expect(pdf.textContent).toBe("Compare PDF");
  });

  it("titles the empty state as an h2 under the page's h1", () => {
    mocks.inventory = [];
    render(<InventoryScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "Inventory" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "No inventory yet" })).toBeTruthy();
  });
});
