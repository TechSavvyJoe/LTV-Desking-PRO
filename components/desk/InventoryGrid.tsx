import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import type { CalculatedVehicle } from "../../types";
import { fmt, fmtN } from "../../utils/format";
import { CarIcon, MagnifyingGlassIcon } from "../common/Icons";
import { ScoreRing } from "../common/ScoreRing";
import { EmptyState } from "../common/states";
import {
  SORT_COLUMNS,
  bandColor,
  metaItem,
  mono,
  nameShort,
  numVal,
  otdBgFor,
  otdColorFor,
  pct,
  sansNum,
  stockLabel,
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
  /** False while DeskScreen's sticky deal bar carries the "View deal" button. */
  showInspectorButton?: boolean;
  onLoadSampleData: () => void;
  onClearFilters: () => void;
}

const kbdStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 11,
  color: "var(--color-text-muted)",
  marginRight: 3,
};

/** Phone layout: the ranked list flows in the page and the window scrolls it. */
const PHONE_QUERY = "(max-width: 900px)";
/** Touch-only devices: no keyboard, so no "(press /)" hint. */
const TOUCH_ONLY_QUERY = "(hover: none)";

const ROW_ESTIMATE = 59;
/** Stacked phone rows (vehicle line + labelled value boxes) run taller. */
const PHONE_ROW_ESTIMATE = 150;

