import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDealContext } from "../../context/DealContext";
import { calculateFinancials } from "../../services/calculator";
import {
  applyBackendProductPatch,
  getBackendProductSplit,
  parseMoneyInput,
} from "../../services/backendProducts";
import { lenderFitForVehicle, activeLenderCount } from "../../services/lenderFit";
import type { LenderFitEntry } from "../../services/lenderFit";
import { APPROVAL_CONFIG, BAND_META } from "../../services/approvalScorer";
import { ApprovalGauge } from "../common/ApprovalGauge";
import { ScoreRing } from "../common/ScoreRing";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { useDeskShortcuts } from "../../hooks/useDeskShortcuts";
import { useSaveDeal } from "../../hooks/useSaveDeal";
import { fmt, fmtN, splitPay } from "../../utils/format";
import { logDealEvent } from "../../lib/api";
import { capture } from "../../lib/analytics";
import { toast } from "../../lib/toast";
import { INITIAL_DEAL_DATA, INITIAL_FILTER_DATA } from "../../constants";
import { EmptyState } from "../common/states";
import * as Icons from "../common/Icons";
// Lazy load DealSheetModal (contains PDF generation deps) so it is only loaded
// when user opens the deal sheet — shrinks initial desk payload.
const DealSheetModal = lazy(() =>
  import("./DealSheetModal").then((m) => ({ default: m.default || m.DealSheetModal }))
);
import type {
  AppState,
  ApprovalBand,
  CalculatedVehicle,
  DealData,
  FilterData,
  LenderProfile,
  Settings,
} from "../../types";

import {
  SORT_COLUMNS,
  DEFAULT_DIR,
  isSortKey,
  bandColor,
  nameShort,
  mono,
  cardStyle,
  numVal,
  otdColorFor,
  otdBgFor,
  pct,
  GRID,
} from "./deskConstants";
import type { SortKey } from "./deskConstants";
import { DeskTermsRail } from "./DeskTermsRail";
import { DealInspector } from "./DealInspector";

// Lazy so the OCR path (and tesseract.js behind it) stays out of the main
// bundle — DocumentScanner itself dynamic-imports tesseract on first scan.
const DocumentScanner = lazy(() =>
  import("../DocumentScanner").then((m) => ({ default: m.DocumentScanner }))
);

/**
 * The Desk — the redesign's signature screen, per LTV Desking PRO.dc.html
 * lines 183-481. Deal terms reprice all inventory live (DealContext's single
 * scoring pass); the compare strip, ranked inventory table, and focused panel
 * (gauge, payment hero, lender fits, add-ons, desking grid) all project from
 * it. The AppShell owns the global header — this renders content only.
 * [dc-redesign / Phase 5]
 */
