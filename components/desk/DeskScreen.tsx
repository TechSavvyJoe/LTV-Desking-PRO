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
import { DealSheetModal } from "./DealSheetModal";
import type {
  AppState,
  ApprovalBand,
  CalculatedVehicle,
  DealData,
  FilterData,
  LenderProfile,
  Settings,
} from "../../types";

const mono = "var(--mono)";

// Lazy so the OCR path (and tesseract.js behind it) stays out of the main
// bundle — DocumentScanner itself dynamic-imports tesseract on first scan.
const DocumentScanner = lazy(() =>
  import("../DocumentScanner").then((m) => ({ default: m.DocumentScanner }))
);

/** Terms shipped by the dc design contract (chips + desking-grid rows). */
const DESK_TERMS = [60, 72, 84, 96];
/** Desking-grid down-payment columns. */
const DESK_DOWNS = [0, 1000, 2500, 5000];
const DOWN_LABELS = ["$0", "$1K", "$2.5K", "$5K"];

const GRID = "2fr 0.95fr 0.85fr 1.1fr 0.9fr 1fr 0.95fr";

const numVal = (v: number | "Error" | "N/A" | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const pct = (v: number | "Error" | "N/A") =>
  numVal(v) === null ? "—" : `${Math.round(v as number)}%`;

/** OTD LTV band colors from settings.ltvThresholds — never hardcoded. */
const otdColorFor = (v: number | "Error" | "N/A", th: { warn: number; danger: number }): string => {
  const n = numVal(v);
  if (n === null) return "var(--color-text-subtle)";
  return n >= th.danger
    ? "var(--color-danger)"
    : n >= th.warn
      ? "var(--color-warning)"
      : "var(--color-success)";
};
const otdBgFor = (v: number | "Error" | "N/A", th: { warn: number; danger: number }): string => {
  const n = numVal(v);
  if (n === null) return "transparent";
  return n >= th.danger
    ? "var(--color-danger-subtle)"
    : n >= th.warn
      ? "var(--color-warning-subtle)"
      : "var(--color-success-subtle)";
};

/** PTI display color per the mockup: ≤13 healthy, ≤18 watch, else danger. */
const ptiColorFor = (pti: number | undefined): string =>
  pti === undefined
    ? "var(--color-text-muted)"
    : pti <= 13
      ? "var(--color-success)"
      : pti <= 18
        ? "var(--color-warning)"
        : "var(--color-danger)";

const fitCountColor = (n: number): string =>
  n >= 4 ? "var(--color-success)" : n >= 1 ? "var(--color-warning)" : "var(--color-danger)";

const bandColor = (v: CalculatedVehicle): string => BAND_META[v.approvalBand ?? "none"].colorVar;

/** "Make Model Trim" (year lives in the sub-meta), with a safe fallback. */
const nameShort = (v: CalculatedVehicle): string =>
  v.make && v.model ? `${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}` : v.vehicle;

const aprLabel = (rate: DealData["interestRate"]): string =>
  typeof rate === "number" && Number.isFinite(rate) ? `${rate}%` : "—";

/* ---------- shared styles (mockup-exact) ---------- */

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--color-text-muted)",
  display: "block",
  marginBottom: 5,
};
const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.12em",
  color: "var(--color-text-subtle)",
  marginBottom: 13,
  fontFamily: mono,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--color-bg-subtle)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "8px 11px",
  fontSize: 14,
  color: "var(--color-text)",
  fontFamily: "inherit",
  outline: "none",
};
const monoInput: React.CSSProperties = { ...inputStyle, fontFamily: mono };
const cardStyle: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: 14,
  boxShadow: "var(--shadow)",
};
const panelEyebrow: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.1em",
  fontFamily: mono,
  color: "var(--color-text-subtle)",
  marginBottom: 11,
};

/* ---------- sortable columns ---------- */

type SortKey =
  | "vehicle"
  | "price"
  | "frontEndLtv"
  | "amountToFinance"
  | "otdLtv"
  | "monthlyPayment"
  | "approvalScore";

const SORT_COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "vehicle", label: "VEHICLE", title: "Sort by vehicle" },
  { key: "price", label: "PRICE", title: "Sort by price" },
  { key: "frontEndLtv", label: "F·LTV", title: "Front-end LTV" },
  { key: "amountToFinance", label: "FIN", title: "Amount financed" },
  { key: "otdLtv", label: "OTD", title: "Out-the-door LTV" },
  { key: "monthlyPayment", label: "PMT", title: "Monthly payment" },
  { key: "approvalScore", label: "ODDS", title: "Approval odds" },
];

/** Mockup per-key first-click directions: name ascends, every metric descends. */
const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  vehicle: "asc",
  price: "desc",
  frontEndLtv: "desc",
  amountToFinance: "desc",
  otdLtv: "desc",
  monthlyPayment: "desc",
  approvalScore: "desc",
};

