/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalculatedVehicle } from "../../types";

// jsdom gives the scrollport no height, so the real virtualizer renders no
// body rows. Render every row so the cells can be asserted. Both virtualizers
// are always called (hooks can't be conditional); `enabled` says which one
// the grid is actually using.
const virtualMocks = vi.hoisted(() => {
  const fake = (options: { count: number; enabled?: boolean; scrollMargin?: number }) => ({
    options: { scrollMargin: options.scrollMargin ?? 0 },
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        key: index,
        start: (options.scrollMargin ?? 0) + index * 59,
        end: (options.scrollMargin ?? 0) + (index + 1) * 59,
        size: 59,
        lane: 0,
      })),
    getTotalSize: () => options.count * 59,
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  });
  return {
    fake,
    useVirtualizer: vi.fn(fake),
    useWindowVirtualizer: vi.fn(fake),
  };
});

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: virtualMocks.useVirtualizer,
  useWindowVirtualizer: virtualMocks.useWindowVirtualizer,
}));

import { InventoryGrid } from "./InventoryGrid";

const base: CalculatedVehicle = {
  vehicle: "2020 Ford Escape SEL",
  stock: "5101",
  vin: "VIN-A",
  modelYear: 2020,
  mileage: 71478,
  price: 24500,
  jdPower: 22000,
  jdPowerRetail: 25000,
  unitCost: 20000,
  baseOutTheDoorPrice: 26323,
  make: "Ford",
  model: "Escape",
  salesTax: 1540,
  frontEndLtv: 111,
  frontEndGross: 4500,
  amountToFinance: 26323,
  otdLtv: 120,
  monthlyPayment: 473.19,
};

const renderGrid = (
  rows: CalculatedVehicle[],
  overrides: Partial<React.ComponentProps<typeof InventoryGrid>> = {}
) =>
  render(
    <InventoryGrid
      rows={rows}
      inventoryCount={rows.length}
      focusedVin={null}
      thresholds={{ warn: 115, danger: 125 }}
      searchQuery=""
      sortKey="approvalScore"
      sortDirection="desc"
      onSearchChange={vi.fn()}
      onSort={vi.fn()}
      onFocus={vi.fn()}
      onOpenInspector={vi.fn()}
      onLoadSampleData={vi.fn()}
      onClearFilters={vi.fn()}
      {...overrides}
    />
  );

/** Stub matchMedia so only the listed queries match. */
const matchQueries = (...matching: string[]) => {
  window.matchMedia = vi.fn((query: string) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

const originalMatchMedia = window.matchMedia;

const oddsCells = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-label="Odds"]'));

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  virtualMocks.useVirtualizer.mockClear();
  virtualMocks.useWindowVirtualizer.mockClear();
});

