import React, { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { CalculatedVehicle } from "../../types";
import { fmt, fmtN } from "../../utils/format";
import { CarIcon, MagnifyingGlassIcon } from "../common/Icons";
import { ScoreRing } from "../common/ScoreRing";
import { EmptyState } from "../common/states";
import {
  SORT_COLUMNS,
  bandColor,
  nameShort,
  numVal,
  otdBgFor,
  otdColorFor,
  pct,
} from "./deskConstants";
import type { SortKey } from "./deskConstants";

interface InventoryGridProps {
  rows: CalculatedVehicle[];
  inventoryCount: number;
  focusedVin: string | null;
  thresholds: { warn: number; danger: number };
  searchQuery: string;
  sortKey: SortKey;
  sortDirection: "asc" | "desc";
  onSearchChange: (value: string) => void;
  onSort: (key: SortKey) => void;
  onFocus: (vin: string) => void;
  onOpenInspector: () => void;
  onLoadSampleData: () => void;
  onClearFilters: () => void;
}

const InventoryGridBase: React.FC<InventoryGridProps> = ({
  rows,
  inventoryCount,
  focusedVin,
  thresholds,
  searchQuery,
  sortKey,
  sortDirection,
  onSearchChange,
  onSort,
  onFocus,
  onOpenInspector,
  onLoadSampleData,
  onClearFilters,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 59,
    overscan: 8,
  });

  useEffect(() => {
    if (!focusedVin) return;
    const index = rows.findIndex((row) => row.vin === focusedVin);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [focusedVin, rows, virtualizer]);

  // Header is row 1; body rows are 2..n+1 for virtualized aria-rowindex.
  const ariaRowCount = rows.length + 1;

  return (
    <section
      role="table"
      aria-label="Ranked inventory table"
      aria-rowcount={ariaRowCount}
      className="desk-card desk-inventory-card"
    >
      <div className="desk-inventory-header">
        <div className="desk-inventory-title">
          <span className="desk-section-index">02</span>
          <h2>Inventory</h2>
          <span className="desk-inventory-meta">
            {rows.length} of {inventoryCount} · ranked by odds
          </span>
          <span
            className="desk-inventory-shortcut-hint"
            aria-hidden="true"
            style={{
              marginLeft: 10,
              fontSize: 11,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: "var(--color-text-subtle)",
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
            }}
          >
            ↑↓ navigate · C compare · ? shortcuts
          </span>
        </div>
        <div className="desk-inventory-tools">
          <div className="desk-compare-search-wrapper">
            <MagnifyingGlassIcon className="desk-compare-search-icon" aria-hidden="true" />
            <input
              id="desk-search"
              className="dc-input desk-compare-search-input"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search inventory · press /"
              aria-label="Search inventory"
            />
          </div>
          {focusedVin && (
            <button
              type="button"
              className="desk-mobile-inspector-btn transition-colors"
              onClick={onOpenInspector}
            >
              View deal
            </button>
          )}
        </div>
      </div>

      <div role="rowgroup">
        <div
          role="row"
          aria-rowindex={1}
          aria-label="Column headers"
          className="desk-inventory-columns"
        >
          {SORT_COLUMNS.map((column, index) => {
            const active = column.key === sortKey;
            return (
              <button
                key={column.key}
                type="button"
                onClick={() => onSort(column.key)}
                title={column.title}
                role="columnheader"
                aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                aria-label={
                  active
                    ? `${column.title}, sorted ${sortDirection === "asc" ? "ascending" : "descending"}`
                    : column.title
                }
                data-align={index === 0 ? "left" : "right"}
              >
                {column.label}
                {active ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
              </button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={inventoryCount === 0 ? <CarIcon className="w-full h-full" /> : undefined}
          title={inventoryCount === 0 ? "No inventory yet" : "No vehicles match"}
          description={
            inventoryCount === 0
              ? "Import vehicles from the Inventory tab or load sample data."
              : "No vehicles match the current filters or search."
          }
          primaryAction={
            inventoryCount === 0
              ? { label: "Load sample data", onClick: onLoadSampleData }
              : { label: "Clear filters", onClick: onClearFilters }
          }
        />
      ) : (
        <div role="rowgroup" ref={scrollRef} className="desk-inventory-scroll">
          <div className="desk-inventory-spacer" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const vehicle = rows[virtualRow.index];
              if (!vehicle) return null;
              const focused = vehicle.vin === focusedVin;
              const score = vehicle.approvalScore ?? 0;
              const scoreColor = bandColor(vehicle);

              return (
                <div
                  key={vehicle.vin}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="desk-virtual-row"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <div
                    role="row"
                    aria-rowindex={virtualRow.index + 2}
                    className="inv-row desk-inventory-row"
                    data-focused={focused}
                    tabIndex={0}
                    onClick={() => onFocus(vehicle.vin)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onFocus(vehicle.vin);
                      }
                    }}
                    aria-label={`Focus ${vehicle.vehicle} on desk`}
                  >
                    <div role="cell" className="desk-inventory-vehicle">
                      <div className="desk-inventory-vehicle-name">{nameShort(vehicle)}</div>
                      <div className="desk-inventory-vehicle-meta">
                        {vehicle.modelYear} ·{" "}
                        {typeof vehicle.mileage === "number" ? fmtN(vehicle.mileage) : "—"} mi · STK{" "}
                        {vehicle.stock}
                      </div>
                    </div>
                    <span role="cell" data-label="Price" className="desk-inventory-cell">
                      {numVal(vehicle.price) === null ? "—" : fmt(vehicle.price as number)}
                    </span>
                    <span
                      role="cell"
                      data-label="F-LTV"
                      className="desk-inventory-cell desk-inventory-cell-muted"
                    >
                      {pct(vehicle.frontEndLtv)}
                    </span>
                    <span
                      role="cell"
                      data-label="Financed"
                      className="desk-inventory-cell desk-inventory-cell-strong"
                    >
                      {numVal(vehicle.amountToFinance) === null
                        ? "—"
                        : fmt(vehicle.amountToFinance as number)}
                    </span>
                    <span
                      role="cell"
                      data-label="OTD LTV"
                      className="desk-inventory-cell desk-inventory-otd"
                    >
                      <span
                        style={{
                          color: otdColorFor(vehicle.otdLtv, thresholds),
                          background: otdBgFor(vehicle.otdLtv, thresholds),
                        }}
                      >
                        {pct(vehicle.otdLtv)}
                      </span>
                    </span>
                    <span
                      role="cell"
                      data-label="Payment"
                      className="desk-inventory-cell desk-inventory-cell-muted"
                    >
                      {numVal(vehicle.monthlyPayment) === null
                        ? "—"
                        : `${fmt(vehicle.monthlyPayment as number)}/mo`}
                    </span>
                    <span role="cell" data-label="Odds" className="desk-inventory-odds">
                      <strong style={{ color: scoreColor }}>{score}</strong>
                      <ScoreRing score={score} size={20} colorVar={scoreColor} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export const InventoryGrid = React.memo(InventoryGridBase);
InventoryGrid.displayName = "InventoryGrid";