const isSortKey = (k: string | null): k is SortKey => !!k && k in DEFAULT_DIR;

/**
 * The Desk — the redesign's signature screen, per LTV Desking PRO.dc.html
 * lines 183-481. Deal terms reprice all inventory live (DealContext's single
 * scoring pass); the compare strip, ranked inventory table, and focused panel
 * (gauge, payment hero, lender fits, add-ons, desking grid) all project from
 * it. The AppShell owns the global header — this renders content only.
 * [dc-redesign / Phase 5]
 */
export const DeskScreen: React.FC = () => {
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
  } = useDealContext();

  const { handleSaveDeal } = useSaveDeal();
  const totalLenders = activeLenderCount(safeLenderProfiles);
  const thresholds = settings.ltvThresholds;

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

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setInventorySort({ key, direction: sortDir === "asc" ? "desc" : "asc" });
    } else {
      setInventorySort({ key, direction: DEFAULT_DIR[key] });
    }
  };
  const sortArrow = (key: SortKey) => (key === sortKey ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  // Context filteredInventory already applies search + minScore + the desk
  // filters; the local pass only orders it (context sortedInventory can't
  // express the "no key yet → odds desc" default without persisting it).
  const rows = useMemo(() => {
    // Sort the VEHICLE column by the DISPLAYED name (make model trim, like the
    // mockup's mk+md), not the year-prefixed `vehicle` string — otherwise an
    // "ascending name" sort silently orders by hidden model year. [review]
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
  }, [focused, setActiveVehicle, dealData.loanTerm]);

  /* ---------- input plumbing ---------- */

  const setDeal = (patch: Partial<DealData>) => setDealData((d) => ({ ...d, ...patch }));
  const setFilter = (patch: Partial<FilterData>) => setFilters((f) => ({ ...f, ...patch }));
  const numOnChange = (fn: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const x = parseFloat(e.target.value.replace(/[^0-9.]/g, ""));
    fn(Number.isFinite(x) ? x : 0);
  };

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
    // shortcut appears for every rate the matrix displays. [review]
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

  const applyBuyRate = () => {
    if (!buyRate || !focused) return;
    setDeal({ interestRate: buyRate.rate });
    toast.success(`APR set to ${buyRate.rate}% (${buyRate.lender})`);
    logDealEvent("buy_rate_applied", {
      vin: focused.vin,
      snapshot: { apr: buyRate.rate, lender: buyRate.lender },
    });
  };

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
  const onAprChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, "");
    setAprText(raw);
    setDeal({ interestRate: (raw === "" ? "" : parseFloat(raw)) as unknown as number });
  };

  /* ---------- back-end add-ons (VSC / GAP / other; backendProducts = sum) ---------- */

  const backendSplit = getBackendProductSplit(dealData);
  const vscAmt = backendSplit.vscAmount;
  const gapAmt = backendSplit.gapAmount;
  const otherBackend = backendSplit.otherBackend;

  const toggleVsc = () =>
    setDealData((d) => {
      const split = getBackendProductSplit(d);
      const next = split.vscAmount > 0 ? 0 : settings.vscPrice;
      return { ...d, ...applyBackendProductPatch(d, { vscAmount: next }) };
    });
  const toggleGap = () =>
    setDealData((d) => {
      const split = getBackendProductSplit(d);
      const next = split.gapAmount > 0 ? 0 : settings.gapPrice;
      return { ...d, ...applyBackendProductPatch(d, { gapAmount: next }) };
    });
  const setVscAmount = (n: number) =>
    setDealData((d) => ({ ...d, ...applyBackendProductPatch(d, { vscAmount: n }) }));
  const setGapAmount = (n: number) =>
    setDealData((d) => ({ ...d, ...applyBackendProductPatch(d, { gapAmount: n }) }));
  const setOtherBackend = (n: number) =>
    setDealData((d) => ({ ...d, ...applyBackendProductPatch(d, { otherBackend: n }) }));

  /* ---------- reset / clear ---------- */

  const handleReset = () => {
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
  };

  const clearFilters = () => {
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
  };

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
  const saveFromDealSheet = () => {
    setDealSheetOpen(false);
    saveFocusedDeal();
  };

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
          onToggleAdvanced={() => setAdvancedTermsOpen((open) => !open)}
          onReset={handleReset}
          onClearFilters={clearFilters}
          onScanIncome={() => setScannerOpen(true)}
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
                    className="lift-btn"
                    style={{
                      flex: "0 0 196px",
                      border: `1px solid ${isF ? "var(--color-primary)" : "var(--color-border)"}`,
                      borderRadius: 12,
                      padding: 13,
                      cursor: "pointer",
                      background: isF ? "var(--color-primary-subtle)" : "var(--color-bg-subtle)",
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
                    <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: 11 }}>
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
                      <span style={{ fontSize: 12, color: "var(--color-text-subtle)" }}>/mo</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
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
                      <span style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>odds</span>
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: mono,
                          fontWeight: 600,
                          color: otdColorFor(v.otdLtv, thresholds),
                          background: otdBgFor(v.otdLtv, thresholds),
                          padding: "2px 6px",
                          borderRadius: 5,
                          marginLeft: "auto",
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

        {/* ---------- 02 · INVENTORY + 03 · FOCUSED ---------- */}
        <div className="desk-workspace">
          <div style={{ flex: 1, minWidth: 0, ...cardStyle, overflow: "hidden" }}>
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
                <span style={{ fontSize: 11, fontFamily: mono, color: "var(--color-text-subtle)" }}>
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
                <div style={{ position: "relative" }}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-text-subtle)"
                    strokeWidth="2"
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                    }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    id="desk-search"
                    className="dc-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search inventory · press /"
                    style={{
                      background: "var(--color-bg-subtle)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      padding: "7px 11px 7px 30px",
                      fontSize: 13,
                      color: "var(--color-text)",
                      fontFamily: "inherit",
                      outline: "none",
                      width: 230,
                    }}
                  />
                </div>
                {focused && (
                  <button
                    type="button"
                    className="desk-mobile-inspector-btn lift-btn"
                    onClick={() => setInspectorOpen(true)}
                  >
                    View deal
                  </button>
                )}
              </div>
            </div>

            {/* column headers */}
            <div
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
                <span
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSort(col.key);
                    }
                  }}
                  title={col.title}
                  role="button"
                  tabIndex={0}
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
                  }}
                >
                  {col.label}
                  {sortArrow(col.key)}
                </span>
              ))}
            </div>

            {rows.length === 0 ? (
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
                  {processedInventory.length === 0
                    ? "No inventory yet — import vehicles from the Inventory tab."
                    : "No vehicles match the current filters."}
                </span>
                {processedInventory.length > 0 && (
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
                )}
              </div>
            ) : (
              <div
                ref={scrollRef}
                // Fill the viewport below the deal-terms card instead of a
                // fixed 560px box — the mockup's table runs the page. [review]
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
                          className="inv-row"
                          onClick={() => focusInventoryVin(v.vin)}
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
              onPin={() => toggleFavorite(focused.vin)}
              onSetTermDown={(term, down) => setDeal({ loanTerm: term, downPayment: down })}
              compactMode={compactInspector}
              onCloseCompact={() => setInspectorOpen(false)}
              compactOpen={inspectorOpen}
              vscAmount={vscAmt}
              gapAmount={gapAmt}
              otherBackend={otherBackend}
              onToggleVsc={toggleVsc}
              onToggleGap={toggleGap}
              onVscAmountChange={setVscAmount}
              onGapAmountChange={setGapAmount}
              onOtherBackendChange={setOtherBackend}
              onDealSheet={() => setDealSheetOpen(true)}
              onSaveDeal={saveFocusedDeal}
            />
          )}
        </div>
      </div>

      {dealSheetOpen && focused && (
        <DealSheetModal
          vehicle={focused}
          onClose={() => setDealSheetOpen(false)}
          onSaveToPipeline={saveFromDealSheet}
        />
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

/* ================================================================== */
/* Focused panel — gauge, payment hero, lender fits, breakdown,       */
/* back-end add-ons, desking grid, actions (mockup lines 376-477).    */
/* ================================================================== */

interface DeskTermsRailProps {
  customerName: string;
  setCustomerName: (value: string) => void;
  filters: FilterData;
  setFilter: (patch: Partial<FilterData>) => void;
  dealData: DealData;
  setDeal: (patch: Partial<DealData>) => void;
  buyerState: AppState;
  aprText: string;
  onAprChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  buyRate: { rate: number; lender: string } | null;
  applyBuyRate: () => void;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  onReset: () => void;
  onClearFilters: () => void;
  onScanIncome: () => void;
}

const DeskTermsRail: React.FC<DeskTermsRailProps> = ({
  customerName,
  setCustomerName,
  filters,
  setFilter,
  dealData,
  setDeal,
  buyerState,
  aprText,
  onAprChange,
  buyRate,
  applyBuyRate,
  advancedOpen,
  onToggleAdvanced,
  onReset,
  onClearFilters,
  onScanIncome,
}) => {
  const setNumber = (fn: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = parseMoneyInput(e.target.value);
    fn(n);
  };

  return (
    <section className="desk-terms-card">
      <div className="desk-terms-head">
        <div className="desk-section-title">
          <span>01</span>
          <strong>Deal terms</strong>
          <span className="desk-live-pill">
            <span className="live-dot" />
            Live
          </span>
        </div>
        <div className="desk-terms-actions">
          <span>Every edit reprices inventory and lender fit.</span>
          <button type="button" className="desk-ghost-btn lift-btn" onClick={onToggleAdvanced}>
            {advancedOpen ? "Hide filters" : "More filters"}
          </button>
          <button type="button" className="desk-ghost-btn lift-btn" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>

      <div className="desk-terms-primary">
        <div className="desk-field">
          <label htmlFor="desk-customer">Customer</label>
          <input
            id="desk-customer"
            className="dc-input"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Add customer"
          />
        </div>
        <div className="desk-field compact">
          <label htmlFor="desk-fico">FICO</label>
          <input
            id="desk-fico"
            className="dc-input mono"
            inputMode="numeric"
            value={filters.creditScore ?? ""}
            onChange={setNumber((n) => setFilter({ creditScore: n || null }))}
          />
        </div>
        <div className="desk-field">
          <label htmlFor="desk-income">Income / mo</label>
          <div className="desk-input-action">
            <input
              id="desk-income"
              className="dc-input mono"
              inputMode="numeric"
              value={filters.monthlyIncome ?? ""}
              onChange={setNumber((n) => setFilter({ monthlyIncome: n || null }))}
              placeholder="Gross"
            />
            <button
              type="button"
              onClick={onScanIncome}
              aria-label="Scan pay stub"
              title="Scan pay stub"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
                <path d="M3 12h18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="desk-field compact">
          <label htmlFor="desk-down">Down</label>
          <input
            id="desk-down"
            className="dc-input mono"
            inputMode="numeric"
            value={dealData.downPayment || ""}
            onChange={setNumber((n) => setDeal({ downPayment: n }))}
          />
        </div>
        <div className="desk-field term">
          <label>Term</label>
          <div className="desk-term-buttons" role="group" aria-label="Loan term">
            {DESK_TERMS.map((term) => (
              <button
                type="button"
                key={term}
                className="lift-btn"
                data-active={dealData.loanTerm === term}
                onClick={() => setDeal({ loanTerm: term })}
              >
                {term}
              </button>
            ))}
          </div>
        </div>
        <div className="desk-field compact">
          <label htmlFor="desk-apr">APR</label>
          <input
            id="desk-apr"
            className="dc-input mono"
            inputMode="decimal"
            value={aprText}
            onChange={onAprChange}
          />
          {buyRate && (
            <button type="button" className="desk-inline-link" onClick={applyBuyRate}>
              Use {buyRate.rate}% · {buyRate.lender}
            </button>
          )}
        </div>
      </div>

      {advancedOpen && (
        <div className="desk-terms-advanced">
          <div className="desk-field">
            <label htmlFor="desk-buyer-state">Buyer state</label>
            <select
              id="desk-buyer-state"
              className="dc-input"
              value={buyerState}
              onChange={(e) => setDeal({ buyerState: e.target.value as AppState })}
            >
              <option value="MI">MI · 6%</option>
              <option value="OH">OH · 5.75%</option>
              <option value="IN">IN · 6% recip.</option>
              <option value="IL">IL · 6% recip.</option>
              <option value="FL">FL · 6%</option>
            </select>
          </div>
          <div className="desk-field">
            <label htmlFor="desk-trade-value">Trade value</label>
            <input
              id="desk-trade-value"
              className="dc-input mono"
              inputMode="numeric"
              value={dealData.tradeInValue || ""}
              onChange={setNumber((n) => setDeal({ tradeInValue: n }))}
            />
          </div>
          <div className="desk-field">
            <label htmlFor="desk-trade-payoff">Trade payoff</label>
            <input
              id="desk-trade-payoff"
              className="dc-input mono"
              inputMode="numeric"
              value={dealData.tradeInPayoff || ""}
              onChange={setNumber((n) => setDeal({ tradeInPayoff: n }))}
            />
          </div>
          <div className="desk-field">
            <label htmlFor="desk-filter-vehicle">Vehicle filter</label>
            <input
              id="desk-filter-vehicle"
              className="dc-input"
              value={filters.vehicle}
              onChange={(e) => setFilter({ vehicle: e.target.value })}
              placeholder="Make / model"
            />
          </div>
          <div className="desk-field compact">
            <label htmlFor="desk-max-price">Max price</label>
            <input
              id="desk-max-price"
              className="dc-input mono"
              inputMode="numeric"
              value={filters.maxPrice ?? ""}
              onChange={setNumber((n) => setFilter({ maxPrice: n || null }))}
              placeholder="Any"
            />
          </div>
          <div className="desk-field compact">
            <label htmlFor="desk-max-payment">Max $/mo</label>
            <input
              id="desk-max-payment"
              className="dc-input mono"
              inputMode="numeric"
              value={filters.maxPayment ?? ""}
              onChange={setNumber((n) => setFilter({ maxPayment: n || null }))}
              placeholder="Any"
            />
          </div>
          <div className="desk-field compact">
            <label htmlFor="desk-max-miles">Max miles</label>
            <input
              id="desk-max-miles"
              className="dc-input mono"
              inputMode="numeric"
              value={filters.maxMiles ?? ""}
              onChange={setNumber((n) => setFilter({ maxMiles: n || null }))}
              placeholder="Any"
            />
          </div>
          <div className="desk-field compact">
            <label htmlFor="desk-min-score">Min odds</label>
            <input
              id="desk-min-score"
              className="dc-input mono"
              inputMode="numeric"
              value={filters.minScore ?? ""}
              onChange={setNumber((n) => setFilter({ minScore: n || null }))}
              placeholder="Any"
            />
          </div>
          <button type="button" className="desk-clear-btn lift-btn" onClick={onClearFilters}>
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
};

interface DealInspectorProps {
  vehicle: CalculatedVehicle;
  entries: LenderFitEntry[];
  profilesById: Map<string, LenderProfile>;
  totalLenders: number;
  dealData: DealData;
  settings: Settings;
  pinned: boolean;
  onPin: () => void;
  onSetTermDown: (term: number, down: number) => void;
  compactMode: boolean;
  compactOpen: boolean;
  onCloseCompact: () => void;
  vscAmount: number;
  gapAmount: number;
  otherBackend: number;
  onToggleVsc: () => void;
  onToggleGap: () => void;
  onVscAmountChange: (n: number) => void;
  onGapAmountChange: (n: number) => void;
  onOtherBackendChange: (n: number) => void;
  onDealSheet: () => void;
  onSaveDeal: () => void;
}

/** Max of a tier field across a lender's tiers — the honest lender-level ceiling. */
const maxOverTiers = (
  profile: LenderProfile | undefined,
  pick: (t: LenderProfile["tiers"][number]) => number | undefined
): number | null => {
  if (!profile?.tiers?.length) return null;
  let best: number | null = null;
  for (const t of profile.tiers) {
    const n = pick(t);
    if (typeof n === "number" && Number.isFinite(n) && (best === null || n > best)) best = n;
  }
  return best;
};

const lenderMeta = (entry: LenderFitEntry, profile: LenderProfile | undefined): string => {
  const tier = entry.matchedTier;
  const ltv =
    tier?.maxLtv ??
    tier?.otdLtv ??
    tier?.frontEndLtv ??
    maxOverTiers(profile, (t) => t.maxLtv ?? t.otdLtv ?? t.frontEndLtv);
  const term = tier?.maxTerm ?? maxOverTiers(profile, (t) => t.maxTerm);
  if (ltv == null && term == null) return "—";
  return `${ltv != null ? `${Math.round(ltv)}%` : "—"} · ${term != null ? `${term} mo` : "—"}`;
};

type InspectorTab = "summary" | "addons" | "matrix";

const DealInspector: React.FC<DealInspectorProps> = ({
  vehicle: v,
  entries,
  profilesById,
  totalLenders,
  dealData,
  settings,
  pinned,
  onPin,
  onSetTermDown,
  compactMode,
  compactOpen,
  onCloseCompact,
  vscAmount,
  gapAmount,
  otherBackend,
  onToggleVsc,
  onToggleGap,
  onVscAmountChange,
  onGapAmountChange,
  onOtherBackendChange,
  onDealSheet,
  onSaveDeal,
}) => {
  const [tab, setTab] = useState<InspectorTab>("summary");
  const panelRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const thresholds = settings.ltvThresholds;
  const band = v.approvalBand ?? "none";
  const fitCount = v.fitCount ?? 0;
  const fitNames = v.fitNames ?? [];

  // Tweens — arc + numeral + color + payment move together off the SAME
  // animated values (600ms easeOutCubic; reduced-motion snaps).
  const scoreTarget = v.approvalScore ?? 0;
  const payN = numVal(v.monthlyPayment);
  const dispScore = useAnimatedNumber(scoreTarget);
  const dispPay = useAnimatedNumber(payN ?? 0);

  // Color AND zone label follow the tweened score through the mockup's bands
  // so arc/number/color/label all move together; "none" (no lender fit) stays
  // authoritative regardless of the animated number. [review]
  const dispBand: ApprovalBand =
    band === "none"
      ? "none"
      : dispScore >= APPROVAL_CONFIG.bands.strong
        ? "strong"
        : dispScore >= APPROVAL_CONFIG.bands.moderate
          ? "moderate"
          : "weak";
  const gaugeColor = BAND_META[dispBand].colorVar;

  const pay = payN === null ? null : splitPay(dispPay);

  const price = numVal(v.price);
  const baseOtd = numVal(v.baseOutTheDoorPrice);
  const taxFees = price !== null && baseOtd !== null ? baseOtd - price : numVal(v.salesTax);
  const down =
    (dealData.downPayment || 0) +
    ((dealData.tradeInValue || 0) - (dealData.tradeInPayoff || 0)) +
    (dealData.rebate || 0);
  const financed = numVal(v.amountToFinance);
  const pti = v.ptiRatio;

  // 16-cell desking grid (term × down), each a full real-engine reprice.
  const grid = useMemo(
    () =>
      DESK_TERMS.map((term) => ({
        term,
        cells: DESK_DOWNS.map((dn) => {
          const calc = calculateFinancials(
            v,
            { ...dealData, loanTerm: term, downPayment: dn },
            settings
          );
          return { down: dn, pay: numVal(calc.monthlyPayment) };
        }),
      })),
    [v, dealData, settings]
  );

  useEffect(() => {
    if (!compactMode) return;
    if (compactOpen) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      panelRef.current?.focus();
      return;
    }
    previousFocusRef.current?.focus();
  }, [compactMode, compactOpen]);

  const handleInspectorKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!compactMode) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseCompact();
      return;
    }
    if (event.key !== "Tab" || !compactOpen || !panelRef.current) return;

    const focusables = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute("inert") && el.offsetParent !== null);
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const compactA11yProps: React.HTMLAttributes<HTMLElement> = compactMode
    ? {
        role: "dialog",
        "aria-modal": compactOpen,
        "aria-label": "Deal inspector",
        "aria-hidden": !compactOpen,
        inert: !compactOpen,
      }
    : {};

  return (
    <aside
      ref={panelRef}
      className="desk-inspector"
      data-open={compactOpen}
      tabIndex={compactMode && compactOpen ? -1 : undefined}
      onKeyDown={handleInspectorKeyDown}
      {...compactA11yProps}
    >
      <div className="desk-inspector-head">
        <div className="desk-inspector-kicker">
          <span>03</span>
          <span>STK {v.stock}</span>
          <span>{typeof v.mileage === "number" ? fmtN(v.mileage) : "—"} mi</span>
        </div>
        <div className="desk-inspector-title-row">
          <h2>{v.vehicle}</h2>
          <div className="desk-inspector-head-actions">
            <button type="button" className="desk-ghost-btn lift-btn" onClick={onPin}>
              {pinned ? "Comparing" : "Compare"}
            </button>
            <button
              type="button"
              className="desk-inspector-close lift-btn"
              onClick={onCloseCompact}
              aria-label="Close deal inspector"
            >
              ×
            </button>
          </div>
        </div>
      </div>

      <InspectorSummary
        score={dispScore}
        bandLabel={BAND_META[dispBand].label}
        gaugeColor={gaugeColor}
        pay={pay}
        loanTerm={dealData.loanTerm}
        apr={aprLabel(dealData.interestRate)}
        fitCount={fitCount}
        totalLenders={totalLenders}
        financed={financed}
        backendProducts={dealData.backendProducts || 0}
        otdLtv={v.otdLtv}
        pti={pti}
        thresholds={thresholds}
      />

      <div className="desk-inspector-tabs" role="tablist" aria-label="Deal inspector sections">
        {[
          ["summary", "Summary"],
          ["addons", "Add-ons"],
          ["matrix", "Matrix"],
        ].map(([key, label]) => (
          <button
            type="button"
            key={key}
            role="tab"
            aria-selected={tab === key}
            data-active={tab === key}
            className="lift-btn"
            onClick={() => setTab(key as InspectorTab)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="desk-inspector-body">
        {tab === "summary" && (
          <>
            <LenderLadder
              entries={entries}
              fitNames={fitNames}
              profilesById={profilesById}
              fitCount={fitCount}
              totalLenders={totalLenders}
              limit={3}
            />
            <FinancialBreakdown
              price={price}
              taxFees={taxFees}
              down={down}
              otdLtv={v.otdLtv}
              pti={pti}
              financed={financed}
              thresholds={thresholds}
            />
            <BackendAddons
              vscAmount={vscAmount}
              gapAmount={gapAmount}
              otherBackend={otherBackend}
              defaultVsc={settings.vscPrice}
              defaultGap={settings.gapPrice}
              onToggleVsc={onToggleVsc}
              onToggleGap={onToggleGap}
              onVscAmountChange={onVscAmountChange}
              onGapAmountChange={onGapAmountChange}
              onOtherBackendChange={onOtherBackendChange}
            />
          </>
        )}
        {tab === "addons" && (
          <BackendAddons
            vscAmount={vscAmount}
            gapAmount={gapAmount}
            otherBackend={otherBackend}
            defaultVsc={settings.vscPrice}
            defaultGap={settings.gapPrice}
            onToggleVsc={onToggleVsc}
            onToggleGap={onToggleGap}
            onVscAmountChange={onVscAmountChange}
            onGapAmountChange={onGapAmountChange}
            onOtherBackendChange={onOtherBackendChange}
          />
        )}
        {tab === "matrix" && (
          <StructureMatrix
            grid={grid}
            loanTerm={dealData.loanTerm}
            downPayment={dealData.downPayment || 0}
            onSetTermDown={onSetTermDown}
          />
        )}
      </div>

      <div className="desk-inspector-actions">
        <button type="button" onClick={onDealSheet} className="desk-secondary-action lift-btn">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
          Deal sheet
        </button>
        <button type="button" onClick={onSaveDeal} className="desk-primary-action lift-btn">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <path d="M17 21v-8H7v8M7 3v5h8" />
          </svg>
          Save deal
        </button>
      </div>
    </aside>
  );
};

interface InspectorSummaryProps {
  score: number;
  bandLabel: string;
  gaugeColor: string;
  pay: ReturnType<typeof splitPay> | null;
  loanTerm: number;
  apr: string;
  fitCount: number;
  totalLenders: number;
  financed: number | null;
  backendProducts: number;
  otdLtv: number | "Error" | "N/A";
  pti: number | undefined;
  thresholds: Settings["ltvThresholds"];
}

const InspectorSummary: React.FC<InspectorSummaryProps> = ({
  score,
  bandLabel,
  gaugeColor,
  pay,
  loanTerm,
  apr,
  fitCount,
  totalLenders,
  financed,
  backendProducts,
  otdLtv,
  pti,
  thresholds,
}) => (
  <section className="desk-inspector-summary pay-glow">
    <div className="desk-score-cell">
      <ApprovalGauge score={score} colorVar={gaugeColor} label={bandLabel} width={150} />
      <div className="desk-score-label" style={{ color: gaugeColor }}>
        {bandLabel}
      </div>
      <div className="desk-fit-caption">
        <strong style={{ color: fitCountColor(fitCount) }}>
          {fitCount}/{totalLenders}
        </strong>{" "}
        lenders fit
      </div>
    </div>
    <div className="desk-payment-cell">
      <div className="desk-payment-label">Est. monthly payment</div>
      <div className="desk-payment-value">
        <span>{pay ? pay.whole : "—"}</span>
        <small>{pay ? pay.frac : ""}</small>
      </div>
      <div className="desk-payment-meta">
        {loanTerm} mo · {apr} APR · estimate
      </div>
      <div className="desk-summary-metrics">
        <Metric label="Financed" value={financed === null ? "—" : fmt(financed)} tone="primary" />
        <Metric label="Back-end" value={fmt(backendProducts)} color="var(--color-text)" />
        <Metric label="OTD LTV" value={pct(otdLtv)} color={otdColorFor(otdLtv, thresholds)} />
        <Metric
          label="PTI"
          value={pti !== undefined ? `${pti.toFixed(1)}%` : "—"}
          color={ptiColorFor(pti)}
        />
      </div>
    </div>
  </section>
);

const Metric: React.FC<{ label: string; value: string; tone?: "primary"; color?: string }> = ({
  label,
  value,
  tone,
  color,
}) => (
  <div>
    <span>{label}</span>
    <strong style={{ color: tone === "primary" ? "var(--color-primary)" : color }}>{value}</strong>
  </div>
);

interface LenderLadderProps {
  entries: LenderFitEntry[];
  fitNames: string[];
  profilesById: Map<string, LenderProfile>;
  fitCount: number;
  totalLenders: number;
  limit?: number;
}

const LenderLadder: React.FC<LenderLadderProps> = ({
  entries,
  fitNames,
  profilesById,
  fitCount,
  totalLenders,
  limit,
}) => {
  const visible = (limit ? entries.slice(0, limit) : entries).filter(Boolean);
  return (
    <section className="desk-panel-section">
      <div className="desk-panel-heading">
        <span>Lender paths</span>
        <strong style={{ color: fitCountColor(fitCount) }}>
          {fitCount}/{totalLenders}
        </strong>
      </div>
      {fitNames.length > 0 && (
        <div className="desk-lender-paths">
          {fitNames.slice(0, 3).map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
      )}
      <div className="desk-lender-list">
        {visible.map((entry) => {
          const profile = profilesById.get(entry.lenderId);
          return (
            <div key={entry.lenderId} className="desk-lender-row">
              <span className="desk-lender-badge" data-fit={entry.eligible}>
                {entry.eligible ? "FIT" : "CHK"}
              </span>
              <span className="desk-lender-name" title={entry.name}>
                {entry.name}
              </span>
              <span className="desk-lender-meta">{lenderMeta(entry, profile)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

interface FinancialBreakdownProps {
  price: number | null;
  taxFees: number | null;
  down: number;
  otdLtv: number | "Error" | "N/A";
  pti: number | undefined;
  financed: number | null;
  thresholds: Settings["ltvThresholds"];
}

const FinancialBreakdown: React.FC<FinancialBreakdownProps> = ({
  price,
  taxFees,
  down,
  otdLtv,
  pti,
  financed,
  thresholds,
}) => (
  <section className="desk-panel-section">
    <div className="desk-panel-heading">
      <span>Structure</span>
      <strong style={{ color: otdColorFor(otdLtv, thresholds) }}>{pct(otdLtv)}</strong>
    </div>
    <div className="desk-breakdown-list">
      <Line label="Selling price" value={price === null ? "—" : fmt(price)} />
      <Line label="Tax + fees" value={taxFees === null ? "—" : fmt(taxFees)} />
      <Line
        label="Down + trade + rebate"
        value={down ? `-${fmt(down)}` : "-$0"}
        color="var(--color-danger)"
      />
      <Line
        label="Payment-to-income"
        value={pti !== undefined ? `${pti.toFixed(1)}%` : "—"}
        color={ptiColorFor(pti)}
      />
      <Line
        label="Amount financed"
        value={financed === null ? "—" : fmt(financed)}
        color="var(--color-primary)"
        bold
      />
    </div>
  </section>
);

interface BackendAddonsProps {
  vscAmount: number;
  gapAmount: number;
  otherBackend: number;
  defaultVsc: number;
  defaultGap: number;
  onToggleVsc: () => void;
  onToggleGap: () => void;
  onVscAmountChange: (n: number) => void;
  onGapAmountChange: (n: number) => void;
  onOtherBackendChange: (n: number) => void;
}

const amountValue = (value: number): string => (value > 0 ? String(value) : "");

const BackendAddons: React.FC<BackendAddonsProps> = ({
  vscAmount,
  gapAmount,
  otherBackend,
  defaultVsc,
  defaultGap,
  onToggleVsc,
  onToggleGap,
  onVscAmountChange,
  onGapAmountChange,
  onOtherBackendChange,
}) => {
  const total = vscAmount + gapAmount + otherBackend;
  const onMoney = (fn: (n: number) => void) => (event: React.ChangeEvent<HTMLInputElement>) =>
    fn(parseMoneyInput(event.target.value));

  return (
    <section className="desk-panel-section">
      <div className="desk-panel-heading">
        <span>Back-end add-ons</span>
        <strong>{fmt(total)}</strong>
      </div>
      <div className="desk-backend-list">
        <div className="desk-backend-row">
          <button
            type="button"
            className="desk-backend-toggle lift-btn"
            data-active={vscAmount > 0}
            onClick={onToggleVsc}
          >
            <span>{vscAmount > 0 ? "−" : "+"}</span>
            Service contract
          </button>
          <input
            className="dc-input desk-backend-input"
            inputMode="numeric"
            value={amountValue(vscAmount)}
            onChange={onMoney(onVscAmountChange)}
            placeholder={String(defaultVsc)}
            aria-label="Service contract amount"
          />
        </div>
        <div className="desk-backend-row">
          <button
            type="button"
            className="desk-backend-toggle lift-btn"
            data-active={gapAmount > 0}
            onClick={onToggleGap}
          >
            <span>{gapAmount > 0 ? "−" : "+"}</span>
            GAP coverage
          </button>
          <input
            className="dc-input desk-backend-input"
            inputMode="numeric"
            value={amountValue(gapAmount)}
            onChange={onMoney(onGapAmountChange)}
            placeholder={String(defaultGap)}
            aria-label="GAP coverage amount"
          />
        </div>
        <div className="desk-backend-row">
          <div className="desk-backend-label">Other backend</div>
          <input
            className="dc-input desk-backend-input"
            inputMode="numeric"
            value={amountValue(otherBackend)}
            onChange={onMoney(onOtherBackendChange)}
            placeholder="0"
            aria-label="Other backend amount"
          />
        </div>
      </div>
      <div className="desk-backend-total">
        <span>Calculator total</span>
        <strong>{fmt(total)}</strong>
      </div>
    </section>
  );
};

interface StructureMatrixProps {
  grid: { term: number; cells: { down: number; pay: number | null }[] }[];
  loanTerm: number;
  downPayment: number;
  onSetTermDown: (term: number, down: number) => void;
}

const StructureMatrix: React.FC<StructureMatrixProps> = ({
  grid,
  loanTerm,
  downPayment,
  onSetTermDown,
}) => (
  <section className="desk-panel-section">
    <div className="desk-panel-heading">
      <span>Desking grid</span>
      <strong>Term × down</strong>
    </div>
    <div className="desk-matrix">
      <div className="desk-matrix-head">
        <span />
        {DOWN_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {grid.map((row) => (
        <div key={row.term} className="desk-matrix-row">
          <span>{row.term}mo</span>
          {row.cells.map((cell) => (
            <button
              type="button"
              key={`${row.term}-${cell.down}`}
              className="desk-matrix-cell lift-btn"
              data-active={row.term === loanTerm && cell.down === downPayment}
              onClick={() => onSetTermDown(row.term, cell.down)}
            >
              {cell.pay === null ? "—" : fmt(cell.pay)}
            </button>
          ))}
        </div>
      ))}
    </div>
  </section>
);

const Line: React.FC<{ label: string; value: string; color?: string; bold?: boolean }> = ({
  label,
  value,
  color,
  bold,
}) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
    <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
    <span
      style={{
        fontFamily: mono,
        fontWeight: bold ? 600 : 400,
        color: color || "var(--color-text)",
      }}
    >
      {value}
    </span>
  </div>
);

export default DeskScreen;
