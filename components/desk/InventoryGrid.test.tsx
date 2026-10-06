/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalculatedVehicle } from "../../types";

// jsdom gives the scrollport no height, so the real virtualizer renders no
// body rows. Render every row so the cells can be asserted.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 59,
        end: (index + 1) * 59,
        size: 59,
        lane: 0,
      })),
    getTotalSize: () => count * 59,
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  }),
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

const renderGrid = (rows: CalculatedVehicle[]) =>
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
    />
  );

const oddsCells = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-label="Odds"]'));

afterEach(cleanup);

describe("InventoryGrid approval odds cell", () => {
  it("renders '—' in the subtle color with no ring fill for a pending-band unit", () => {
    const { container } = renderGrid([
      { ...base, approvalScore: 45, approvalBand: "pending", fitCount: 0, pendingCount: 13 },
    ]);
    const [cell] = oddsCells(container);
    const strong = cell?.querySelector("strong") as HTMLElement;
    expect(strong.textContent).toBe("—");
    expect(strong.style.color).toBe("var(--color-text-subtle)");
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
    const noneStrong = oddsCells(container)[2]?.querySelector("strong") as HTMLElement;
    expect(noneStrong.style.color).toBe("var(--color-danger)");
  });
});
