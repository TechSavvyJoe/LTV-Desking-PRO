import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDealContext } from "../../context/DealContext";
import { calculateFinancials } from "../../services/calculator";
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
  CalculatedVehicle,
  DealData,
  FilterData,
  LenderProfile,
  Settings,
} from "../../types";

const mono = "var(--mono)";

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
const otdColorFor = (
  v: number | "Error" | "N/A",
  th: { warn: number; danger: number }
): string => {
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

  /* ---------- sorting (context inventorySort → persisted in the DESK_UI blob) ---------- */

  const sortKey: SortKey = isSortKey(inventorySort.key) ? inventorySort.key : "approvalScore";
  const sortDir: "asc" | "desc" = isSortKey(inventorySort.key)
    ? inventorySort.direction
    : "desc";

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
    const sorted = [...filteredInventory];
    sorted.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
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
  const numOnChange =
    (fn: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
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
    for (const e of focusedEntries) {
      if (e.eligible && typeof e.matchedTier?.baseInterestRate === "number") {
        const rate = Number(
          (e.matchedTier.baseInterestRate + (e.matchedTier.rateAdder ?? 0)).toFixed(2)
        );
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

  const vscAmt = dealData.vscAmount ?? 0;
  const gapAmt = dealData.gapAmount ?? 0;
  // Legacy deals carry only the total: whatever isn't VSC/GAP is "other".
  const otherBackend = Math.max(0, (dealData.backendProducts || 0) - vscAmt - gapAmt);

  const toggleVsc = () =>
    setDealData((d) => {
      const vsc = d.vscAmount ?? 0;
      const gap = d.gapAmount ?? 0;
      const other = Math.max(0, (d.backendProducts || 0) - vsc - gap);
      const next = vsc > 0 ? 0 : settings.vscPrice;
      return { ...d, vscAmount: next, backendProducts: next + gap + other };
    });
  const toggleGap = () =>
    setDealData((d) => {
      const vsc = d.vscAmount ?? 0;
      const gap = d.gapAmount ?? 0;
      const other = Math.max(0, (d.backendProducts || 0) - vsc - gap);
      const next = gap > 0 ? 0 : settings.gapPrice;
      return { ...d, gapAmount: next, backendProducts: vsc + next + other };
    });
  const setOtherBackend = (n: number) =>
    setDealData((d) => {
      const vsc = d.vscAmount ?? 0;
      const gap = d.gapAmount ?? 0;
      return { ...d, backendProducts: vsc + gap + Math.max(0, n) };
    });

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
      <div
        className="desk-body"
        style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}
      >
        {/* ---------- 01 · DEAL TERMS ---------- */}
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "13px 18px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 11, fontFamily: mono, color: "var(--color-text-subtle)" }}>
                01
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
                Deal terms
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--color-primary-subtle)",
                  color: "var(--color-primary)",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 6,
                  letterSpacing: "0.08em",
                  fontFamily: mono,
                }}
              >
                <span
                  className="live-dot"
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "var(--color-primary)",
                    display: "inline-block",
                  }}
                />
                LIVE
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 12.5, color: "var(--color-text-subtle)" }}>
                Every change re-prices all inventory instantly
              </span>
              <button
                onClick={handleReset}
                className="lift-btn"
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-border-strong)",
                  color: "var(--color-text-muted)",
                  borderRadius: 8,
                  padding: "5px 12px",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div style={{ display: "flex", padding: 18 }}>
            {/* CUSTOMER & CREDIT */}
            <div
              style={{ flex: 1.15, paddingRight: 22, borderRight: "1px solid var(--color-border)" }}
            >
              <div style={sectionLabel}>CUSTOMER &amp; CREDIT</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <div>
                  <label style={labelStyle}>Customer name</label>
                  <input
                    className="dc-input"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Add customer"
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Credit score</label>
                    <input
                      className="dc-input"
                      inputMode="numeric"
                      value={filters.creditScore ?? ""}
                      onChange={numOnChange((n) => setFilter({ creditScore: n || null }))}
                      style={monoInput}
                    />
                  </div>
                  <div style={{ flex: 1.2 }}>
                    <label style={labelStyle}>Buyer state</label>
                    <select
                      className="dc-input"
                      value={buyerState}
                      onChange={(e) => setDeal({ buyerState: e.target.value as AppState })}
                      style={{ ...inputStyle, padding: "8px 9px", cursor: "pointer" }}
                    >
                      <option value="MI">MI · 6%</option>
                      <option value="OH">OH · 5.75%</option>
                      <option value="IN">IN · 6% recip.</option>
                      <option value="IL">IL · 6% recip.</option>
                      <option value="FL">FL · 6%</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Monthly income ($)</label>
                  <input
                    className="dc-input"
                    inputMode="numeric"
                    value={filters.monthlyIncome ?? ""}
                    onChange={numOnChange((n) => setFilter({ monthlyIncome: n || null }))}
                    placeholder="Gross / mo"
                    style={monoInput}
                  />
                </div>
              </div>
            </div>

            {/* CASH & TRADE */}
            <div
              style={{ flex: 1.2, padding: "0 22px", borderRight: "1px solid var(--color-border)" }}
            >
              <div style={sectionLabel}>CASH &amp; TRADE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Cash down ($)</label>
                    <input
                      className="dc-input"
                      inputMode="numeric"
                      value={dealData.downPayment || ""}
                      onChange={numOnChange((n) => setDeal({ downPayment: n }))}
                      style={monoInput}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Trade value ($)</label>
                    <input
                      className="dc-input"
                      inputMode="numeric"
                      value={dealData.tradeInValue || ""}
                      onChange={numOnChange((n) => setDeal({ tradeInValue: n }))}
                      style={monoInput}
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Trade payoff ($)</label>
                  <input
                    className="dc-input"
                    inputMode="numeric"
                    value={dealData.tradeInPayoff || ""}
                    onChange={numOnChange((n) => setDeal({ tradeInPayoff: n }))}
                    style={monoInput}
                  />
                </div>
              </div>
            </div>

            {/* FIND / FILTER */}
            <div
              style={{ flex: 1.5, padding: "0 22px", borderRight: "1px solid var(--color-border)" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 13,
                }}
              >
                <span style={{ ...sectionLabel, marginBottom: 0 }}>FIND / FILTER</span>
                <button
                  onClick={clearFilters}
                  className="lift-btn"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--color-primary)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    padding: 0,
                  }}
                >
                  Clear
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1.1 }}>
                    <label style={labelStyle}>Vehicle</label>
                    <input
                      className="dc-input"
                      value={filters.vehicle}
                      onChange={(e) => setFilter({ vehicle: e.target.value })}
                      placeholder="Make / model"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Max price ($)</label>
                    <input
                      className="dc-input"
                      inputMode="numeric"
                      value={filters.maxPrice ?? ""}
                      onChange={numOnChange((n) => setFilter({ maxPrice: n || null }))}
                      placeholder="Any"
                      style={monoInput}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Max $/mo</label>
                    <input
                      className="dc-input"
                      inputMode="numeric"
                      value={filters.maxPayment ?? ""}
                      onChange={numOnChange((n) => setFilter({ maxPayment: n || null }))}
                      placeholder="Any"
                      style={monoInput}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Max miles</label>
                    <input
                      className="dc-input"
                      inputMode="numeric"
                      value={filters.maxMiles ?? ""}
                      onChange={numOnChange((n) => setFilter({ maxMiles: n || null }))}
                      placeholder="Any"
                      style={monoInput}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Min odds</label>
                    <input
                      className="dc-input"
                      inputMode="numeric"
                      value={filters.minScore ?? ""}
                      onChange={numOnChange((n) => setFilter({ minScore: n || null }))}
                      placeholder="Any"
                      style={monoInput}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* STRUCTURE */}
            <div style={{ flex: 1.35, paddingLeft: 22 }}>
              <div style={sectionLabel}>STRUCTURE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <div>
                  <label style={labelStyle}>Term (months)</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {DESK_TERMS.map((t) => {
                      const active = dealData.loanTerm === t;
                      return (
                        <button
                          key={t}
                          onClick={() => setDeal({ loanTerm: t })}
                          className="lift-btn"
                          style={{
                            flex: 1,
                            borderRadius: 8,
                            padding: "8px 0",
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: mono,
                            background: active ? "var(--color-primary)" : "var(--color-bg-subtle)",
                            color: active ? "var(--on-primary)" : "var(--color-text-muted)",
                            border: `1px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
                          }}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ width: "52%" }}>
                  <label style={labelStyle}>APR (%)</label>
                  <input
                    className="dc-input"
                    inputMode="decimal"
                    value={aprText}
                    onChange={onAprChange}
                    style={monoInput}
                  />
                  {buyRate && (
                    <button
                      onClick={applyBuyRate}
                      className="lift-btn"
                      style={{
                        marginTop: 6,
                        background: "transparent",
                        border: "none",
                        color: "var(--color-primary)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        padding: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Use {buyRate.rate}% · {buyRate.lender}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ---------- COMPARE STRIP ---------- */}
        {favorites.length > 0 && (
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
                    onClick={() => setFocusVin(v.vin)}
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
                      aria-label="Remove"
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
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
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
            </div>

            {/* column headers */}
            <div
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
                  title={col.title}
                  role="button"
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
              <div ref={scrollRef} style={{ maxHeight: 560, overflowY: "auto" }}>
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
                          onClick={() => setFocusVin(v.vin)}
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
                          <span style={{ textAlign: "right" }}>
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
          {focused && (
            <FocusedPanel
              vehicle={focused}
              entries={focusedEntries}
              profilesById={profilesById}
              totalLenders={totalLenders}
              dealData={dealData}
              settings={settings}
              pinned={isPinned}
              onPin={() => toggleFavorite(focused.vin)}
              onSetTermDown={(term, down) => setDeal({ loanTerm: term, downPayment: down })}
              vscAmount={vscAmt}
              gapAmount={gapAmt}
              otherBackend={otherBackend}
              onToggleVsc={toggleVsc}
              onToggleGap={toggleGap}
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
    </div>
  );
};

/* ================================================================== */
/* Focused panel — gauge, payment hero, lender fits, breakdown,       */
/* back-end add-ons, desking grid, actions (mockup lines 376-477).    */
/* ================================================================== */

interface FocusedPanelProps {
  vehicle: CalculatedVehicle;
  entries: LenderFitEntry[];
  profilesById: Map<string, LenderProfile>;
  totalLenders: number;
  dealData: DealData;
  settings: Settings;
  pinned: boolean;
  onPin: () => void;
  onSetTermDown: (term: number, down: number) => void;
  vscAmount: number;
  gapAmount: number;
  otherBackend: number;
  onToggleVsc: () => void;
  onToggleGap: () => void;
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

const FocusedPanel: React.FC<FocusedPanelProps> = ({
  vehicle: v,
  entries,
  profilesById,
  totalLenders,
  dealData,
  settings,
  pinned,
  onPin,
  onSetTermDown,
  vscAmount,
  gapAmount,
  otherBackend,
  onToggleVsc,
  onToggleGap,
  onOtherBackendChange,
  onDealSheet,
  onSaveDeal,
}) => {
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

  // Color follows the tweened score through the mockup's bands; a no-fit deal
  // stays danger regardless (its capped score sits below "moderate" anyway).
  const gaugeColor =
    band === "none"
      ? BAND_META.none.colorVar
      : dispScore >= APPROVAL_CONFIG.bands.strong
        ? "var(--color-success)"
        : dispScore >= APPROVAL_CONFIG.bands.moderate
          ? "var(--color-warning)"
          : "var(--color-danger)";

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

  const addonRowStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 10px",
    borderRadius: 8,
    cursor: "pointer",
    border: `1px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
    background: active ? "var(--color-primary-subtle)" : "var(--color-bg-subtle)",
    fontFamily: "inherit",
    width: "100%",
  });
  const addonMark: React.CSSProperties = {
    width: 16,
    height: 16,
    borderRadius: 5,
    border: "1px solid var(--color-border-strong)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    color: "var(--color-primary)",
    fontWeight: 700,
    flexShrink: 0,
  };

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        background: "var(--color-bg)",
        border: "1px solid var(--color-border-strong)",
        borderRadius: 14,
        boxShadow: "var(--shadow-md)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 19px 14px", borderBottom: "1px solid var(--color-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontFamily: mono, color: "var(--color-text-subtle)" }}>
            03
          </span>
          <span style={{ fontSize: 12, fontFamily: mono, color: "var(--color-text-subtle)" }}>
            STK {v.stock} · {typeof v.mileage === "number" ? fmtN(v.mileage) : "—"} mi
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              fontFamily: mono,
              background: "var(--color-primary-subtle)",
              color: "var(--color-primary)",
              padding: "2px 7px",
              borderRadius: 5,
            }}
          >
            FOCUSED
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {v.vehicle}
          </div>
          <button
            onClick={onPin}
            className="lift-btn"
            style={{
              flexShrink: 0,
              background: pinned ? "var(--color-primary-subtle)" : "transparent",
              border: `1px solid ${pinned ? "var(--color-primary)" : "var(--color-border-strong)"}`,
              color: pinned ? "var(--color-primary)" : "var(--color-text-muted)",
              borderRadius: 7,
              padding: "5px 9px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {pinned ? "✓ Comparing" : "+ Compare"}
          </button>
        </div>
      </div>

      {/* Gauge */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "18px 19px 16px",
          borderBottom: "1px solid var(--color-border)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 6,
            left: "50%",
            transform: "translateX(-50%)",
            width: 190,
            height: 110,
            borderRadius: "50%",
            background: `radial-gradient(closest-side, color-mix(in srgb, ${gaugeColor} 16%, transparent), transparent)`,
            pointerEvents: "none",
          }}
        />
        <ApprovalGauge score={dispScore} colorVar={gaugeColor} label={BAND_META[band].label} />
        <div
          style={{
            fontSize: 11,
            fontFamily: mono,
            letterSpacing: "0.16em",
            color: "var(--color-text-muted)",
            marginTop: -2,
          }}
        >
          APPROVAL ODDS / 100
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            marginTop: 8,
            color: gaugeColor,
          }}
        >
          {BAND_META[band].label}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginTop: 6,
            fontSize: 12,
            fontFamily: mono,
            color: "var(--color-text-subtle)",
          }}
        >
          <span style={{ color: fitCountColor(fitCount), fontWeight: 600 }}>
            {fitCount}/{totalLenders}
          </span>
          lenders fit
          <span style={{ opacity: 0.4 }}>·</span>
          {dealData.loanTerm} mo
        </div>
      </div>

      {/* Payment hero */}
      <div
        className="pay-glow"
        style={{ padding: 19, borderBottom: "1px solid var(--color-border)", position: "relative" }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.1em",
            fontFamily: mono,
            color: "var(--color-text-muted)",
            marginBottom: 6,
          }}
        >
          EST. MONTHLY PAYMENT
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <span
            style={{
              fontSize: 46,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {pay ? pay.whole : "—"}
          </span>
          <span
            style={{
              fontSize: 21,
              fontWeight: 600,
              color: "var(--color-text-muted)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {pay ? pay.frac : ""}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-subtle)", marginTop: 6 }}>
          {dealData.loanTerm} mo · {aprLabel(dealData.interestRate)} APR · estimate, not an offer of
          credit
        </div>
      </div>

      {/* Lender fits */}
      <div style={{ padding: "15px 19px", borderBottom: "1px solid var(--color-border)" }}>
        <div style={panelEyebrow}>
          LENDER FITS · {fitCount}/{totalLenders}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.length === 0 && (
            <span style={{ fontSize: 12.5, color: "var(--color-text-subtle)" }}>
              No active lenders configured.
            </span>
          )}
          {entries.map((l) => {
            // Badge follows the SAME scoring pass as the gauge (fitNames), so
            // the panel can never contradict itself mid-debounce.
            const fits = fitNames.includes(l.name);
            return (
              <div
                key={l.lenderId}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      fontFamily: mono,
                      padding: "2px 6px",
                      borderRadius: 5,
                      background: fits ? "var(--color-success-subtle)" : "var(--color-bg-muted)",
                      color: fits ? "var(--color-success)" : "var(--color-text-subtle)",
                      flexShrink: 0,
                    }}
                  >
                    {fits ? "FIT" : "CHK"}
                  </span>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {l.name}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: mono,
                    color: "var(--color-text-subtle)",
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                >
                  {lenderMeta(l, profilesById.get(l.lenderId))}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Financial breakdown */}
      <div
        style={{
          padding: "15px 19px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          gap: 9,
        }}
      >
        <Line label="Selling price" value={price === null ? "—" : fmt(price)} />
        <Line label="Tax + fees" value={taxFees === null ? "—" : fmt(taxFees)} />
        <Line
          label="Down + trade + rebate"
          value={down >= 0 ? `−${fmt(down)}` : `+${fmt(-down)}`}
          color="var(--color-danger)"
        />
        <Line
          label="OTD LTV"
          value={pct(v.otdLtv)}
          color={otdColorFor(v.otdLtv, thresholds)}
          bold
        />
        <Line
          label="Payment-to-income"
          value={pti !== undefined ? `${pti.toFixed(1)}%` : "—"}
          color={ptiColorFor(pti)}
          bold
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 14,
            paddingTop: 9,
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <span style={{ fontWeight: 600 }}>Amount financed</span>
          <span style={{ fontFamily: mono, fontWeight: 700, color: "var(--color-primary)" }}>
            {financed === null ? "—" : fmt(financed)}
          </span>
        </div>
      </div>

      {/* Back-end add-ons */}
      <div style={{ padding: "15px 19px", borderBottom: "1px solid var(--color-border)" }}>
        <div style={panelEyebrow}>BACK-END ADD-ONS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={onToggleVsc} className="lift-btn" style={addonRowStyle(vscAmount > 0)}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={addonMark}>{vscAmount > 0 ? "✓" : "+"}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text)" }}>
                Service contract
              </span>
            </span>
            <span style={{ fontSize: 13, fontFamily: mono, color: "var(--color-text-muted)" }}>
              {fmt(settings.vscPrice)}
            </span>
          </button>
          <button onClick={onToggleGap} className="lift-btn" style={addonRowStyle(gapAmount > 0)}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={addonMark}>{gapAmount > 0 ? "✓" : "+"}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text)" }}>
                GAP coverage
              </span>
            </span>
            <span style={{ fontSize: 13, fontFamily: mono, color: "var(--color-text-muted)" }}>
              {fmt(settings.gapPrice)}
            </span>
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${otherBackend > 0 ? "var(--color-primary)" : "var(--color-border)"}`,
              background: otherBackend > 0 ? "var(--color-primary-subtle)" : "var(--color-bg-subtle)",
            }}
          >
            <label
              htmlFor="desk-other-backend"
              style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text)" }}
            >
              Other backend ($)
            </label>
            <input
              id="desk-other-backend"
              className="dc-input"
              inputMode="numeric"
              value={otherBackend || ""}
              onChange={(e) => {
                const x = parseFloat(e.target.value.replace(/[^0-9.]/g, ""));
                onOtherBackendChange(Number.isFinite(x) ? x : 0);
              }}
              placeholder="0"
              style={{
                width: 84,
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 13,
                color: "var(--color-text)",
                fontFamily: mono,
                outline: "none",
                textAlign: "right",
              }}
            />
          </div>
        </div>
      </div>

      {/* Desking grid */}
      <div style={{ padding: "15px 19px", borderBottom: "1px solid var(--color-border)" }}>
        <div style={panelEyebrow}>DESKING GRID · TERM × DOWN</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "0.72fr 1fr 1fr 1fr 1fr",
            gap: 3,
            marginBottom: 3,
          }}
        >
          <span />
          {DOWN_LABELS.map((d) => (
            <span
              key={d}
              style={{
                fontSize: 11,
                fontFamily: mono,
                color: "var(--color-text-subtle)",
                textAlign: "center",
              }}
            >
              {d}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {grid.map((gr) => (
            <div
              key={gr.term}
              style={{
                display: "grid",
                gridTemplateColumns: "0.72fr 1fr 1fr 1fr 1fr",
                gap: 3,
                alignItems: "stretch",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontFamily: mono,
                  color: "var(--color-text-muted)",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {gr.term}mo
              </span>
              {gr.cells.map((gc) => {
                const active =
                  gr.term === dealData.loanTerm && gc.down === (dealData.downPayment || 0);
                return (
                  <button
                    key={gc.down}
                    onClick={() => onSetTermDown(gr.term, gc.down)}
                    className="lift-btn"
                    style={{
                      padding: "6px 2px",
                      borderRadius: 7,
                      cursor: "pointer",
                      border: `1px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
                      background: active ? "var(--color-primary-subtle)" : "var(--color-bg-subtle)",
                      fontFamily: mono,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--color-text)",
                      textAlign: "center",
                    }}
                  >
                    {gc.pay === null ? "—" : fmt(gc.pay)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: "15px 19px", display: "flex", gap: 9 }}>
        <button
          onClick={onDealSheet}
          className="lift-btn"
          style={{
            flex: 1,
            background: "transparent",
            border: "1px solid var(--color-border-strong)",
            color: "var(--color-text)",
            borderRadius: 9,
            padding: 9,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
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
        <button
          onClick={onSaveDeal}
          className="lift-btn"
          style={{
            flex: 1.4,
            background: "var(--color-primary)",
            border: "1px solid transparent",
            color: "var(--on-primary)",
            borderRadius: 9,
            padding: 9,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
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
    </div>
  );
};

const Line: React.FC<{ label: string; value: string; color?: string; bold?: boolean }> = ({
  label,
  value,
  color,
  bold,
}) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
    <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
    <span style={{ fontFamily: mono, fontWeight: bold ? 600 : 400, color: color || "var(--color-text)" }}>
      {value}
    </span>
  </div>
);

export default DeskScreen;