describe("InventoryGrid approval odds cell", () => {
  it("renders '—' in the subtle color with no ring fill for a pending-band unit", () => {
    const { container } = renderGrid([
      { ...base, approvalScore: 45, approvalBand: "pending", fitCount: 0, pendingCount: 13 },
    ]);
    const [cell] = oddsCells(container);
    const strong = cell?.querySelector("strong") as HTMLElement;
    expect(strong.textContent).toBe("—");
    expect(strong.style.color).toBe("var(--color-text-subtle)");
    // The dash is visual only; a screen reader hears what it means.
    expect(strong.querySelector('[aria-hidden="true"]')?.textContent).toBe("—");
    expect(cell?.querySelector(".sr-only")?.textContent).toBe(
      "Approval odds pending lender checks"
    );
    const valueArc = cell?.querySelectorAll("circle")[1];
    expect(valueArc?.getAttribute("stroke")).toBe("transparent");
    expect(cell?.textContent).not.toContain("45");
  });

  it("keeps the red number for a genuine no-fit unit and the given row order", () => {
    const { container } = renderGrid([
      { ...base, vin: "VIN-FIT", approvalScore: 80, approvalBand: "strong", fitCount: 3 },
      { ...base, vin: "VIN-PEND", approvalScore: 45, approvalBand: "pending", pendingCount: 4 },
      { ...base, vin: "VIN-NONE", approvalScore: 44, approvalBand: "none", fitCount: 0 },
    ]);
    const values = oddsCells(container).map((cell) => cell.querySelector("strong")?.textContent);
    expect(values).toEqual(["80", "—", "44"]);
    // Only the pending unit gets the screen-reader explanation.
    expect(oddsCells(container).map((cell) => cell.querySelector(".sr-only") !== null)).toEqual([
      false,
      true,
      false,
    ]);
    const noneStrong = oddsCells(container)[2]?.querySelector("strong") as HTMLElement;
    expect(noneStrong.style.color).toBe("var(--color-danger)");
  });

  it("marks both virtualizer wrappers presentational so each row stays owned by the rowgroup", () => {
    const { container } = renderGrid([base]);
    const spacer = container.querySelector(".desk-inventory-spacer");
    const wrapper = container.querySelector(".desk-virtual-row");
    expect(spacer?.getAttribute("role")).toBe("presentation");
    expect(wrapper?.getAttribute("role")).toBe("presentation");
    expect(wrapper?.querySelector('[role="row"]')).toBeTruthy();
  });

  it("splits the vehicle meta into separate parts with the stock number as the only mono text", () => {
    const { container } = renderGrid([base]);
    const meta = container.querySelector(".desk-inventory-vehicle-meta") as HTMLElement;
    expect(meta.textContent).not.toContain("·");
    expect(meta.querySelectorAll("span")).toHaveLength(3);
    expect(meta.textContent).toBe("2020 71,478 mi STK 5101");
  });

  it("does not repeat the STK prefix when the stock number already carries it", () => {
    const { container } = renderGrid([{ ...base, stock: "STK1034" }]);
    const meta = container.querySelector(".desk-inventory-vehicle-meta") as HTMLElement;
    expect(meta.textContent).toBe("2020 71,478 mi STK1034");
    expect(meta.textContent).not.toContain("STK STK");
  });
});