const canMatchMedia = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() =>
    canMatchMedia() ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (!canMatchMedia()) return;
    const media = window.matchMedia(query);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, [query]);
  return matches;
};

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
  showInspectorButton = true,
  onLoadSampleData,
  onClearFilters,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasRows = rows.length > 0;
  // ≤900px the list is not a nested scroller (CSS drops its height and
  // overflow), so the window is the scroll element. Wider screens keep the
  // element virtualizer exactly as before.
  const windowMode = useMediaQuery(PHONE_QUERY);
  const touchOnly = useMediaQuery(TOUCH_ONLY_QUERY);

  // The window virtualizer needs the list's distance from the top of the
  // document. Anything above it (terms rail, filters, compare strip, the
  // getting-started card) can change height, so re-measure on resize and
  // whenever the page's own size changes.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    if (!windowMode || !hasRows) return;
    const measure = () => {
      const list = scrollRef.current;
      if (!list) return;
      const next = Math.round(list.getBoundingClientRect().top + window.scrollY);
      setScrollMargin((current) => (current === next ? current : next));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [windowMode, hasRows]);

  const elementVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 8,
    enabled: !windowMode,
  });
  const pageVirtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => PHONE_ROW_ESTIMATE,
    overscan: 4,
    scrollMargin,
    enabled: windowMode,
  });
  const virtualizer = windowMode ? pageVirtualizer : elementVirtualizer;
  const listOffset = windowMode ? scrollMargin : 0;

  // Keep the focused unit in view. The nested list scrolls on any change (as
  // before). On a phone that would scroll the whole page, so it only follows
  // a change of unit — never the first selection on load, and never a reprice
  // that reorders rows while someone is typing in the terms above.
  const lastScrolledVinRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusedVin) return;
    const previousVin = lastScrolledVinRef.current;
    lastScrolledVinRef.current = focusedVin;
    if (windowMode && (previousVin === null || previousVin === focusedVin)) return;
    const index = rows.findIndex((row) => row.vin === focusedVin);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [focusedVin, rows, virtualizer, windowMode]);

  // Header is row 1; body rows are 2..n+1 for virtualized aria-rowindex.
  const ariaRowCount = rows.length + 1;

  return (
    <section className="desk-card desk-inventory-card">
      <div className="desk-inventory-header">
        <div className="desk-inventory-title">
          <span className="desk-section-index" aria-hidden="true">
            02
          </span>
          <h2>Inventory</h2>
          {/* Polite status on the count only: a search or filter change is
              announced once, never the repriced grid. */}
          <span className="desk-inventory-meta tabular-nums" role="status">
            {rows.length} of {inventoryCount}, ranked by odds
          </span>
          <span
            className="desk-inventory-shortcut-hint"
            aria-hidden="true"
            style={{
              marginLeft: 10,
              display: "inline-flex",
              gap: 10,
              fontSize: 11,
              fontFamily: "var(--font-sans)",
              color: "var(--color-text-subtle)",
              whiteSpace: "nowrap",
            }}
          >
            <span>
              <kbd style={kbdStyle}>↑↓</kbd> navigate
            </span>
            <span>
              <kbd style={kbdStyle}>C</kbd> compare
            </span>
            <span>
              <kbd style={kbdStyle}>?</kbd> shortcuts
            </span>
          </span>
        </div>
        <div className="desk-inventory-tools">
          <div className="desk-compare-search-wrapper">
            <MagnifyingGlassIcon className="desk-compare-search-icon" />
            <input
              id="desk-search"
              className="dc-input desk-compare-search-input"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={touchOnly ? "Search inventory" : "Search inventory (press /)"}
              aria-label="Search inventory"
            />
          </div>
          {focusedVin && showInspectorButton && (
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

      <div role="table" aria-label="Ranked inventory table" aria-rowcount={ariaRowCount}>
        <div role="rowgroup">
          <div
            role="row"
            aria-rowindex={1}
            aria-label="Column headers"
            className="desk-inventory-columns"
          >
            {SORT_COLUMNS.map((column, index) => {
              const active = column.key === sortKey;
              const align = index === 0 ? "left" : "right";
              // The header cell carries the sort state; the button inside is
              // named by the column alone, so every cell below is read under
              // "Price", not "Sort by price".
              return (
                <div
                  key={column.key}
                  role="columnheader"
                  aria-sort={
                    active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"
                  }
                  className="min-w-0"
                  style={{ textAlign: align }}
                >
                  <button
                    type="button"
                    className="w-full"
                    onClick={() => onSort(column.key)}
                    title={column.fullName}
                    data-align={align}
                  >
                    {column.label}
                    {active && (
                      <span aria-hidden="true">{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {rows.length > 0 && (
          <div role="rowgroup" ref={scrollRef} className="desk-inventory-scroll">
            <div
              role="presentation"
              className="desk-inventory-spacer"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const vehicle = rows[virtualRow.index];
                if (!vehicle) return null;
                const focused = vehicle.vin === focusedVin;
                const score = vehicle.approvalScore ?? 0;
                const scoreColor = bandColor(vehicle);
                // Pending lender checks: odds are unknown, so no number and no
                // ring fill. The numeric score still drives the sort (unchanged).
                const pending = vehicle.approvalBand === "pending";

                return (
                  <div
                    key={vehicle.vin}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    role="presentation"
                    className="desk-virtual-row"
                    style={{ transform: `translateY(${virtualRow.start - listOffset}px)` }}
                  >
                    {/* No row name: the cells are the content. The vehicle
                        cell holds the one real control (a button), and the
                        unit on the desk is marked aria-current. A click
                        anywhere else on the row is a mouse convenience. */}
                    <div
                      role="row"
                      aria-rowindex={virtualRow.index + 2}
                      className="inv-row desk-inventory-row"
                      data-focused={focused}
                      onClick={(event) => {
                        if ((event.target as Element).closest?.("button")) return;
                        onFocus(vehicle.vin);
                      }}
                    >
                      <div role="cell" className="desk-inventory-vehicle">
                        <button
                          type="button"
                          className="desk-inventory-vehicle-btn block w-full cursor-pointer text-left"
                          aria-current={focused ? "true" : undefined}
                          onClick={() => onFocus(vehicle.vin)}
                        >
                          <span className="desk-inventory-vehicle-name">{nameShort(vehicle)}</span>
                        </button>
                        <div className="desk-inventory-vehicle-meta">
                          <span style={{ ...metaItem, ...sansNum }}>{vehicle.modelYear}</span>{" "}
                          <span style={{ ...metaItem, ...sansNum }}>
                            {typeof vehicle.mileage === "number" ? fmtN(vehicle.mileage) : "—"} mi
                          </span>{" "}
                          <span style={{ fontFamily: mono }}>{stockLabel(vehicle.stock)}</span>
                        </div>
                      </div>
                      <span
                        role="cell"
                        data-label="Price"
                        className="desk-inventory-cell"
                        style={sansNum}
                      >
                        {numVal(vehicle.price) === null ? "—" : fmt(vehicle.price as number)}
                      </span>
                      <span
                        role="cell"
                        data-label="F-LTV"
                        className="desk-inventory-cell desk-inventory-cell-muted"
                        style={sansNum}
                      >
                        {pct(vehicle.frontEndLtv)}
                      </span>
                      <span
                        role="cell"
                        data-label="Financed"
                        className="desk-inventory-cell desk-inventory-cell-strong"
                        style={sansNum}
                      >
                        {numVal(vehicle.amountToFinance) === null
                          ? "—"
                          : fmt(vehicle.amountToFinance as number)}
                      </span>
                      <span
                        role="cell"
                        data-label="OTD LTV"
                        className="desk-inventory-cell desk-inventory-otd"
                        style={sansNum}
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
                        style={sansNum}
                      >
                        {numVal(vehicle.monthlyPayment) === null
                          ? "—"
                          : `${fmt(vehicle.monthlyPayment as number)}/mo`}
                      </span>
                      <span
                        role="cell"
                        data-label="Odds"
                        className="desk-inventory-odds"
                        title={pending ? "Pending lender checks" : undefined}
                      >
                        <strong style={{ ...sansNum, color: scoreColor }}>
                          {pending ? <span aria-hidden="true">—</span> : score}
                        </strong>
                        {pending && (
                          <span className="sr-only">Approval odds pending lender checks</span>
                        )}
                        <ScoreRing
                          score={pending ? 0 : score}
                          size={20}
                          colorVar={pending ? "transparent" : scoreColor}
                        />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {rows.length === 0 && (
        <EmptyState
          headingLevel={3}
          icon={inventoryCount === 0 ? <CarIcon className="w-full h-full" /> : undefined}
          title={inventoryCount === 0 ? "No inventory yet" : "No vehicles match"}
          description={
            inventoryCount === 0
              ? "Import inventory on the Inventory screen, or load sample data to try the desk."
              : "Clear the filters or change your search."
          }
          primaryAction={
            inventoryCount === 0
              ? { label: "Load sample data", onClick: onLoadSampleData }
              : { label: "Clear filters", onClick: onClearFilters }
          }
        />
      )}
    </section>
  );
};

export const InventoryGrid = React.memo(InventoryGridBase);
InventoryGrid.displayName = "InventoryGrid";
