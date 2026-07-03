import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useDealContext } from "../../context/DealContext";
import { useInventoryImport } from "../../hooks/useInventoryImport";
import { activeLenderCount } from "../../services/lenderFit";
import { BAND_META } from "../../services/approvalScorer";
import { ScoreRing } from "../common/ScoreRing";
import { EmptyState } from "../common/states";
import * as Icons from "../common/Icons";
import { fmt, fmtN } from "../../utils/format";
import type { CalculatedVehicle } from "../../types";

const mono = "var(--mono)";

/** 9-col grid per the mockup's INVENTORY table (lines 505/512). */
const GRID = "2.8fr 1fr 1fr 0.95fr 1.15fr 0.95fr 1.05fr 0.8fr 1fr";

const numVal = (v: number | "Error" | "N/A" | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const pctOrDash = (v: number | "Error" | "N/A"): string => {
  const n = numVal(v);
  return n === null ? "—" : `${Math.round(n)}%`;
};

/** Mockup lendersColor: ≥4 success · ≥1 warning · 0 danger. */
const lendersColor = (c: number): string =>
  c >= 4 ? "var(--color-success)" : c >= 1 ? "var(--color-warning)" : "var(--color-danger)";

/** Sortable columns — CalculatedVehicle keys + the mockup's default directions. */
const COLUMNS: {
  key: keyof CalculatedVehicle;
  label: string;
  defaultDir: "asc" | "desc";
  right: boolean;
  title?: string;
}[] = [
  { key: "vehicle", label: "VEHICLE", defaultDir: "asc", right: false },
  { key: "price", label: "PRICE", defaultDir: "desc", right: true },
  {
    key: "jdPower",
    label: "BOOK·T",
    defaultDir: "desc",
    right: true,
    title: "J.D. Power Trade — retail used per lender where configured",
  },
  { key: "frontEndLtv", label: "FRONT LTV", defaultDir: "desc", right: true },
  { key: "amountToFinance", label: "FINANCED", defaultDir: "desc", right: true },
  { key: "otdLtv", label: "OTD LTV", defaultDir: "desc", right: true },
  { key: "monthlyPayment", label: "PAYMENT", defaultDir: "desc", right: true },
  { key: "fitCount", label: "LENDERS", defaultDir: "desc", right: true },
  { key: "approvalScore", label: "APPROVAL", defaultDir: "desc", right: true },
];

const ghostBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--color-border-strong)",
  color: "var(--color-text)",
  borderRadius: 8,
  padding: "6px 11px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

/**
 * Inventory screen — the full 9-col sortable table of the INVENTORY block
 * (LTV Desking PRO.dc.html lines 484-539), priced against the live deal by
 * DealContext's single scoring pass, plus the import/VIN/favorites toolbar
 * (features preserved per reconciliation 11). Row click focuses the unit on
 * the desk. [Phase 6]
 */
