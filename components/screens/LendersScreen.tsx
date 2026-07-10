import React, { useMemo, useRef, useState, lazy, Suspense } from "react";
import { useOutletContext } from "react-router-dom";
import type { ShellOutletContext } from "../shell/AppShell";
import { useDealContext } from "../../context/DealContext";
import { checkBankEligibility } from "../../services/lenderMatcher";
import { updateLenderProfile } from "../../lib/api";
import { getCurrentUser } from "../../lib/pocketbase";
import { toast } from "../../lib/toast";
import { currentDealerQueryKeys, queryClient, queryKeys } from "../../lib/queryClient";
// Lazy: Lender profile editor modal only on demand (avoids pulling its deps into
// lenders chunk until edit action).
const LenderProfileModal = lazy(() => import("../LenderProfileModal"));
import { EmptyState } from "../common/states";
import * as Icons from "../common/Icons";
import type {
  CalculatedVehicle,
  DealData,
  FilterData,
  LenderProfile,
  LenderTier,
} from "../../types";

const mono: React.CSSProperties = { fontFamily: "var(--mono)" };

/**
 * lender_profiles now carry reservePct/fundingDays (migration 1747810001) but
 * the frozen app-level LenderProfile type doesn't declare them yet — widen
 * locally so the editor can bind them. [P7 note: add to types.ts next pass]
 */
type LenderRow = LenderProfile & { reservePct?: number; fundingDays?: string };

/** Matrix grid per the mockup's Lenders block. */
const GRID = "1.7fr 0.95fr 0.8fr 0.85fr 0.8fr 0.85fr 1.5fr 1fr";

const headCell: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.08em",
  ...mono,
  color: "var(--color-text-subtle)",
};

const editLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--color-text-muted)",
  display: "block",
  marginBottom: 5,
};

const editInput: React.CSSProperties = {
  width: "100%",
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  color: "var(--color-text)",
  ...mono,
  outline: "none",
};

/**
 * Parse a numeric program field. An EMPTY input returns undefined — meaning
 * "constraint removed" — never 0: the rules engine treats 0 as a hard cap
 * (maxTerm 0 rejects every term, maxLtv 0 rejects every deal), so a cleared
 * field briefly persisted as 0 would silently kill the lender. [review/P1]
 */
const num = (e: React.ChangeEvent<HTMLInputElement>): number | undefined => {
  if (String(e.target.value).trim() === "") return undefined;
  const x = parseFloat(String(e.target.value).replace(/[^0-9.]/g, ""));
  return Number.isNaN(x) ? undefined : x;
};

/* --- Derived read-only tier badge (reconciliation 2) --------------------- */

interface TierBadge {
  label: string;
  color: string;
  bg: string;
}

const deriveTierBadge = (lender: LenderRow): TierBadge => {
  const tiers = Array.isArray(lender.tiers) ? lender.tiers : [];
  if (tiers.some((t) => Array.isArray(t?.includedMakes) && t.includedMakes.length > 0)) {
    return { label: "Captive", color: "var(--color-primary)", bg: "var(--color-primary-subtle)" };
  }
  const ficos = tiers
    .map((t) => t?.minFico)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const minFico = ficos.length ? Math.min(...ficos) : null;
  if (minFico !== null && minFico >= 640) {
    return { label: "Prime", color: "var(--color-success)", bg: "var(--color-success-subtle)" };
  }
  if (minFico !== null && minFico >= 560) {
    return {
      label: "Near-prime",
      color: "var(--color-warning)",
      bg: "var(--color-warning-subtle)",
    };
  }
  return { label: "Subprime", color: "var(--color-danger)", bg: "var(--color-danger-subtle)" };
};

/* --- Lender-wide aggregates (fallback when no tier matched) --------------- */

interface LenderAggregates {
  maxLtv: number | null;
  maxTerm: number | null;
  minFico: number | null;
  buyRate: number | null;
}

/**
 * Numeric coercion for tier fields. PB stores `tiers` as freeform JSON, and
 * AI-extracted sheets have shipped rates as strings ("6.99", "6.99%") — the
 * old strict typeof check silently rendered those as "—" in the BUY RATE
 * column even though the tier carried a value. Tiers genuinely lacking a
 * rate still aggregate to null → "—". [Phase 8, buy-rate fix]
 */