const DeskScreenBase: React.FC = () => {
  const {
    settings,
    dealData,
    setDealData,
    filters,
    setFilters,
    customerName,
    setCustomerName,
    setActiveVehicle,
    favorites,
    toggleFavorite,
    safeLenderProfiles,
    processedInventory,
    filteredInventory,
    inventorySort,
    setInventorySort,
    focusVin,
    setFocusVin,
    searchQuery,
    setSearchQuery,
    loadSampleData,
  } = useDealContext();

  const { handleSaveDeal } = useSaveDeal();
  const totalLenders = activeLenderCount(safeLenderProfiles);
  const thresholds = useMemo(() => settings.ltvThresholds, [settings.ltvThresholds]);

  const [dealSheetOpen, setDealSheetOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [advancedTermsOpen, setAdvancedTermsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [compactInspector, setCompactInspector] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1023px)");
    const syncCompactInspector = () => setCompactInspector(media.matches);
    syncCompactInspector();
    media.addEventListener?.("change", syncCompactInspector);
    return () => media.removeEventListener?.("change", syncCompactInspector);
  }, []);

  /* ---------- sorting (context inventorySort → persisted in the DESK_UI blob) ---------- */

  const sortKey: SortKey = isSortKey(inventorySort.key) ? inventorySort.key : "approvalScore";
  const sortDir: "asc" | "desc" = isSortKey(inventorySort.key) ? inventorySort.direction : "desc";

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setInventorySort({ key, direction: sortDir === "asc" ? "desc" : "asc" });
      } else {
        setInventorySort({ key, direction: DEFAULT_DIR[key] });
      }
    },
    [sortKey, sortDir, setInventorySort]
  );
  const sortArrow = (key: SortKey) => (key === sortKey ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  // Context filteredInventory already applies search + minScore + the desk
  // filters; the local pass only orders it (context sortedInventory can't
  // express the "no key yet → odds desc" default without persisting it).
  const rows = useMemo(() => {
    // Sort the VEHICLE column by the DISPLAYED name (make model trim, like the
    // mockup's mk+md), not the year-prefixed `vehicle` string — otherwise an
    // "ascending name" sort silently orders by hidden model year.
    const displayName = (v: CalculatedVehicle): string =>
      v.make && v.model
        ? `${v.make} ${v.model} ${v.trim ?? ""}`
        : String(v.vehicle).replace(/^\d{4}\s+/, "");
    const sorted = [...filteredInventory];
    sorted.sort((a, b) => {
      const va = sortKey === "vehicle" ? displayName(a) : a[sortKey];
      const vb = sortKey === "vehicle" ? displayName(b) : b[sortKey];
      const aBad = va === null || va === undefined || va === "Error" || va === "N/A";
      const bBad = vb === null || vb === undefined || vb === "Error" || vb === "N/A";
      if (aBad && bBad) return 0;
      if (aBad) return 1;
      if (bBad) return -1;
      if (typeof va === "number" && typeof vb === "number")
        return sortDir === "asc" ? va - vb : vb - va;
      const sa = String(va);
      const sb = String(vb);
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return sorted;
  }, [filteredInventory, sortKey, sortDir]);

  /* ---------- focus ---------- */

  const focused: CalculatedVehicle | undefined = useMemo(
    () => rows.find((r) => r.vin === focusVin) ?? rows[0],
    [rows, focusVin]
  );

  // Keep legacy consumers (useSaveDeal, PDF, FinanceTools) on the focused
  // vehicle, and re-emit the deal_desked analytics event lost with the legacy
  // tab tree — once per focused VIN, not per reprice.
  const lastDeskedVinRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focused) return;
    if (lastDeskedVinRef.current === focused.vin) return;
    lastDeskedVinRef.current = focused.vin;
    setActiveVehicle(focused);
    capture("deal_desked", {
      term: dealData.loanTerm,
      score: focused.approvalScore ?? null,
      fitCount: focused.fitCount ?? 0,
    });
    if ((focused.fitCount ?? 0) > 0) {
      capture("lender_matched", {
        fitCount: focused.fitCount,
        vin: focused.vin,
      });
    }
  }, [focused, setActiveVehicle, dealData.loanTerm]);

  /* ---------- input plumbing ---------- */

  const setDeal = useCallback(
    (patch: Partial<DealData>) => setDealData((d) => ({ ...d, ...patch })),
    [setDealData]
  );
  const setFilter = useCallback(
    (patch: Partial<FilterData>) => setFilters((f) => ({ ...f, ...patch })),
    [setFilters]
  );
  const numOnChange = useCallback(
    (fn: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const x = parseFloat(e.target.value.replace(/[^0-9.]/g, ""));
      fn(Number.isFinite(x) ? x : 0);
    },
    []
  );

  /* ---------- per-focused-vehicle lender detail (matched tiers, buy rate) ---------- */

  const focusedEntries = useMemo<LenderFitEntry[]>(() => {
    if (!focused) return [];
    return lenderFitForVehicle(focused, { ...dealData, ...filters }, safeLenderProfiles).entries;
  }, [focused, dealData, filters, safeLenderProfiles]);

  const profilesById = useMemo(() => {
    const map = new Map<string, LenderProfile>();
    for (const p of safeLenderProfiles) map.set(p.id, p);
    return map;
  }, [safeLenderProfiles]);

  // "Use X% · Lender" — the first eligible lender whose matched tier exposes a
  // buy rate. Hidden when no fitting lender exposes one.
  const buyRate = useMemo(() => {
    // PB `tiers` is freeform JSON: AI-extracted rates arrive as numbers OR
    // strings ("6.99", "6.99%"). Coerce like the Lenders screen does so the
    // shortcut appears for every rate the matrix displays.
    const coerce = (v: unknown): number | null => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string") {
        const n = parseFloat(v.replace(/%\s*$/, ""));
        if (Number.isFinite(n)) return n;
      }
      return null;
    };
    for (const e of focusedEntries) {
      const base = coerce(e.matchedTier?.baseInterestRate);
      if (e.eligible && base !== null) {
        const rate = Number((base + (coerce(e.matchedTier?.rateAdder) ?? 0)).toFixed(2));
        return { rate, lender: e.name };
      }
    }
    return null;
  }, [focusedEntries]);

  const applyBuyRate = useCallback(() => {
    if (!buyRate || !focused) return;
    setDeal({ interestRate: buyRate.rate });
    toast.success(`APR set to ${buyRate.rate}% (${buyRate.lender})`);
    logDealEvent("buy_rate_applied", {
      vin: focused.vin,
      snapshot: { apr: buyRate.rate, lender: buyRate.lender },
    });
  }, [buyRate, focused, setDeal]);

  // APR keeps its own text so "8." survives typing and a cleared field stays
  // blank (= unset APR, no payment) rather than snapping to an interest-free
  // 0%. [B6]
  const [aprText, setAprText] = useState<string>(() =>
    typeof dealData.interestRate === "number" ? String(dealData.interestRate) : ""
  );
  useEffect(() => {
    const target =
      typeof dealData.interestRate === "number" && Number.isFinite(dealData.interestRate)
        ? dealData.interestRate
        : NaN;
    const cur = parseFloat(aprText);
    if ((Number.isNaN(cur) && Number.isNaN(target)) || cur === target) return;
    setAprText(Number.isNaN(target) ? "" : String(target));
  }, [dealData.interestRate]);
  const onAprChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^0-9.]/g, "");
      setAprText(raw);
      setDeal({ interestRate: (raw === "" ? "" : parseFloat(raw)) as number });
    },
    [setDeal]
  );

  /* ---------- back-end add-ons (VSC / GAP / other; backendProducts = sum) ---------- */

  const backendSplit = getBackendProductSplit(dealData);
  const vscAmt = backendSplit.vscAmount;
  const gapAmt = backendSplit.gapAmount;
  const otherBackend = backendSplit.otherBackend;

  const toggleVsc = useCallback(
    () =>
      setDealData((d) => {
        const split = getBackendProductSplit(d);
        const next = split.vscAmount > 0 ? 0 : settings.vscPrice;
        return { ...d, ...applyBackendProductPatch(d, { vscAmount: next }) };
      }),
    [setDealData, settings.vscPrice]
  );
  const toggleGap = useCallback(
    () =>
      setDealData((d) => {
        const split = getBackendProductSplit(d);
        const next = split.gapAmount > 0 ? 0 : settings.gapPrice;
        return { ...d, ...applyBackendProductPatch(d, { gapAmount: next }) };
      }),
    [setDealData, settings.gapPrice]
  );
  const setVscAmount = useCallback(
    (n: number) => setDealData((d) => ({ ...d, ...applyBackendProductPatch(d, { vscAmount: n }) })),
    [setDealData]
  );
  const setGapAmount = useCallback(
    (n: number) => setDealData((d) => ({ ...d, ...applyBackendProductPatch(d, { gapAmount: n }) })),
    [setDealData]
  );
  const setOtherBackend = useCallback(
    (n: number) =>
      setDealData((d) => ({ ...d, ...applyBackendProductPatch(d, { otherBackend: n }) })),
    [setDealData]
  );

  /* ---------- reset / clear ---------- */

  const handleReset = useCallback(() => {
    setDealData({
      ...INITIAL_DEAL_DATA,
      loanTerm: settings.defaultTerm,
      interestRate: settings.defaultApr,
      stateFees: settings.defaultStateFees,
      buyerState: settings.defaultState,
    });
    setFilters(INITIAL_FILTER_DATA);
    setSearchQuery("");
    setCustomerName("");
  }, [setDealData, setFilters, setSearchQuery, setCustomerName, settings]);

  const clearFilters = useCallback(() => {
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
    setSearchQuery("");
  }, [setFilters, setSearchQuery]);

  /* ---------- compare strip ---------- */

  const compareCards = useMemo(() => {
    const byVin = new Map(processedInventory.map((v) => [v.vin, v]));
    return favorites
      .map((f) => byVin.get(f.vin))
      .filter((v): v is CalculatedVehicle => v !== undefined);
  }, [favorites, processedInventory]);

  const isPinned = focused ? favorites.some((f) => f.vin === focused.vin) : false;

  /* ---------- save / deal sheet ---------- */

  const saveFocusedDeal = useCallback(() => {
    if (focused) handleSaveDeal(focused);
  }, [focused, handleSaveDeal]);

  // Close the modal BEFORE the save toast fires — toasts (z-80) sit below
  // modal backdrops.
  const saveFromDealSheet = useCallback(() => {
    setDealSheetOpen(false);
    saveFocusedDeal();
  }, [saveFocusedDeal]);

  const toggleAdvancedTerms = useCallback(() => {
    setAdvancedTermsOpen((open) => !open);
  }, []);

  const openScanner = useCallback(() => setScannerOpen(true), []);
  const openDealSheet = useCallback(() => setDealSheetOpen(true), []);
  const closeInspector = useCallback(() => setInspectorOpen(false), []);
  const setFocusedTermDown = useCallback(
    (term: number, down: number) => setDeal({ loanTerm: term, downPayment: down }),
    [setDeal]
  );
  const toggleFocusedFavorite = useCallback(() => {
    if (focused) toggleFavorite(focused.vin);
  }, [focused, toggleFavorite]);

  const focusInventoryVin = useCallback(
    (vin: string) => {
      setFocusVin(vin);
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
        setInspectorOpen(true);
      }
    },
    [setFocusVin]
  );

  /* ---------- keyboard shortcuts ---------- */

  const orderedVins = useMemo(() => rows.map((r) => r.vin), [rows]);
  useDeskShortcuts({
    orderedVins,
    focusedVin: focused?.vin ?? null,
    onFocusVin: setFocusVin,
    onToggleCompare: toggleFavorite,
    isModalOpen: dealSheetOpen,
    onCloseModal: () => setDealSheetOpen(false),
  });

  /* ---------- virtualized inventory rows ---------- */

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 59,
    overscan: 8,
  });

  // Keep the focused row visible during ↑/↓ navigation (no-op when on screen).
  useEffect(() => {
    if (!focused) return;
    const idx = rows.findIndex((r) => r.vin === focused.vin);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "auto" });
  }, [focused?.vin]);

  const buyerState = dealData.buyerState ?? settings.defaultState;

  return (
    <div data-screen-label="Dealer desk">
      <div className="desk-body">
        {/* ---------- 02 · INVENTORY + 03 · FOCUSED ---------- */}
        <div className="desk-workspace">
          <div className="desk-main-column">
            {/* ---------- 01 · DEAL TERMS ---------- */}
            <DeskTermsRail
              customerName={customerName}
              setCustomerName={setCustomerName}
              filters={filters}
              setFilter={setFilter}
              dealData={dealData}
              setDeal={setDeal}
              buyerState={buyerState}
              aprText={aprText}
              onAprChange={onAprChange}
              buyRate={buyRate}
              applyBuyRate={applyBuyRate}
              advancedOpen={advancedTermsOpen}
              onToggleAdvanced={toggleAdvancedTerms}
              onReset={handleReset}
              onClearFilters={clearFilters}
              onScanIncome={openScanner}
            />

            {/* ---------- COMPARE STRIP ---------- */}
            {/* Gate on resolvable cards, not raw favorites — pins left over from
                another dealer's inventory rendered an empty "0 pinned" shell. */}
            {compareCards.length > 0 && (
              <div style={cardStyle}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--color-primary)" }}>★</span>
                  <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
                    Compare
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--color-text-subtle)" }}>
                    {compareCards.length} pinned · reprices live as you change the deal
                  </span>
                </div>
                <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "14px 16px" }}>
                  {compareCards.map((v) => {
                    const isF = focused && v.vin === focused.vin;
                    const pay = numVal(v.monthlyPayment);
                    return (
                      <div
                        key={v.vin}
                        onClick={() => focusInventoryVin(v.vin)}
                        className="transition-colors"
                        style={{
                          flex: "0 0 196px",
                          border: `1px solid ${
                            isF ? "var(--color-primary)" : "var(--color-border)"
                          }`,
                          borderRadius: 12,
                          padding: 13,
                          cursor: "pointer",
                          background: isF
                            ? "var(--color-primary-subtle)"
                            : "var(--color-bg-subtle)",
                          position: "relative",
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(v.vin);
                          }}
                          aria-label={`Remove ${nameShort(v)} from compare`}
                          style={{
                            position: "absolute",
                            top: 7,
                            right: 8,
                            background: "transparent",
                            border: "none",
                            color: "var(--color-text-subtle)",
                            cursor: "pointer",
                            fontSize: 16,
                            lineHeight: 1,
                            padding: 2,
                            fontFamily: "inherit",
                          }}
                        >
                          ×
                        </button>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            paddingRight: 16,
                          }}
                        >
                          {nameShort(v)}
                        </div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "var(--color-text-subtle)",
                            fontFamily: mono,
                            marginTop: 2,
                          }}
                        >
                          {v.modelYear} · STK {v.stock}
                        </div>
                        <div
                          style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: 11 }}
                        >
                          <span
                            style={{
                              fontSize: 23,
                              fontWeight: 700,
                              fontFamily: mono,
                              letterSpacing: "-0.02em",
                            }}
                          >
                            {pay === null ? "—" : fmt(pay)}
                          </span>
                          <span style={{ fontSize: 12, color: "var(--color-text-subtle)" }}>
                            /mo
                          </span>
                        </div>
                        <div
                          style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontFamily: mono,
                              fontWeight: 700,
                              color: bandColor(v),
                            }}
                          >
                            {v.approvalScore ?? "—"}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
                            odds
                          </span>
                          <span
                            className="desk-compare-odds-pill"
                            style={{
                              color: otdColorFor(v.otdLtv, thresholds),
                              background: otdBgFor(v.otdLtv, thresholds),
                            }}
                          >
                            {pct(v.otdLtv)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div
              role="table"
              aria-label="Ranked inventory table"
              className="desk-inventory-card"
              style={cardStyle}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "13px 18px",
                  borderBottom: "1px solid var(--color-border)",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  <span
                    style={{ fontSize: 11, fontFamily: mono, color: "var(--color-text-subtle)" }}
                  >
                    02
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
                    Inventory
                  </span>
                  <span
                    style={{
                      fontSize: 12.5,
                      color: "var(--color-text-subtle)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {rows.length} of {processedInventory.length} · ranked by odds
                  </span>
                </div>
                <div className="desk-inventory-tools">
                  <div className="desk-compare-search-wrapper">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-text-subtle)"
                      strokeWidth="2"
                      className="desk-compare-search-icon"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                    <input
                      id="desk-search"
                      className="dc-input desk-compare-search-input"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search inventory · press /"
                    />
                  </div>
                  {focused && (
                    <button
                      type="button"
                      className="desk-mobile-inspector-btn transition-colors"
                      onClick={() => setInspectorOpen(true)}
                    >
                      View deal
                    </button>
                  )}
                </div>
              </div>

              {/* column headers */}
              <div
                role="row"
                aria-label="Column headers"
                className="desk-inventory-columns"
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID,
                  columnGap: 11,
                  alignItems: "center",
                  padding: "10px 18px",
                  background: "var(--color-bg-subtle)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                {SORT_COLUMNS.map((col, i) => (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => handleSort(col.key)}
                    title={col.title}
                    role="columnheader"
                    aria-sort={
                      col.key === sortKey
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    aria-label={
                      col.key === sortKey
                        ? `${col.title}, sorted ${sortDir === "asc" ? "ascending" : "descending"}`
                        : col.title
                    }
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      fontFamily: mono,
                      color: "var(--color-text-subtle)",
                      textAlign: i === 0 ? "left" : "right",
                      cursor: "pointer",
                      userSelect: "none",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      margin: 0,
                    }}
                  >
                    {col.label}
                    {sortArrow(col.key)}
                  </button>
                ))}
              </div>

              {rows.length === 0 ? (
                <EmptyState
                  icon={
                    processedInventory.length === 0 ? (
                      <Icons.CarIcon className="w-full h-full" />
                    ) : undefined
                  }
                  title={processedInventory.length === 0 ? "No inventory yet" : "No vehicles match"}
                  description={
                    processedInventory.length === 0
                      ? "Import vehicles from the Inventory tab or load sample data."
                      : "No vehicles match the current filters or search."
                  }
                  primaryAction={
                    processedInventory.length === 0
                      ? { label: "Load sample data", onClick: loadSampleData }
                      : { label: "Clear filters", onClick: clearFilters }
                  }
                />
              ) : (
                <div
                  ref={scrollRef}
                  // Fill the viewport below the deal-terms card instead of a
                  // fixed 560px box — the mockup's table runs the page.
                  style={{ maxHeight: "max(560px, calc(100vh - 340px))", overflowY: "auto" }}
                >
                  <div
                    style={{
                      height: virtualizer.getTotalSize(),
                      width: "100%",
                      position: "relative",
                    }}
                  >
                    {virtualizer.getVirtualItems().map((vr) => {
                      const v = rows[vr.index];
                      if (!v) return null;
                      const isF = focused && v.vin === focused.vin;
                      const score = v.approvalScore ?? 0;
                      const ring = bandColor(v);
                      return (
                        <div
                          key={v.vin}
                          data-index={vr.index}
                          ref={virtualizer.measureElement}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            transform: `translateY(${vr.start}px)`,
                          }}
                        >
                          <div
                            role="row"
                            className="inv-row"
                            tabIndex={0}
                            onClick={() => focusInventoryVin(v.vin)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                focusInventoryVin(v.vin);
                              }
                            }}
                            aria-label={`Focus ${v.vehicle} on desk`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: GRID,
                              columnGap: 11,
                              alignItems: "center",
                              padding: "11px 18px",
                              borderBottom: "1px solid var(--color-border)",
                              cursor: "pointer",
                              borderLeft: `3px solid ${isF ? "var(--color-primary)" : "transparent"}`,
                              background: isF ? "var(--color-primary-subtle)" : "transparent",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 600,
                                  letterSpacing: "-0.01em",
                                  lineHeight: 1.25,
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                              >
                                {nameShort(v)}
                              </div>
                              <div
                                style={{
                                  fontSize: 11.5,
                                  color: "var(--color-text-subtle)",
                                  fontFamily: mono,
                                  marginTop: 2,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {v.modelYear} ·{" "}
                                {typeof v.mileage === "number" ? fmtN(v.mileage) : "—"} mi · STK{" "}
                                {v.stock}
                              </div>
                            </div>
                            <span
                              data-label="Price"
                              style={{
                                fontSize: 13.5,
                                textAlign: "right",
                                fontFamily: mono,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {numVal(v.price) === null ? "—" : fmt(v.price as number)}
                            </span>
                            <span
                              data-label="F-LTV"
                              style={{
                                fontSize: 13.5,
                                textAlign: "right",
                                fontFamily: mono,
                                fontVariantNumeric: "tabular-nums",
                                color: "var(--color-text-muted)",
                              }}
                            >
                              {pct(v.frontEndLtv)}
                            </span>
                            <span
                              data-label="Financed"
                              style={{
                                fontSize: 14,
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
                            <span data-label="OTD LTV" style={{ textAlign: "right" }}>
                              <span
                                style={{
                                  fontSize: 12.5,
                                  fontFamily: mono,
                                  fontVariantNumeric: "tabular-nums",
                                  fontWeight: 600,
                                  color: otdColorFor(v.otdLtv, thresholds),
                                  background: otdBgFor(v.otdLtv, thresholds),
                                  padding: "3px 7px",
                                  borderRadius: 6,
                                }}
                              >
                                {pct(v.otdLtv)}
                              </span>
                            </span>
                            <span
                              data-label="Payment"
                              style={{
                                fontSize: 13.5,
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
                              data-label="Odds"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "flex-end",
                                gap: 7,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  fontFamily: mono,
                                  color: ring,
                                  minWidth: 18,
                                  textAlign: "right",
                                }}
                              >
                                {score}
                              </span>
                              <ScoreRing score={score} size={20} colorVar={ring} />
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

          {/* FOCUSED PANEL */}
          {inspectorOpen && (
            <button
              type="button"
              aria-label="Close deal inspector"
              className="desk-inspector-backdrop"
              onClick={() => setInspectorOpen(false)}
            />
          )}
          {focused && (
            <DealInspector
              vehicle={focused}
              entries={focusedEntries}
              profilesById={profilesById}
              totalLenders={totalLenders}
              dealData={dealData}
              settings={settings}
              pinned={isPinned}
              onPin={toggleFocusedFavorite}
              onSetTermDown={setFocusedTermDown}
              compactMode={compactInspector}
              onCloseCompact={closeInspector}
              compactOpen={inspectorOpen}
              vscAmount={vscAmt}
              gapAmount={gapAmt}
              otherBackend={otherBackend}
              onToggleVsc={toggleVsc}
              onToggleGap={toggleGap}
              onVscAmountChange={setVscAmount}
              onGapAmountChange={setGapAmount}
              onOtherBackendChange={setOtherBackend}
              onDealSheet={openDealSheet}
              onSaveDeal={saveFocusedDeal}
            />
          )}
        </div>
      </div>

      {dealSheetOpen && focused && (
        <Suspense fallback={null}>
          <DealSheetModal
            vehicle={focused}
            onClose={() => setDealSheetOpen(false)}
            onSaveToPipeline={saveFromDealSheet}
          />
        </Suspense>
      )}

      {scannerOpen && (
        <Suspense fallback={null}>
          <DocumentScanner
            onIncomeExtracted={(income) => {
              setFilters({ ...filters, monthlyIncome: income });
              toast.success(`Monthly income set to ${fmt(income)} from pay stub`);
            }}
            onClose={() => setScannerOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

const DeskScreen = React.memo(DeskScreenBase) as React.FC;
DeskScreen.displayName = "DeskScreen";
export default DeskScreen;