export const InventoryScreen: React.FC = () => {
  const {
    settings,
    inventory,
    sortedInventory,
    inventorySort,
    setInventorySort,
    searchQuery,
    setSearchQuery,
    setFilters,
    focusVin,
    setFocusVin,
    setActiveVehicle,
    safeLenderProfiles,
  } = useDealContext();

  const {
    fileInputRef,
    isUploadingInventory,
    handleFileUpload,
    downloadSampleCsv,
    vinLookup,
    setVinLookup,
    vinLookupResult,
    isVinLoading,
    handleVinLookup,
    handleDownloadFavorites,
  } = useInventoryImport();

  const navigate = useNavigate();
  const totalLenders = activeLenderCount(safeLenderProfiles);
  const { warn, danger } = settings.ltvThresholds;

  // OTD LTV colors come from settings.ltvThresholds — never hardcoded 115/125.
  const otdColor = (v: number | "Error" | "N/A"): string => {
    const n = numVal(v);
    if (n === null) return "var(--color-text-subtle)";
    return n >= danger
      ? "var(--color-danger)"
      : n >= warn
        ? "var(--color-warning)"
        : "var(--color-success)";
  };
  const otdBg = (v: number | "Error" | "N/A"): string => {
    const n = numVal(v);
    if (n === null) return "transparent";
    return n >= danger
      ? "var(--color-danger-subtle)"
      : n >= warn
        ? "var(--color-warning-subtle)"
        : "var(--color-success-subtle)";
  };

  // `/` focuses the inventory search (mockup's global key handler, scoped here).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const tag = ((e.target as HTMLElement | null)?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      e.preventDefault();
      document.getElementById("inv-search")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- VIN decode popover ----------------------------------------------------
  const [vinOpen, setVinOpen] = useState(false);
  const vinRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!vinOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (vinRef.current && !vinRef.current.contains(e.target as Node)) setVinOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVinOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [vinOpen]);

  const handleSort = (key: keyof CalculatedVehicle, defaultDir: "asc" | "desc") => {
    setInventorySort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: defaultDir }
    );
  };

  const sortArrow = (key: keyof CalculatedVehicle): string =>
    inventorySort.key === key ? (inventorySort.direction === "asc" ? " ↑" : " ↓") : "";

  const openOnDesk = (v: CalculatedVehicle) => {
    setFocusVin(v.vin);
    setActiveVehicle(v);
    navigate("/desk");
  };

  const clearFilters = () => {
    setSearchQuery("");
    // Clear the inventory-facing filters only — customer credit/income are deal
    // inputs, not inventory filters, so they survive (matches the desk's Clear).
    setFilters((f) => ({
      ...f,
      vehicle: "",
      maxPrice: null,
      maxPayment: null,
      maxMiles: null,
      maxOtdLtv: null,
      vin: "",
      minScore: null,
    }));
  };

  // --- Virtualized rows (reconciliation 13 — mockup has no pager) -------------
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useWindowVirtualizer({
    count: sortedInventory.length,
    estimateSize: () => 64,
    overscan: 12,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  const hasInventory = inventory.length > 0;
  const noResults = hasInventory && sortedInventory.length === 0;

  return (
    <div data-screen-label="Inventory">
      {/* Sub-header — mockup lines 486-499 + the preserved import toolbar */}
      <header
        style={{
          height: 58,
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <span
            style={{
              fontSize: 11,
              fontFamily: mono,
              letterSpacing: "0.18em",
              color: "var(--color-text-subtle)",
            }}
          >
            INVENTORY
          </span>
          <div style={{ height: 20, width: 1, background: "var(--color-border)" }} />
          <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap" }}>
            {sortedInventory.length} of {inventory.length} units
          </span>
          <span
            style={{
              fontSize: 13,
              color: "var(--color-text-subtle)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            priced against the live deal · click any row to structure
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Import CSV/XLSX (hidden file input) */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            onChange={handleFileUpload}
            style={{ display: "none" }}
            aria-hidden="true"
            tabIndex={-1}
          />
          <button
            className="lift-btn"
            style={{ ...ghostBtnStyle, opacity: isUploadingInventory ? 0.6 : 1 }}
            disabled={isUploadingInventory}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploadingInventory ? "Importing…" : "Import CSV/XLSX"}
          </button>

          <button className="lift-btn" style={ghostBtnStyle} onClick={downloadSampleCsv}>
            Sample CSV
          </button>

          {/* VIN decode popover */}
          <div ref={vinRef} style={{ position: "relative" }}>
            <button
              className="lift-btn"
              style={ghostBtnStyle}
              aria-haspopup="dialog"
              aria-expanded={vinOpen}
              onClick={() => setVinOpen((v) => !v)}
            >
              VIN decode
            </button>
            {vinOpen && (
              <div
                role="dialog"
                aria-label="VIN decode"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  width: 268,
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  boxShadow: "var(--shadow-md)",
                  padding: 13,
                  zIndex: 40,
                }}
              >
                <label
                  htmlFor="inv-vin-decode"
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--color-text-muted)",
                    marginBottom: 5,
                  }}
                >
                  Decode a VIN into inventory
                </label>
                <div style={{ display: "flex", gap: 7 }}>
                  <input
                    id="inv-vin-decode"
                    className="dc-input"
                    value={vinLookup}
                    maxLength={17}
                    onChange={(e) => setVinLookup(e.target.value.toUpperCase().trim())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isVinLoading) void handleVinLookup();
                    }}
                    placeholder="17-character VIN"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: "var(--color-bg-subtle)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      padding: "7px 10px",
                      fontSize: 12.5,
                      color: "var(--color-text)",
                      fontFamily: mono,
                      outline: "none",
                    }}
                  />
                  <button
                    className="lift-btn btn-primary"
                    style={{
                      border: "1px solid transparent",
                      borderRadius: 8,
                      padding: "7px 12px",
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      opacity: isVinLoading ? 0.6 : 1,
                    }}
                    disabled={isVinLoading}
                    onClick={() => void handleVinLookup()}
                  >
                    {isVinLoading ? "…" : "Decode"}
                  </button>
                </div>
                {vinLookupResult && (
                  <div
                    role="status"
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      lineHeight: 1.4,
                      color: vinLookupResult.startsWith("Error")
                        ? "var(--color-danger)"
                        : "var(--color-success)",
                    }}
                  >
                    {vinLookupResult}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            className="lift-btn"
            style={ghostBtnStyle}
            title="Export the compared (pinned) vehicles as a PDF"
            onClick={() => void handleDownloadFavorites()}
          >
            Favorites PDF
          </button>

          {/* Search — bound to the shared context query (mockup line 496) */}
          <div style={{ position: "relative" }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text-subtle)"
              strokeWidth="2"
              aria-hidden="true"
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              id="inv-search"
              className="dc-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search inventory · press /"
              aria-label="Search inventory"
              style={{
                background: "var(--color-bg-subtle)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: "7px 11px 7px 30px",
                fontSize: 13,
                color: "var(--color-text)",
                fontFamily: "inherit",
                outline: "none",
                width: 250,
              }}
            />
          </div>
        </div>
      </header>

      <div style={{ padding: "20px 24px" }}>
        <div
          style={{
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            boxShadow: "var(--shadow)",
            overflow: "hidden",
          }}
        >
          {/* Column headers — sortable with per-key default directions */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRID,
              columnGap: 14,
              alignItems: "center",
              padding: "11px 20px",
              background: "var(--color-bg-subtle)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            {COLUMNS.map((col) => (
              <span
                key={col.key as string}
                onClick={() => handleSort(col.key, col.defaultDir)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSort(col.key, col.defaultDir);
                  }
                }}
                title={col.title}
                role="button"
                tabIndex={0}
                aria-label={`Sort by ${col.label}`}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  fontFamily: mono,
                  color: "var(--color-text-subtle)",
                  textAlign: col.right ? "right" : "left",
                  cursor: "pointer",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {col.label}
                {sortArrow(col.key)}
              </span>
            ))}
          </div>

          {/* Import-first empty state — no inventory at all */}
          {!hasInventory && (
            <EmptyState
              icon={<Icons.CarIcon className="w-full h-full" />}
              title="No inventory yet"
              description="Import your dealership's CSV or Excel feed and every unit gets priced against the live deal — payment, LTV, lender fit and approval odds."
              primaryAction={{
                label: "Import CSV/XLSX",
                onClick: () => fileInputRef.current?.click(),
              }}
              secondaryAction={{ label: "Download sample CSV", onClick: downloadSampleCsv }}
            />
          )}

          {/* No matches — mockup lines 530-535 */}
          {noResults && (
            <div
              style={{
                padding: "44px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 13.5, color: "var(--color-text-muted)" }}>
                No vehicles match the current filters or search.
              </span>
              <button
                onClick={clearFilters}
                className="lift-btn"
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-border-strong)",
                  color: "var(--color-text)",
                  borderRadius: 8,
                  padding: "7px 14px",
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Clear filters
              </button>
            </div>
          )}

          {/* Rows — window-virtualized (no pager, per the mockup) */}
          {sortedInventory.length > 0 && (
            <div ref={listRef}>
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualizer.getVirtualItems().map((item) => {
                  const v = sortedInventory[item.index];
                  if (!v) return null;
                  const isFocused = focusVin === v.vin;
                  const fitCount = v.fitCount ?? 0;
                  const score = v.approvalScore ?? 0;
                  const ring = BAND_META[v.approvalBand ?? "none"].colorVar;
                  return (
                    <div
                      key={v.vin}
                      data-index={item.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                      }}
                    >
                      <div
                        className="inv-row"
                        onClick={() => openOnDesk(v)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openOnDesk(v);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Structure ${v.vehicle} on the desk`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: GRID,
                          columnGap: 14,
                          alignItems: "center",
                          padding: "12px 20px",
                          borderBottom: "1px solid var(--color-border)",
                          cursor: "pointer",
                          borderLeft: `3px solid ${isFocused ? "var(--color-primary)" : "transparent"}`,
                          background: isFocused ? "var(--color-primary-subtle)" : "transparent",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14.5,
                              fontWeight: 600,
                              letterSpacing: "-0.01em",
                              lineHeight: 1.25,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {v.vehicle}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--color-text-subtle)",
                              fontFamily: mono,
                              marginTop: 3,
                            }}
                          >
                            STK {v.stock} ·{" "}
                            {typeof v.mileage === "number" ? fmtN(v.mileage) : "—"} mi
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 14,
                            textAlign: "right",
                            fontFamily: mono,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {numVal(v.price) === null ? "—" : fmt(v.price as number)}
                        </span>
                        <span
                          style={{
                            fontSize: 14,
                            textAlign: "right",
                            fontFamily: mono,
                            fontVariantNumeric: "tabular-nums",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {numVal(v.jdPower) === null ? "—" : fmt(v.jdPower as number)}
                        </span>
                        <span
                          style={{
                            fontSize: 14,
                            textAlign: "right",
                            fontFamily: mono,
                            fontVariantNumeric: "tabular-nums",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {pctOrDash(v.frontEndLtv)}
                        </span>
                        <span
                          style={{
                            fontSize: 14.5,
                            textAlign: "right",
                            fontFamily: mono,
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 600,
                          }}
                        >
                          {numVal(v.amountToFinance) === null
                            ? "—"
                            : fmt(v.amountToFinance as number)}
                        </span>
                        <span style={{ textAlign: "right" }}>
                          <span
                            style={{
                              fontSize: 13,
                              fontFamily: mono,
                              fontVariantNumeric: "tabular-nums",
                              fontWeight: 600,
                              color: otdColor(v.otdLtv),
                              background: otdBg(v.otdLtv),
                              padding: "3px 8px",
                              borderRadius: 6,
                            }}
                          >
                            {pctOrDash(v.otdLtv)}
                          </span>
                        </span>
                        <span
                          style={{
                            fontSize: 14,
                            textAlign: "right",
                            fontFamily: mono,
                            fontVariantNumeric: "tabular-nums",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {numVal(v.monthlyPayment) === null
                            ? "—"
                            : `${fmt(v.monthlyPayment as number)}/mo`}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            textAlign: "right",
                            fontFamily: mono,
                            fontWeight: 600,
                            color: lendersColor(fitCount),
                          }}
                        >
                          {fitCount}/{totalLenders}
                        </span>
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            gap: 9,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 14.5,
                              fontWeight: 700,
                              fontFamily: mono,
                              color: ring,
                              minWidth: 20,
                              textAlign: "right",
                            }}
                          >
                            {score}
                          </span>
                          <ScoreRing score={score} size={22} colorVar={ring} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventoryScreen;
