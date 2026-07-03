import React, { useMemo } from "react";
import { useDealContext } from "../../context/DealContext";
import { calculateMonthlyPayment } from "../../services/calculator";
import { lenderFitForVehicle, activeLenderCount } from "../../services/lenderFit";
import { scoreApprovalOdds, BAND_META, type ApprovalResult } from "../../services/approvalScorer";
import { ApprovalGauge } from "../common/ApprovalGauge";
import type { CalculatedVehicle, DealData, FilterData } from "../../types";

const mono = "var(--mono)";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const numVal = (v: number | "Error" | "N/A"): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const pct = (v: number | "Error" | "N/A") => (numVal(v) === null ? "—" : `${Math.round(v as number)}%`);

const otdColor = (l: number | "Error" | "N/A") => {
  const n = numVal(l);
  if (n === null) return "var(--color-text-subtle)";
  return n >= 125 ? "var(--color-danger)" : n >= 115 ? "var(--color-warning)" : "var(--color-success)";
};
const otdBg = (l: number | "Error" | "N/A") => {
  const n = numVal(l);
  if (n === null) return "transparent";
  return n >= 125
    ? "var(--color-danger-subtle)"
    : n >= 115
      ? "var(--color-warning-subtle)"
      : "var(--color-success-subtle)";
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "var(--color-text-muted)",
  display: "block",
  marginBottom: 5,
};
const sectionLabel: React.CSSProperties = {
  fontSize: 10,
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
  fontSize: 13,
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

const GRID = "2fr 0.95fr 0.85fr 1.1fr 0.9fr 1fr 0.95fr";
const TERMS = [48, 60, 72, 84];

interface Scored {
  v: CalculatedVehicle;
  fitCount: number;
  fitNames: string[];
  appr: ApprovalResult;
}

/**
 * The Desk — the redesign's signature screen. Deal terms reprice all inventory
 * live; the focused vehicle shows the approval gauge, payment hero, lender fits,
 * and OTD breakdown. Mirrors the DESK block of LTV Desking PRO.dc.html. [WS2]
 */
export const DeskScreen: React.FC<{ onOpenAiUpload?: () => void }> = ({ onOpenAiUpload }) => {
  const {
    settings,
    setSettings,
    dealData,
    setDealData,
    filters,
    setFilters,
    customerName,
    setCustomerName,
    activeVehicle,
    setActiveVehicle,
    favorites,
    toggleFavorite,
    safeLenderProfiles,
    processedInventory,
  } = useDealContext();

  const merged = useMemo(
    () => ({ ...dealData, ...filters }) as DealData & FilterData,
    [dealData, filters]
  );

  const totalLenders = activeLenderCount(safeLenderProfiles);

  // Score + rank inventory by approval odds (eligibility-capped).
  const scored = useMemo<Scored[]>(() => {
    const rows = processedInventory.map((v) => {
      const fit = lenderFitForVehicle(v, merged, safeLenderProfiles);
      const appr = scoreApprovalOdds(v, filters, fit.fitCount);
      return { v, fitCount: fit.fitCount, fitNames: fit.fitNames, appr };
    });
    rows.sort((a, b) => b.appr.internalScore - a.appr.internalScore);
    return rows;
  }, [processedInventory, merged, safeLenderProfiles, filters]);

  const focused: Scored | undefined = useMemo(() => {
    if (activeVehicle) {
      const m = scored.find((s) => s.v.vin === activeVehicle.vin);
      if (m) return m;
    }
    return scored[0];
  }, [scored, activeVehicle]);

  const setDeal = (patch: Partial<DealData>) => setDealData((d) => ({ ...d, ...patch }));
  const setFilter = (patch: Partial<FilterData>) => setFilters((f) => ({ ...f, ...patch }));
  const numOnChange =
    (fn: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const x = parseFloat(e.target.value.replace(/[^0-9.]/g, ""));
      fn(Number.isFinite(x) ? x : 0);
    };

  const isPinned = (vin: string) => favorites.some((f) => f.vin === vin);

  const aprNum = typeof dealData.interestRate === "number" ? dealData.interestRate : 0;

  return (
    <div data-screen-label="Dealer desk">
      {/* Top bar */}
      <header
        style={{
          height: 58,
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 22px",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span
            style={{ fontSize: 10, fontFamily: mono, letterSpacing: "0.18em", color: "var(--color-text-subtle)" }}
          >
            THE DESK
          </span>
          <div style={{ height: 20, width: 1, background: "var(--color-border)" }} />
          <select
            value={settings.defaultState}
            onChange={(e) => setSettings((s) => ({ ...s, defaultState: e.target.value as typeof s.defaultState }))}
            className="dc-input"
            style={{ ...inputStyle, width: "auto", fontWeight: 600, cursor: "pointer", padding: "6px 9px" }}
          >
            <option value="MI">MI · 6%</option>
            <option value="OH">OH · 5.75%</option>
            <option value="IN">IN · 7%</option>
          </select>
        </div>
        <button
          onClick={onOpenAiUpload}
          className="lift-btn btn-primary"
          style={{
            border: "1px solid transparent",
            borderRadius: 8,
            padding: "8px 13px",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 8.5 13 11l2.5 1L13 13l-1 2.5L11 13l-2.5-1L11 11z" fill="currentColor" stroke="none" />
            <path d="M5 4v3M19 17v3M4 18h2M18 5h2" />
          </svg>
          AI Lender Upload
        </button>
      </header>

      <div className="desk-body" style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* DEAL TERMS */}
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
              <span style={{ fontSize: 10, fontFamily: mono, color: "var(--color-text-subtle)" }}>01</span>
              <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>Deal terms</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--color-primary-subtle)",
                  color: "var(--color-primary)",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 6,
                  letterSpacing: "0.08em",
                  fontFamily: mono,
                }}
              >
                <span
                  className="live-dot"
                  style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-primary)", display: "inline-block" }}
                />
                LIVE
              </span>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--color-text-subtle)" }}>
              Every change re-prices all inventory instantly
            </span>
          </div>

          <div style={{ display: "flex", padding: 18, flexWrap: "wrap", gap: 0 }}>
            {/* Customer & credit */}
            <div style={{ flex: "1.15 1 220px", paddingRight: 22, borderRight: "1px solid var(--color-border)" }}>
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
                      placeholder="720"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Monthly income ($)</label>
                    <input
                      className="dc-input"
                      inputMode="numeric"
                      value={filters.monthlyIncome ?? ""}
                      onChange={numOnChange((n) => setFilter({ monthlyIncome: n || null }))}
                      style={monoInput}
                      placeholder="Gross / mo"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Cash & trade */}
            <div style={{ flex: "1.2 1 220px", padding: "0 22px", borderRight: "1px solid var(--color-border)" }}>
              <div style={sectionLabel}>CASH &amp; TRADE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Cash down ($)</label>
                    <input className="dc-input" inputMode="numeric" value={dealData.downPayment || ""} onChange={numOnChange((n) => setDeal({ downPayment: n }))} style={monoInput} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Trade value ($)</label>
                    <input className="dc-input" inputMode="numeric" value={dealData.tradeInValue || ""} onChange={numOnChange((n) => setDeal({ tradeInValue: n }))} style={monoInput} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Trade payoff ($)</label>
                    <input className="dc-input" inputMode="numeric" value={dealData.tradeInPayoff || ""} onChange={numOnChange((n) => setDeal({ tradeInPayoff: n }))} style={monoInput} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Rebate ($)</label>
                    <input className="dc-input" inputMode="numeric" value={dealData.rebate || ""} onChange={numOnChange((n) => setDeal({ rebate: n }))} style={monoInput} />
                  </div>
                </div>
              </div>
            </div>

            {/* Find / filter */}
            <div style={{ flex: "1.5 1 240px", padding: "0 22px", borderRight: "1px solid var(--color-border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
                <span style={{ ...sectionLabel, marginBottom: 0 }}>FIND / FILTER</span>
                <button
                  onClick={() => setFilters((f) => ({ ...f, vehicle: "", maxPrice: null, maxPayment: null, maxMiles: null, maxOtdLtv: null }))}
                  className="lift-btn"
                  style={{ background: "transparent", border: "none", color: "var(--color-primary)", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0 }}
                >
                  Clear
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1.4 }}>
                    <label style={labelStyle}>Vehicle</label>
                    <input className="dc-input" value={filters.vehicle} onChange={(e) => setFilter({ vehicle: e.target.value })} placeholder="Make / model" style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Max price ($)</label>
                    <input className="dc-input" inputMode="numeric" value={filters.maxPrice ?? ""} onChange={numOnChange((n) => setFilter({ maxPrice: n || null }))} placeholder="Any" style={monoInput} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Max $/mo</label>
                    <input className="dc-input" inputMode="numeric" value={filters.maxPayment ?? ""} onChange={numOnChange((n) => setFilter({ maxPayment: n || null }))} placeholder="Any" style={monoInput} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Max miles</label>
                    <input className="dc-input" inputMode="numeric" value={filters.maxMiles ?? ""} onChange={numOnChange((n) => setFilter({ maxMiles: n || null }))} placeholder="Any" style={monoInput} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Max OTD LTV</label>
                    <input className="dc-input" inputMode="numeric" value={filters.maxOtdLtv ?? ""} onChange={numOnChange((n) => setFilter({ maxOtdLtv: n || null }))} placeholder="Any" style={monoInput} />
                  </div>
                </div>
              </div>
            </div>

            {/* Structure */}
            <div style={{ flex: "1.35 1 200px", paddingLeft: 22 }}>
              <div style={sectionLabel}>STRUCTURE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <div>
                  <label style={labelStyle}>Term (months)</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {TERMS.map((t) => {
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
                            fontSize: 13,
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
                    value={dealData.interestRate ?? ""}
                    onChange={numOnChange((n) => setDeal({ interestRate: n }))}
                    style={monoInput}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* INVENTORY + FOCUSED */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Inventory */}
          <div style={{ flex: 1, minWidth: 0, ...cardStyle, overflow: "hidden" }}>
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
                <span style={{ fontSize: 10, fontFamily: mono, color: "var(--color-text-subtle)" }}>02</span>
                <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>Inventory</span>
                <span style={{ fontSize: 11.5, color: "var(--color-text-subtle)" }}>
                  {scored.length} units · ranked by odds
                </span>
              </div>
            </div>
            {/* header */}
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
              {["VEHICLE", "PRICE", "F·LTV", "FIN", "OTD", "PMT", "ODDS"].map((h, i) => (
                <span
                  key={h}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    fontFamily: mono,
                    color: "var(--color-text-subtle)",
                    textAlign: i === 0 ? "left" : "right",
                  }}
                >
                  {h}
                </span>
              ))}
            </div>
            <div style={{ maxHeight: 560, overflowY: "auto" }}>
              {scored.length === 0 && (
                <div style={{ padding: "40px 18px", textAlign: "center", color: "var(--color-text-subtle)", fontSize: 13 }}>
                  No inventory loaded yet — import a CSV/Excel file or load sample data.
                </div>
              )}
              {scored.map(({ v, appr }) => {
                const isF = focused && v.vin === focused.v.vin;
                const ring = BAND_META[appr.band].colorVar;
                return (
                  <div
                    key={v.vin}
                    className="inv-row"
                    onClick={() => setActiveVehicle(v)}
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
                      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v.make && v.model ? `${v.make} ${v.model}${v.trim ? " " + v.trim : ""}` : v.vehicle}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--color-text-subtle)", fontFamily: mono, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {v.modelYear} · {typeof v.mileage === "number" ? v.mileage.toLocaleString() : "—"} mi · STK {v.stock}
                      </div>
                    </div>
                    <span style={{ fontSize: 12.5, textAlign: "right", fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>
                      {numVal(v.price) === null ? "—" : fmt(v.price as number)}
                    </span>
                    <span style={{ fontSize: 12.5, textAlign: "right", fontFamily: mono, fontVariantNumeric: "tabular-nums", color: "var(--color-text-muted)" }}>
                      {pct(v.frontEndLtv)}
                    </span>
                    <span style={{ fontSize: 13, textAlign: "right", fontFamily: mono, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {numVal(v.amountToFinance) === null ? "—" : fmt(v.amountToFinance as number)}
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 11.5, fontFamily: mono, fontVariantNumeric: "tabular-nums", fontWeight: 600, color: otdColor(v.otdLtv), background: otdBg(v.otdLtv), padding: "3px 7px", borderRadius: 6 }}>
                        {pct(v.otdLtv)}
                      </span>
                    </span>
                    <span style={{ fontSize: 12.5, textAlign: "right", fontFamily: mono, fontVariantNumeric: "tabular-nums", color: "var(--color-text-muted)" }}>
                      {numVal(v.monthlyPayment) === null ? "—" : fmt(v.monthlyPayment as number)}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: mono, color: ring, minWidth: 18, textAlign: "right" }}>
                        {appr.internalScore}
                      </span>
                      <svg width="20" height="20" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--color-border-strong)" strokeWidth="2.5" />
                        <circle
                          className="ring-anim"
                          cx="12"
                          cy="12"
                          r="9"
                          fill="none"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeDasharray="56.55"
                          transform="rotate(-90 12 12)"
                          style={{ stroke: ring, strokeDashoffset: (56.55 * (1 - appr.internalScore / 100)).toFixed(2) }}
                        />
                      </svg>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Focused panel */}
          {focused && (
            <FocusedPanel
              row={focused}
              totalLenders={totalLenders}
              apr={aprNum}
              term={dealData.loanTerm}
              pinned={isPinned(focused.v.vin)}
              onPin={() => toggleFavorite(focused.v.vin)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const FocusedPanel: React.FC<{
  row: Scored;
  totalLenders: number;
  apr: number;
  term: number;
  pinned: boolean;
  onPin: () => void;
}> = ({ row, totalLenders, apr, term, pinned, onPin }) => {
  const { v, appr, fitCount } = row;
  const band = BAND_META[appr.band];
  const amt = numVal(v.amountToFinance);
  const pay = numVal(v.monthlyPayment);
  const payWhole = pay === null ? "—" : "$" + Math.floor(pay).toLocaleString("en-US");
  const payFrac = pay === null ? "" : "." + String(Math.round((pay - Math.floor(pay)) * 100)).padStart(2, "0");

  const termRows = TERMS.map((t) => {
    const p = amt === null ? "Error" : calculateMonthlyPayment(amt, apr, t);
    return { t, pay: typeof p === "number" ? p : null };
  });

  return (
    <div style={{ width: 280, flexShrink: 0, background: "var(--color-bg)", border: "1px solid var(--color-border-strong)", borderRadius: 14, boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
      <div style={{ padding: "16px 19px 14px", borderBottom: "1px solid var(--color-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontFamily: mono, color: "var(--color-text-subtle)" }}>03</span>
          <span style={{ fontSize: 11, fontFamily: mono, color: "var(--color-text-subtle)" }}>
            STK {v.stock} · {typeof v.mileage === "number" ? v.mileage.toLocaleString() : "—"} mi
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", fontFamily: mono, background: "var(--color-primary-subtle)", color: "var(--color-primary)", padding: "2px 7px", borderRadius: 5 }}>
            FOCUSED
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {v.make && v.model ? `${v.make} ${v.model}` : v.vehicle}
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
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {pinned ? "Pinned" : "Pin"}
          </button>
        </div>
      </div>

      {/* Gauge */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 19px 16px", borderBottom: "1px solid var(--color-border)", position: "relative" }}>
        <ApprovalGauge score={appr.internalScore} colorVar={band.colorVar} label={band.label} />
        <div style={{ fontSize: 10, fontFamily: mono, letterSpacing: "0.16em", color: "var(--color-text-muted)", marginTop: -2 }}>
          APPROVAL ODDS / 100
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em", marginTop: 8, color: band.colorVar }}>
          {band.label}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 11, fontFamily: mono, color: "var(--color-text-subtle)" }}>
          <span style={{ color: fitCount >= 4 ? "var(--color-success)" : fitCount >= 1 ? "var(--color-warning)" : "var(--color-danger)", fontWeight: 600 }}>
            {fitCount}/{totalLenders}
          </span>
          lenders fit
        </div>
        <div style={{ fontSize: 9.5, color: "var(--color-text-subtle)", marginTop: 8, textAlign: "center", lineHeight: 1.4 }}>
          Estimate, not a credit decision or offer of credit. Final terms require a lender credit check.
        </div>
      </div>

      {/* Payment hero */}
      <div className="pay-glow" style={{ padding: 19, borderBottom: "1px solid var(--color-border)", position: "relative" }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", fontFamily: mono, color: "var(--color-text-muted)", marginBottom: 6 }}>
          EST. MONTHLY PAYMENT
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{payWhole}</span>
          <span style={{ fontSize: 21, fontWeight: 600, color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>{payFrac}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-subtle)", marginTop: 6 }}>
          {term} mo · {apr}% APR · estimate, not an offer of credit
        </div>
      </div>

      {/* Breakdown */}
      <div style={{ padding: "15px 19px", borderBottom: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 9 }}>
        <Line label="Selling price" value={numVal(v.price) === null ? "—" : fmt(v.price as number)} />
        <Line label="Tax + fees" value={numVal(v.salesTax) === null ? "—" : fmt(v.salesTax as number)} />
        <Line label="OTD LTV" value={pct(v.otdLtv)} color={otdColor(v.otdLtv)} bold />
        {appr.ptiRatio !== undefined && (
          <Line label="Payment-to-income" value={`${appr.ptiRatio.toFixed(1)}%`} color={appr.ptiRatio > 18 ? "var(--color-warning)" : "var(--color-text)"} bold />
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, paddingTop: 9, borderTop: "1px solid var(--color-border)" }}>
          <span style={{ fontWeight: 600 }}>Amount financed</span>
          <span style={{ fontFamily: mono, fontWeight: 700, color: "var(--color-primary)" }}>{amt === null ? "—" : fmt(amt)}</span>
        </div>
      </div>

      {/* Term scenarios */}
      <div style={{ padding: "15px 19px", borderBottom: "1px solid var(--color-border)" }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", fontFamily: mono, color: "var(--color-text-subtle)", marginBottom: 11 }}>
          TERM SCENARIOS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {termRows.map((tr) => (
            <div
              key={tr.t}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                alignItems: "center",
                padding: "7px 11px",
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-subtle)",
              }}
            >
              <span style={{ fontSize: 12, fontFamily: mono, color: "var(--color-text)" }}>{tr.t} mo</span>
              <span style={{ fontSize: 12, fontFamily: mono, fontWeight: 600, textAlign: "right" }}>
                {tr.pay === null ? "—" : fmt(tr.pay) + "/mo"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Line: React.FC<{ label: string; value: string; color?: string; bold?: boolean }> = ({ label, value, color, bold }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
    <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
    <span style={{ fontFamily: mono, fontWeight: bold ? 600 : 400, color: color || "var(--color-text)" }}>{value}</span>
  </div>
);

export default DeskScreen;