const numOf = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseFloat(v.replace(/%$/, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const aggregatesFor = (lender: LenderRow): LenderAggregates => {
  const tiers = Array.isArray(lender.tiers) ? lender.tiers : [];
  const collect = (pick: (t: LenderTier) => number | null): number[] =>
    tiers.map((t) => (t ? pick(t) : null)).filter((n): n is number => n !== null);

  const ltvs = collect((t) => numOf(t.otdLtv) ?? numOf(t.maxLtv));
  const terms = collect((t) => numOf(t.maxTerm));
  const ficos = collect((t) => numOf(t.minFico));
  const rates = collect((t) => numOf(t.baseInterestRate));
  return {
    maxLtv: ltvs.length ? Math.max(...ltvs) : null,
    maxTerm: terms.length ? Math.max(...terms) : null,
    minFico: ficos.length ? Math.min(...ficos) : null,
    buyRate: rates.length ? Math.min(...rates) : null,
  };
};

/* --- Status pill (mockup logic, derived honestly from real inputs) -------- */

interface StatusInfo {
  label: string;
  color: string;
  bg: string;
  /** deal-level eligibility (drives the units bar color with units>0) */
  dealEligible: boolean;
}

const statusFor = (
  lender: LenderRow,
  agg: LenderAggregates,
  deal: DealData & FilterData,
  units: number
): StatusInfo => {
  const danger = { color: "var(--color-danger)", bg: "var(--color-danger-subtle)" };
  if (lender.active === false) {
    return { label: "Disabled", ...danger, dealEligible: false };
  }
  const fico = deal.creditScore;
  if (fico != null && agg.minFico !== null && fico < agg.minFico) {
    return { label: "FICO below min", ...danger, dealEligible: false };
  }
  if (agg.maxTerm !== null && deal.loanTerm > agg.maxTerm) {
    return { label: "Term exceeds", ...danger, dealEligible: false };
  }
  const income = deal.monthlyIncome ?? 0;
  if (
    income > 0 &&
    typeof lender.minIncome === "number" &&
    lender.minIncome > 0 &&
    income < lender.minIncome
  ) {
    return { label: "Income below min", ...danger, dealEligible: false };
  }
  if (units > 0) {
    return {
      label: "Active",
      color: "var(--color-success)",
      bg: "var(--color-success-subtle)",
      dealEligible: true,
    };
  }
  return {
    label: "No vehicle fit",
    color: "var(--color-warning)",
    bg: "var(--color-warning-subtle)",
    dealEligible: true,
  };
};

/* ========================================================================== */

/**
 * Lenders screen — the LENDER NETWORK matrix per LTV Desking PRO.dc.html
 * lines 607-675 + plan reconciliation 2. Rows show the tier MATCHED for the
 * live deal + focused vehicle (aggregates fallback, muted); expansion is the
 * lender-level program editor + per-tier accordion, all writing through
 * updateLenderProfile with optimistic context state (which rescore inventory
 * live) and a 500ms write debounce. Sales/manager see a read-only view — the
 * server enforces this via PB rules; the UI disables inputs to match. [P7]
 */
export const LendersScreen: React.FC = () => {
  const { openAiUpload } = useOutletContext<ShellOutletContext>();
  const {
    dealData,
    filters,
    safeLenderProfiles,
    setLenderProfiles,
    processedInventory,
    unitsPerLender,
    focusVin,
    activeVehicle,
    refetchData,
  } = useDealContext();

  const role = getCurrentUser()?.role;
  const canEdit = role === "admin" || role === "superadmin";

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedTier, setExpandedTier] = useState<number | null>(null);
  const [modalProfile, setModalProfile] = useState<LenderProfile | null>(null);

  // The rules engine consumes deal + customer inputs merged (same shape the
  // context's scoring pass uses).
  const mergedDeal = useMemo(
    () => ({ ...dealData, ...filters }) as DealData & FilterData,
    [dealData, filters]
  );

  // Representative vehicle context: the desk's focused VIN, else the active
  // vehicle. When neither resolves, rows fall back to lender-wide aggregates.
  const focusedVehicle = useMemo<CalculatedVehicle | null>(() => {
    if (focusVin) {
      const m = processedInventory.find((v) => v.vin === focusVin);
      if (m) return m;
    }
    if (activeVehicle) {
      const m = processedInventory.find((v) => v.vin === activeVehicle.vin);
      if (m) return m;
    }
    return null;
  }, [processedInventory, focusVin, activeVehicle]);

  const lenders = safeLenderProfiles as LenderRow[];
  const activeCount = lenders.filter((l) => l.active !== false).length;
  const shownCount = processedInventory.length;

  /* --- Debounced optimistic persistence ---------------------------------- */

  const pendingRef = useRef<Record<string, { timer: number; data: Partial<LenderRow> }>>({});

  const queueSave = (id: string, patch: Partial<LenderRow>) => {
    if (!canEdit) return;
    // Optimistic: the context recomputes fits/scores immediately ("adjust to
    // rescore inventory"), the PB write trails by 500ms so keystrokes batch.
    setLenderProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const pending = pendingRef.current[id];
    const data = { ...(pending?.data ?? {}), ...patch };
    if (pending) window.clearTimeout(pending.timer);
    const timer = window.setTimeout(async () => {
      delete pendingRef.current[id];
      // JSON drops `undefined`, so a cleared field would silently KEEP its old
      // server value; send explicit nulls so "constraint removed" persists.
      const wire: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) wire[k] = v === undefined ? null : v;
      const res = await updateLenderProfile(id, wire as never);
      if (res) {
        toast.success("Lender program saved");
        // RQ integration + cache sync for lenderProfiles (optimistic already in context)
        queryClient.setQueryData<LenderProfile[]>(currentDealerQueryKeys().lenderProfiles, (old) =>
          Array.isArray(old) ? old.map((p) => (p.id === id ? { ...p, ...data } : p)) : old
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.lenderProfiles });
      } else {
        // Revert the optimistic edit to the server's truth — otherwise the
        // screen shows terms the backend never accepted, forever. [review/P1]
        toast.error("Couldn't save lender changes — restoring server values.");
        void refetchData();
      }
    }, 500);
    pendingRef.current[id] = { timer, data };
  };

  const editTier = (lender: LenderRow, idx: number, patch: Partial<LenderTier>) => {
    const tiers = (Array.isArray(lender.tiers) ? lender.tiers : []).map((t, i) =>
      i === idx ? { ...t, ...patch } : t
    );
    queueSave(lender.id, { tiers });
  };

  const handleModalSave = async (profile: LenderProfile) => {
    setLenderProfiles((prev) => prev.map((p) => (p.id === profile.id ? { ...p, ...profile } : p)));
    setModalProfile(null);
    const res = await updateLenderProfile(profile.id, profile as never);
    if (res) {
      toast.success(`${profile.name} updated`);
      queryClient.setQueryData<LenderProfile[]>(currentDealerQueryKeys().lenderProfiles, (old) =>
        Array.isArray(old) ? old.map((p) => (p.id === profile.id ? { ...p, ...profile } : p)) : old
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.lenderProfiles });
    } else {
      toast.error("Couldn't save the lender program — restoring server values.");
      void refetchData();
    }
  };

  /* ----------------------------------------------------------------------- */

  return (
    <div data-screen-label="Lenders">
      <header
        style={{
          height: 58,
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span
            style={{
              fontSize: 11,
              ...mono,
              letterSpacing: "0.18em",
              color: "var(--color-text-subtle)",
            }}
          >
            LENDER NETWORK
          </span>
          <div style={{ height: 20, width: 1, background: "var(--color-border)" }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>{activeCount} active programs</span>
          <span style={{ fontSize: 13, color: "var(--color-text-subtle)" }}>
            eligibility recalculated against the live deal
          </span>
        </div>
        <button
          onClick={openAiUpload}
          className="transition-colors btn-primary"
          aria-label="AI Lender Upload"
          title="Upload and parse lender rate sheet with AI"
          style={{
            border: "1px solid transparent",
            borderRadius: 8,
            padding: "8px 13px",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
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
            <path
              d="M12 8.5 13 11l2.5 1L13 13l-1 2.5L11 13l-2.5-1L11 11z"
              fill="currentColor"
              stroke="none"
            />
            <path d="M5 4v3M19 17v3M4 18h2M18 5h2" />
          </svg>
          AI Lender Upload
        </button>
      </header>

      <div style={{ padding: "20px 24px" }}>
        <div
          className="dc-card"
          role="table"
          aria-label="Lender network programs and eligibility"
          style={{
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            boxShadow: "var(--shadow)",
            overflow: "hidden",
          }}
        >
          {/* Column header */}
          <div
            role="row"
            aria-rowindex={1}
            style={{
              display: "grid",
              gridTemplateColumns: GRID,
              columnGap: 13,
              alignItems: "center",
              padding: "11px 20px",
              background: "var(--color-bg-subtle)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <span role="columnheader" style={headCell}>
              Lender
            </span>
            <span role="columnheader" style={headCell}>
              Tier
            </span>
            <span role="columnheader" style={{ ...headCell, textAlign: "right" }}>
              Max LTV
            </span>
            <span role="columnheader" style={{ ...headCell, textAlign: "right" }}>
              Max term
            </span>
            <span role="columnheader" style={{ ...headCell, textAlign: "right" }}>
              Min FICO
            </span>
            <span role="columnheader" style={{ ...headCell, textAlign: "right" }}>
              Buy rate
            </span>
            <span role="columnheader" style={headCell}>
              Units fitting
            </span>
            <span role="columnheader" style={{ ...headCell, textAlign: "right" }}>
              Status
            </span>
          </div>

          {lenders.length === 0 && (
            <EmptyState
              icon={<Icons.BuildingLibraryIcon className="w-full h-full" />}
              title="No lender programs yet"
              description="Use AI Lender Upload to extract programs from a rate sheet, or add them manually via the full program editor."
              primaryAction={{ label: "AI Lender Upload", onClick: openAiUpload }}
            />
          )}

          {lenders.map((l) => {
            const badge = deriveTierBadge(l);
            const agg = aggregatesFor(l);
            const units = unitsPerLender[l.id] ?? 0;
            const status = statusFor(l, agg, mergedDeal, units);
            const barPct = shownCount > 0 ? Math.round((units / shownCount) * 100) : 0;
            const barColor =
              status.dealEligible && units > 0 ? "var(--color-success)" : "var(--color-warning)";

            // Tier matched for the live deal + focused vehicle (rules engine).
            const matched = focusedVehicle
              ? checkBankEligibility(focusedVehicle, mergedDeal, l).matchedTier
              : null;
            const isAggregate = !matched;
            const rowLtv = matched ? (numOf(matched.otdLtv) ?? numOf(matched.maxLtv)) : agg.maxLtv;
            const rowTerm = matched ? (numOf(matched.maxTerm) ?? agg.maxTerm) : agg.maxTerm;
            const rowFico = matched ? (numOf(matched.minFico) ?? agg.minFico) : agg.minFico;
            const rowRate = matched
              ? (numOf(matched.baseInterestRate) ?? agg.buyRate)
              : agg.buyRate;
            const valColor = isAggregate ? "var(--color-text-subtle)" : undefined;

            const tiers = Array.isArray(l.tiers) ? l.tiers : [];
            const expanded = expandedId === l.id;
            const isActive = l.active !== false;

            return (
              <div key={l.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                {/* Matrix row */}
                <div
                  className="inv-row"
                  role="row"
                  aria-expanded={expanded}
                  aria-label={`${l.name} program details`}
                  aria-controls={`lender-panel-${l.id}`}
                  onClick={() => {
                    setExpandedId(expanded ? null : l.id);
                    setExpandedTier(null);
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: GRID,
                    columnGap: 13,
                    alignItems: "center",
                    padding: "13px 20px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(expanded ? null : l.id);
                        setExpandedTier(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedId(expanded ? null : l.id);
                          setExpandedTier(null);
                        }
                      }}
                      aria-expanded={expanded}
                      aria-controls={`lender-panel-${l.id}`}
                      aria-label={`${expanded ? "Collapse" : "Expand"} ${l.name} program`}
                      tabIndex={0}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        margin: 0,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--color-text-subtle)",
                          width: 8,
                          flexShrink: 0,
                        }}
                      >
                        {expanded ? "▾" : "▸"}
                      </span>
                    </button>
                    <span
                      style={{
                        fontSize: 14.5,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {l.name}
                    </span>
                    {tiers.length > 1 && (
                      <span
                        style={{
                          fontSize: 10,
                          ...mono,
                          background: "var(--color-bg-muted)",
                          color: "var(--color-text-muted)",
                          padding: "1px 6px",
                          borderRadius: 5,
                          flexShrink: 0,
                        }}
                      >
                        {tiers.length} tiers
                      </span>
                    )}
                  </div>
                  <span>
                    <span
                      title="derived from program tiers"
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        ...mono,
                        padding: "2px 7px",
                        borderRadius: 5,
                        color: badge.color,
                        background: badge.bg,
                      }}
                    >
                      {badge.label}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      textAlign: "right",
                      ...mono,
                      fontVariantNumeric: "tabular-nums",
                      color: valColor,
                    }}
                  >
                    {rowLtv === null ? "—" : `${Math.round(rowLtv)}%`}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      textAlign: "right",
                      ...mono,
                      color: valColor ?? "var(--color-text-muted)",
                    }}
                  >
                    {rowTerm === null ? "—" : `${rowTerm} mo`}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      textAlign: "right",
                      ...mono,
                      color: valColor ?? "var(--color-text-muted)",
                    }}
                  >
                    {rowFico === null ? "—" : rowFico}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      textAlign: "right",
                      ...mono,
                      fontVariantNumeric: "tabular-nums",
                      color: valColor,
                    }}
                  >
                    {rowRate === null ? "—" : `${rowRate}%`}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        borderRadius: 3,
                        background: "var(--color-bg-muted)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        className="ring-anim"
                        style={{
                          height: "100%",
                          width: `${barPct}%`,
                          background: barColor,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        ...mono,
                        color: "var(--color-text-muted)",
                        minWidth: 30,
                        textAlign: "right",
                      }}
                    >
                      {units}/{shownCount}
                    </span>
                  </div>
                  <span style={{ textAlign: "right" }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        ...mono,
                        padding: "3px 9px",
                        borderRadius: 6,
                        color: status.color,
                        background: status.bg,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {status.label}
                    </span>
                  </span>
                </div>

                {/* Expansion — program parameter editor */}
                {expanded && (
                  <div
                    id={`lender-panel-${l.id}`}
                    style={{ padding: "4px 20px 18px 37px", background: "var(--color-bg-subtle)" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        margin: "10px 0 12px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.1em",
                          ...mono,
                          color: "var(--color-text-subtle)",
                        }}
                      >
                        PROGRAM PARAMETERS · ADJUST TO RESCORE INVENTORY
                        {!canEdit && (
                          <span style={{ marginLeft: 10, color: "var(--color-text-muted)" }}>
                            · READ-ONLY FOR YOUR ROLE
                          </span>
                        )}
                      </span>
                      {canEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            queueSave(l.id, { active: !isActive });
                          }}
                          className="transition-colors"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            background: isActive
                              ? "var(--color-success-subtle)"
                              : "var(--color-bg-muted)",
                            color: isActive ? "var(--color-success)" : "var(--color-text-subtle)",
                            border: `1px solid ${isActive ? "var(--color-success)" : "var(--color-text-subtle)"}`,
                            borderRadius: 7,
                            padding: "4px 11px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: isActive
                                ? "var(--color-success)"
                                : "var(--color-text-subtle)",
                            }}
                          />
                          {isActive ? "Active" : "Disabled"}
                        </button>
                      )}
                    </div>

                    {/* Lender-level program block */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: 12,
                        marginBottom: 14,
                        maxWidth: 820,
                      }}
                      role="group"
                      aria-label={`Program parameters for ${l.name}`}
                    >
                      <div>
                        <label htmlFor={`lender-${l.id}-min-income`} style={editLabel}>
                          Min income ($/mo)
                        </label>
                        <input
                          id={`lender-${l.id}-min-income`}
                          className="dc-input"
                          inputMode="numeric"
                          disabled={!canEdit}
                          value={l.minIncome ?? ""}
                          onChange={(e) => queueSave(l.id, { minIncome: num(e) })}
                          style={editInput}
                        />
                      </div>
                      <div>
                        <label htmlFor={`lender-${l.id}-max-pti`} style={editLabel}>
                          Max PTI (%)
                        </label>
                        <input
                          id={`lender-${l.id}-max-pti`}
                          className="dc-input"
                          inputMode="numeric"
                          disabled={!canEdit}
                          value={l.maxPti ?? ""}
                          onChange={(e) => queueSave(l.id, { maxPti: num(e) })}
                          style={editInput}
                        />
                      </div>
                      <div>
                        <label htmlFor={`lender-${l.id}-max-backend`} style={editLabel}>
                          Max backend ($)
                        </label>
                        <input
                          id={`lender-${l.id}-max-backend`}
                          className="dc-input"
                          inputMode="numeric"
                          disabled={!canEdit}
                          value={l.maxBackend ?? ""}
                          onChange={(e) => queueSave(l.id, { maxBackend: num(e) })}
                          style={editInput}
                        />
                      </div>
                      <div>
                        <label htmlFor={`lender-${l.id}-book-source`} style={editLabel}>
                          Book source
                        </label>
                        <select
                          id={`lender-${l.id}-book-source`}
                          className="dc-input"
                          disabled={!canEdit}
                          value={l.bookValueSource ?? "Trade"}
                          onChange={(e) =>
                            queueSave(l.id, {
                              bookValueSource: e.target.value as "Trade" | "Retail",
                            })
                          }
                          style={{
                            ...editInput,
                            fontFamily: "inherit",
                            cursor: canEdit ? "pointer" : "default",
                          }}
                          aria-label="Book source"
                        >
                          <option value="Trade">Trade</option>
                          <option value="Retail">Retail</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`lender-${l.id}-reserve`} style={editLabel}>
                          Reserve (%)
                        </label>
                        <input
                          id={`lender-${l.id}-reserve`}
                          className="dc-input"
                          inputMode="decimal"
                          disabled={!canEdit}
                          value={l.reservePct ?? ""}
                          onChange={(e) => queueSave(l.id, { reservePct: num(e) })}
                          style={editInput}
                        />
                      </div>
                      <div>
                        <label htmlFor={`lender-${l.id}-funding-days`} style={editLabel}>
                          Funding days
                        </label>
                        <input
                          id={`lender-${l.id}-funding-days`}
                          className="dc-input"
                          disabled={!canEdit}
                          value={l.fundingDays ?? ""}
                          placeholder="e.g. 1–2 days"
                          onChange={(e) => queueSave(l.id, { fundingDays: e.target.value })}
                          style={editInput}
                        />
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <label htmlFor={`lender-${l.id}-contact-email`} style={editLabel}>
                          Contact email
                        </label>
                        <input
                          id={`lender-${l.id}-contact-email`}
                          className="dc-input"
                          type="email"
                          disabled={!canEdit}
                          value={l.contactEmail ?? ""}
                          placeholder="dealerdesk@lender.com"
                          onChange={(e) => queueSave(l.id, { contactEmail: e.target.value })}
                          style={editInput}
                        />
                      </div>
                    </div>

                    {/* Tier accordion */}
                    <div
                      style={{
                        border: "1px solid var(--color-border)",
                        borderRadius: 10,
                        overflow: "hidden",
                        maxWidth: 820,
                        background: "var(--color-bg)",
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          padding: "9px 14px",
                          borderBottom: "1px solid var(--color-border)",
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.1em",
                          ...mono,
                          color: "var(--color-text-subtle)",
                          background: "var(--color-bg-subtle)",
                        }}
                      >
                        PROGRAM TIERS · {tiers.length}
                      </div>
                      {tiers.length === 0 && (
                        <div
                          style={{
                            padding: "14px",
                            fontSize: 13,
                            color: "var(--color-text-muted)",
                          }}
                          role="status"
                          aria-live="polite"
                        >
                          No tiers on this program yet — use “Edit full program” to add one.
                        </div>
                      )}
                      {tiers.map((t, idx) => {
                        const tOpen = expandedTier === idx;
                        const tLtv = numOf(t.otdLtv) ?? numOf(t.maxLtv);
                        const usesOtd = t.otdLtv !== undefined;
                        const usesYearRange = t.minYear !== undefined || t.maxYear !== undefined;
                        const isMatched = matched === t;
                        return (
                          <div
                            key={idx}
                            style={{
                              borderTop: idx > 0 ? "1px solid var(--color-border)" : "none",
                            }}
                          >
                            <div
                              className="inv-row"
                              role="row"
                              aria-expanded={tOpen}
                              aria-label={`${t.tierName || t.name || `Tier ${idx + 1}`} tier details`}
                              aria-controls={`tier-panel-${l.id}-${idx}`}
                              onClick={() => setExpandedTier(tOpen ? null : idx)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "10px 14px",
                                cursor: "pointer",
                              }}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedTier(tOpen ? null : idx);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setExpandedTier(tOpen ? null : idx);
                                  }
                                }}
                                aria-expanded={tOpen}
                                aria-controls={`tier-panel-${l.id}-${idx}`}
                                aria-label={`${tOpen ? "Collapse" : "Expand"} ${t.tierName || t.name || `Tier ${idx + 1}`}`}
                                tabIndex={0}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  padding: 0,
                                  margin: 0,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: "var(--color-text-subtle)",
                                    width: 8,
                                  }}
                                >
                                  {tOpen ? "▾" : "▸"}
                                </span>
                              </button>
                              <span
                                style={{
                                  fontSize: 13.5,
                                  fontWeight: 600,
                                  minWidth: 0,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {t.tierName || t.name || `Tier ${idx + 1}`}
                              </span>
                              {isMatched && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    ...mono,
                                    background: "var(--color-success-subtle)",
                                    color: "var(--color-success)",
                                    padding: "2px 7px",
                                    borderRadius: 5,
                                  }}
                                >
                                  MATCHED
                                </span>
                              )}
                              <span
                                style={{
                                  marginLeft: "auto",
                                  fontSize: 12,
                                  ...mono,
                                  color: "var(--color-text-subtle)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {t.minFico !== undefined ? `FICO ${t.minFico}+` : "any FICO"}
                                {" · "}
                                {tLtv !== null ? `${Math.round(tLtv)}% LTV` : "no LTV cap"}
                                {" · "}
                                {t.maxTerm !== undefined ? `${t.maxTerm} mo` : "any term"}
                              </span>
                            </div>
                            {tOpen && (
                              <div
                                id={`tier-panel-${l.id}-${idx}`}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(4, 1fr)",
                                  gap: 12,
                                  padding: "4px 14px 14px 32px",
                                }}
                                role="group"
                                aria-label={`Tier ${idx + 1} parameters for ${l.name}`}
                              >
                                <div>
                                  <label htmlFor={`tier-${l.id}-${idx}-ltv`} style={editLabel}>
                                    {usesOtd ? "Max OTD LTV (%)" : "Max LTV (%)"}
                                  </label>
                                  <input
                                    id={`tier-${l.id}-${idx}-ltv`}
                                    className="dc-input"
                                    inputMode="numeric"
                                    disabled={!canEdit}
                                    value={(usesOtd ? t.otdLtv : t.maxLtv) ?? ""}
                                    onChange={(e) =>
                                      editTier(
                                        l,
                                        idx,
                                        usesOtd ? { otdLtv: num(e) } : { maxLtv: num(e) }
                                      )
                                    }
                                    style={editInput}
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`tier-${l.id}-${idx}-term`} style={editLabel}>
                                    Max term (mo)
                                  </label>
                                  <input
                                    id={`tier-${l.id}-${idx}-term`}
                                    className="dc-input"
                                    inputMode="numeric"
                                    disabled={!canEdit}
                                    value={t.maxTerm ?? ""}
                                    onChange={(e) => editTier(l, idx, { maxTerm: num(e) })}
                                    style={editInput}
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`tier-${l.id}-${idx}-fico`} style={editLabel}>
                                    Min FICO
                                  </label>
                                  <input
                                    id={`tier-${l.id}-${idx}-fico`}
                                    className="dc-input"
                                    inputMode="numeric"
                                    disabled={!canEdit}
                                    value={t.minFico ?? ""}
                                    onChange={(e) => editTier(l, idx, { minFico: num(e) })}
                                    style={editInput}
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`tier-${l.id}-${idx}-rate`} style={editLabel}>
                                    Buy rate (%)
                                  </label>
                                  <input
                                    id={`tier-${l.id}-${idx}-rate`}
                                    className="dc-input"
                                    inputMode="decimal"
                                    disabled={!canEdit}
                                    value={t.baseInterestRate ?? ""}
                                    onChange={(e) => editTier(l, idx, { baseInterestRate: num(e) })}
                                    style={editInput}
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`tier-${l.id}-${idx}-mileage`} style={editLabel}>
                                    Max mileage
                                  </label>
                                  <input
                                    id={`tier-${l.id}-${idx}-mileage`}
                                    className="dc-input"
                                    inputMode="numeric"
                                    disabled={!canEdit}
                                    value={t.maxMileage ?? ""}
                                    onChange={(e) => editTier(l, idx, { maxMileage: num(e) })}
                                    style={editInput}
                                  />
                                </div>
                                {usesYearRange ? (
                                  <>
                                    <div>
                                      <label
                                        htmlFor={`tier-${l.id}-${idx}-min-year`}
                                        style={editLabel}
                                      >
                                        Min year
                                      </label>
                                      <input
                                        id={`tier-${l.id}-${idx}-min-year`}
                                        className="dc-input"
                                        inputMode="numeric"
                                        disabled={!canEdit}
                                        value={t.minYear ?? ""}
                                        onChange={(e) => editTier(l, idx, { minYear: num(e) })}
                                        style={editInput}
                                      />
                                    </div>
                                    <div>
                                      <label
                                        htmlFor={`tier-${l.id}-${idx}-max-year`}
                                        style={editLabel}
                                      >
                                        Max year
                                      </label>
                                      <input
                                        id={`tier-${l.id}-${idx}-max-year`}
                                        className="dc-input"
                                        inputMode="numeric"
                                        disabled={!canEdit}
                                        value={t.maxYear ?? ""}
                                        onChange={(e) => editTier(l, idx, { maxYear: num(e) })}
                                        style={editInput}
                                      />
                                    </div>
                                  </>
                                ) : (
                                  <div>
                                    <label
                                      htmlFor={`tier-${l.id}-${idx}-max-age`}
                                      style={editLabel}
                                    >
                                      Max age (yrs)
                                    </label>
                                    <input
                                      id={`tier-${l.id}-${idx}-max-age`}
                                      className="dc-input"
                                      inputMode="numeric"
                                      disabled={!canEdit}
                                      value={t.maxAge ?? ""}
                                      onChange={(e) => editTier(l, idx, { maxAge: num(e) })}
                                      style={editInput}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        maxWidth: 820,
                      }}
                    >
                      <div style={{ fontSize: 12, color: "var(--color-text-subtle)" }}>
                        Buyer contact ·{" "}
                        <span style={{ ...mono, color: "var(--color-text-muted)" }}>
                          {l.contactEmail || l.contactPhone || "—"}
                        </span>
                      </div>
                      {canEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalProfile(l);
                          }}
                          className="transition-colors"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--color-primary)",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            padding: 0,
                          }}
                        >
                          Edit full program →
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Full program editor (existing modal, kept as-is) */}
      <Suspense fallback={null}>
        <LenderProfileModal
          profile={modalProfile}
          isOpen={modalProfile !== null}
          onClose={() => setModalProfile(null)}
          onSave={handleModalSave}
        />
      </Suspense>
    </div>
  );
};

export default LendersScreen;