describe("InventoryGrid reading order", () => {
  it("puts sort state on a columnheader div that wraps a button named by the column", () => {
    const onSort = vi.fn();
    renderGrid([base], { onSort, sortKey: "price", sortDirection: "asc" });

    const priceHeader = screen.getByRole("columnheader", { name: "Price" });
    expect(priceHeader.tagName).toBe("DIV");
    expect(priceHeader.getAttribute("aria-sort")).toBe("ascending");
    const priceButton = within(priceHeader).getByRole("button", { name: "Price" });
    expect(priceButton.hasAttribute("aria-sort")).toBe(false);
    // The direction arrow is decorative; aria-sort carries the state.
    expect(priceButton.querySelector('[aria-hidden="true"]')?.textContent).toBe(" ↑");

    // Abbreviated labels keep the full name as a tooltip only.
    const otdHeader = screen.getByRole("columnheader", { name: "OTD LTV" });
    expect(otdHeader.getAttribute("aria-sort")).toBe("none");
    const otdButton = within(otdHeader).getByRole("button", { name: "OTD LTV" });
    expect(otdButton.getAttribute("title")).toBe("Out-the-door LTV");
    expect(screen.queryByRole("button", { name: /sort by/i })).toBeNull();

    fireEvent.click(otdButton);
    expect(onSort).toHaveBeenCalledWith("otdLtv");
  });

  it("names rows by their cells, with a real button per unit and aria-current on the desk", () => {
    const onFocus = vi.fn();
    const { container } = renderGrid(
      [
        { ...base, vin: "VIN-A", make: "Ford", model: "Escape", trim: "SEL" },
        { ...base, vin: "VIN-B", make: "Kia", model: "Telluride", trim: "LX" },
      ],
      { onFocus, focusedVin: "VIN-B" }
    );

    const bodyRows = Array.from(container.querySelectorAll('[role="row"][aria-rowindex]')).filter(
      (row) => row.getAttribute("aria-rowindex") !== "1"
    );
    expect(bodyRows).toHaveLength(2);
    for (const row of bodyRows) {
      expect(row.hasAttribute("aria-label")).toBe(false);
      expect(row.hasAttribute("tabindex")).toBe(false);
    }

    const escape = screen.getByRole("button", { name: "Ford Escape SEL" });
    const telluride = screen.getByRole("button", { name: "Kia Telluride LX" });
    expect(escape.closest('[role="cell"]')).toBeTruthy();
    expect(escape.hasAttribute("aria-current")).toBe(false);
    expect(telluride.getAttribute("aria-current")).toBe("true");

    fireEvent.click(escape);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenLastCalledWith("VIN-A");

    // A click elsewhere on the row still selects it (mouse convenience).
    const priceCell = bodyRows[1]?.querySelector('[data-label="Price"]') as HTMLElement;
    fireEvent.click(priceCell);
    expect(onFocus).toHaveBeenCalledTimes(2);
    expect(onFocus).toHaveBeenLastCalledWith("VIN-B");
  });

  it("hides the section numeral and announces only the result count", () => {
    const { container } = renderGrid([base]);
    expect(container.querySelector(".desk-section-index")?.getAttribute("aria-hidden")).toBe(
      "true"
    );
    expect(screen.getByRole("heading", { level: 2, name: "Inventory" })).toBeTruthy();
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("1 of 1, ranked by odds");
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    // The decorative search icon stays out of the accessibility tree.
    const icon = container.querySelector(".desk-compare-search-icon");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("drops the keyboard hint from the search placeholder on touch-only devices", () => {
    renderGrid([base]);
    expect(
      screen.getByRole("textbox", { name: "Search inventory" }).getAttribute("placeholder")
    ).toBe("Search inventory (press /)");
    cleanup();

    matchQueries("(hover: none)");
    renderGrid([base]);
    expect(
      screen.getByRole("textbox", { name: "Search inventory" }).getAttribute("placeholder")
    ).toBe("Search inventory");
  });

  it("hides the header View deal while the deal bar carries it", () => {
    const onOpenInspector = vi.fn();
    renderGrid([base], { focusedVin: base.vin, onOpenInspector });
    fireEvent.click(screen.getByRole("button", { name: "View deal" }));
    expect(onOpenInspector).toHaveBeenCalledTimes(1);
    cleanup();

    renderGrid([base], { focusedVin: base.vin, showInspectorButton: false });
    expect(screen.queryByRole("button", { name: "View deal" })).toBeNull();
  });
});

describe("InventoryGrid virtualizer by width", () => {
  it("keeps the element virtualizer above 900px", () => {
    renderGrid([base]);
    const elementCall = virtualMocks.useVirtualizer.mock.calls.at(-1)?.[0];
    const windowCall = virtualMocks.useWindowVirtualizer.mock.calls.at(-1)?.[0];
    expect(elementCall?.enabled).toBe(true);
    expect(windowCall?.enabled).toBe(false);
  });

  it("switches to the window virtualizer at 900px and below", () => {
    matchQueries("(max-width: 900px)");
    const { container } = renderGrid([base, { ...base, vin: "VIN-2" }]);
    const elementCall = virtualMocks.useVirtualizer.mock.calls.at(-1)?.[0];
    const windowCall = virtualMocks.useWindowVirtualizer.mock.calls.at(-1)?.[0];
    expect(elementCall?.enabled).toBe(false);
    expect(windowCall?.enabled).toBe(true);
    expect(typeof windowCall?.scrollMargin).toBe("number");
    // Rows are positioned relative to the list, not the document.
    const wrappers = container.querySelectorAll<HTMLElement>(".desk-virtual-row");
    expect(wrappers[0]?.style.transform).toBe("translateY(0px)");
    expect(wrappers[1]?.style.transform).toBe("translateY(59px)");
  });
});
