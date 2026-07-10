import React, { useMemo, useCallback } from "react";
import { useDealContext } from "../../context/DealContext";
import { APPROVAL_CONFIG } from "../../services/approvalScorer";
import { activeLenderCount } from "../../services/lenderFit";
import {
  asPipelineDeal,
  pipelineMetricsFromCalculatedData,
  statusBucket,
} from "../../lib/dealMappers";
import { fmt } from "../../utils/format";
import { EmptyState } from "../common/states";
import * as Icons from "../common/Icons";
import type { CalculatedVehicle } from "../../types";

const mono: React.CSSProperties = { fontFamily: "var(--mono)" };

const card: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: 14,
  boxShadow: "var(--shadow)",
};

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  ...mono,
  color: "var(--color-text-muted)",
};

const panelLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  ...mono,
  color: "var(--color-text-subtle)",
  marginBottom: 16,
};

const numVal = (v: number | "Error" | "N/A" | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Approval color by the scorer's band thresholds (strong/moderate). */
const approvalColor = (s: number): string =>
  s >= APPROVAL_CONFIG.bands.strong
    ? "var(--color-success)"
    : s >= APPROVAL_CONFIG.bands.moderate
      ? "var(--color-warning)"
      : "var(--color-danger)";

interface BarRowProps {
  label: React.ReactNode;
  labelWidth: number;
  pct: number;
  color: string;
  height?: number;
  right: React.ReactNode;
  rightWidth: number;
}

const BarRowComponent: React.FC<BarRowProps> = ({
  label,
  labelWidth,
  pct,
  color,
  height = 9,
  right,
  rightWidth,
}) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <span
      style={{
        fontSize: 13,
        width: labelWidth,
        color: "var(--color-text-muted)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
    <div
      style={{
        flex: 1,
        height,
        borderRadius: 5,
        background: "var(--color-bg-muted)",
        overflow: "hidden",
      }}
    >
      <div
        className="ring-anim"
        style={{
          height: "100%",
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: color,
          borderRadius: 5,
        }}
      />
    </div>
    <span
      style={{
        fontSize: 13,
        ...mono,
        fontWeight: 600,
        width: rightWidth,
        textAlign: "right",
        flexShrink: 0,
      }}
    >
      {right}
    </span>
  </div>
);

const BarRow = React.memo(BarRowComponent);

/**
 * Reports — pure client aggregation over the context's single scoring pass
 * (processedInventory: the same set the desk ranks), savedDeals,
 * unitsPerLender and the active lender roster. Mirrors the REPORTS block of
 * LTV Desking PRO.dc.html (lines 678-758). No new fetches; everything is
 * derived from real scorer/calculator outputs. [P7]
 */
const ReportsScreenBase: React.FC = () => {
  const { settings, processedInventory, safeLenderProfiles, savedDeals, unitsPerLender } =
    useDealContext();

  const totalLenders = activeLenderCount(safeLenderProfiles);

  const stats = useMemo(() => {
    const rows = processedInventory;
    const n = rows.length;

    const scores = rows.map((v) => v.approvalScore ?? 0);
    const otds = rows.map((v) => numVal(v.otdLtv)).filter((x): x is number => x !== null);
    const pays = rows.map((v) => numVal(v.monthlyPayment)).filter((x): x is number => x !== null);
    const prices = rows.map((v) => numVal(v.price)).filter((x): x is number => x !== null);

    const avgScore = n ? Math.round(scores.reduce((a, b) => a + b, 0) / n) : null;
    const avgOtd = otds.length ? Math.round(otds.reduce((a, b) => a + b, 0) / otds.length) : null;
    const avgPay = pays.length ? pays.reduce((a, b) => a + b, 0) / pays.length : null;
    const totalValue = prices.reduce((a, b) => a + b, 0);

    const strong = rows.filter(
      (v) => (v.approvalScore ?? 0) >= APPROVAL_CONFIG.bands.strong
    ).length;
    const moderate = rows.filter((v) => {
      const s = v.approvalScore ?? 0;
      return s >= APPROVAL_CONFIG.bands.moderate && s < APPROVAL_CONFIG.bands.strong;
    }).length;
    const weak = n - strong - moderate;

    const best = rows.reduce<CalculatedVehicle | null>(
      (a, v) => (a === null || (v.approvalScore ?? 0) > (a.approvalScore ?? 0) ? v : a),
      null
    );

    const avgLenders = n ? rows.reduce((a, v) => a + (v.fitCount ?? 0), 0) / n : null;

    // Approval by make — unparseable makes land in an "Other" bucket.
    const makeMap = new Map<string, { n: number; sum: number }>();
    for (const v of rows) {
      let mk = (v.make || "").trim();
      if (!mk) {
        // vehicle strings are "YYYY Make Model Trim" — parse the second token.
        const parts = (v.vehicle || "").trim().split(/\s+/);
        mk = /^\d{4}$/.test(parts[0] || "") ? parts[1] || "" : parts[0] || "";
      }
      if (!mk) mk = "Other";
      const cur = makeMap.get(mk) ?? { n: 0, sum: 0 };
      cur.n += 1;
      cur.sum += v.approvalScore ?? 0;
      makeMap.set(mk, cur);
    }
    const makeRows = [...makeMap.entries()]
      .map(([mk, m]) => ({ mk, n: m.n, avg: Math.round(m.sum / m.n) }))
      .sort((a, b) => b.avg - a.avg);

    return {
      n,
      avgScore,
      avgOtd,
      avgPay,
      totalValue,
      strong,
      moderate,
      weak,
      best,
      avgLenders,
      makeRows,
      payMin: pays.length ? Math.min(...pays) : null,
      payMax: pays.length ? Math.max(...pays) : null,
    };
  }, [processedInventory]);

  // Pipeline snapshot via the shared Phase-6 helpers (statusBucket +
  // persisted calculatedData snapshot, falling back to the vehicle snapshot's
  // financed amount when a save predates the metric snapshot).
  const pStats = useMemo(() => {
    const deals = savedDeals.map(asPipelineDeal);
    const total = deals.length;
    const buckets = { pending: 0, approved: 0, funded: 0, declined: 0 };
    let financed = 0;
    for (const d of deals) {
      buckets[statusBucket(d.status)] += 1;
      const amt =
        pipelineMetricsFromCalculatedData(d.calculatedData).financed ??
        numVal(d.vehicle?.amountToFinance);
      if (amt !== null) financed += amt;
    }
    return {
      total,
      financed,
      funded: buckets.funded,
      declined: buckets.declined,
      approvalRate: total ? Math.round(((buckets.approved + buckets.funded) / total) * 100) : null,
    };
  }, [savedDeals]);

  // OTD LTV colors come from dealer settings, never hardcoded thresholds.
  const { warn, danger } = settings.ltvThresholds;
  const otdColor = (l: number): string =>
    l >= danger
      ? "var(--color-danger)"
      : l >= warn
        ? "var(--color-warning)"
        : "var(--color-success)";

  const pct = (count: number): string =>
    stats.n ? `${Math.round((count / stats.n) * 100)}%` : "0%";

  const bestName = stats.best
    ? stats.best.make && stats.best.model
      ? `${stats.best.make} ${stats.best.model}${stats.best.trim ? " " + stats.best.trim : ""}`
      : stats.best.vehicle
    : "—";
  const bestScore = stats.best?.approvalScore ?? null;

  const lenderReach = safeLenderProfiles.filter((l) => l.active !== false);

  return (
    <div data-screen-label="Reports">
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
            PERFORMANCE
          </span>
          <div style={{ height: 20, width: 1, background: "var(--color-border)" }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Inventory desirability</span>
          <span style={{ fontSize: 13, color: "var(--color-text-subtle)" }}>
            live, against the current deal structure
          </span>
        </div>
      </header>

      <div style={{ padding: "22px 24px", maxWidth: 1100 }}>
        {stats.n === 0 ? (
          <EmptyState
            icon={<Icons.ChartIcon className="w-full h-full" />}
            title="No inventory data"
            description="Import inventory on the Inventory screen or load sample data to see performance reports, approval distribution, and lender reach."
          />
        ) : (
          <>
            {/* KPI row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 14,
                marginBottom: 14,
              }}
            >
              <div className="dc-card" style={{ ...card, padding: 18 }}>
                <div style={kpiLabel}>Avg approval</div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    marginTop: 8,
                    letterSpacing: "-0.02em",
                    color:
                      stats.avgScore === null
                        ? "var(--color-text-subtle)"
                        : approvalColor(stats.avgScore),
                  }}
                >
                  {stats.avgScore ?? "—"}
                </div>
              </div>
              <div className="dc-card" style={{ ...card, padding: 18 }}>
                <div style={kpiLabel}>Avg OTD LTV</div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    marginTop: 8,
                    letterSpacing: "-0.02em",
                    color:
                      stats.avgOtd === null ? "var(--color-text-subtle)" : otdColor(stats.avgOtd),
                  }}
                >
                  {stats.avgOtd === null ? "—" : `${stats.avgOtd}%`}
                </div>
              </div>
              <div className="dc-card" style={{ ...card, padding: 18 }}>
                <div style={kpiLabel}>Avg payment</div>
                <div
                  style={{ fontSize: 32, fontWeight: 700, marginTop: 8, letterSpacing: "-0.02em" }}
                >
                  {stats.avgPay === null ? "—" : `${fmt(stats.avgPay)}/mo`}
                </div>
              </div>
              <div className="dc-card" style={{ ...card, padding: 18 }}>
                <div style={kpiLabel}>Inventory value</div>
                <div
                  style={{ fontSize: 32, fontWeight: 700, marginTop: 8, letterSpacing: "-0.02em" }}
                >
                  {fmt(stats.totalValue)}
                </div>
              </div>
            </div>

            {/* Approval distribution */}
            <div className="dc-card" style={{ ...card, padding: 20 }}>
              <div style={panelLabel}>APPROVAL DISTRIBUTION · {stats.n} UNITS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <BarRow
                  label={
                    <>
                      Strong{" "}
                      <span style={{ color: "var(--color-text-subtle)" }}>
                        ({APPROVAL_CONFIG.bands.strong}+)
                      </span>
                    </>
                  }
                  labelWidth={130}
                  pct={stats.n ? (stats.strong / stats.n) * 100 : 0}
                  color="var(--color-success)"
                  height={10}
                  right={`${stats.strong} · ${pct(stats.strong)}`}
                  rightWidth={70}
                />
                <BarRow
                  label={
                    <>
                      Moderate{" "}
                      <span style={{ color: "var(--color-text-subtle)" }}>
                        ({APPROVAL_CONFIG.bands.moderate}–{APPROVAL_CONFIG.bands.strong - 1})
                      </span>
                    </>
                  }
                  labelWidth={130}
                  pct={stats.n ? (stats.moderate / stats.n) * 100 : 0}
                  color="var(--color-warning)"
                  height={10}
                  right={`${stats.moderate} · ${pct(stats.moderate)}`}
                  rightWidth={70}
                />
                <BarRow
                  label={
                    <>
                      Weak{" "}
                      <span style={{ color: "var(--color-text-subtle)" }}>
                        (&lt;{APPROVAL_CONFIG.bands.moderate})
                      </span>
                    </>
                  }
                  labelWidth={130}
                  pct={stats.n ? (stats.weak / stats.n) * 100 : 0}
                  color="var(--color-danger)"
                  height={10}
                  right={`${stats.weak} · ${pct(stats.weak)}`}
                  rightWidth={70}
                />
              </div>
            </div>

            {/* 3-card row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 14,
                marginTop: 14,
              }}
            >
              <div className="dc-card" style={{ ...card, padding: 18 }}>
                <div style={kpiLabel}>Most approvable</div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    marginTop: 8,
                    letterSpacing: "-0.01em",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {bestName}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    ...mono,
                    marginTop: 4,
                    color:
                      bestScore === null ? "var(--color-text-subtle)" : approvalColor(bestScore),
                  }}
                >
                  {bestScore === null ? "—" : `${bestScore} / 100 odds`}
                </div>
              </div>
              <div className="dc-card" style={{ ...card, padding: 18 }}>
                <div style={kpiLabel}>Payment range</div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    ...mono,
                    marginTop: 10,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {stats.payMin === null || stats.payMax === null
                    ? "—"
                    : `${fmt(stats.payMin)} – ${fmt(stats.payMax)}`}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-subtle)", marginTop: 5 }}>
                  per month, current deal
                </div>
              </div>
              <div className="dc-card" style={{ ...card, padding: 18 }}>
                <div style={kpiLabel}>Avg lenders / unit</div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    ...mono,
                    marginTop: 8,
                    letterSpacing: "-0.02em",
                    color: "var(--color-primary)",
                  }}
                >
                  {stats.avgLenders === null
                    ? "—"
                    : `${stats.avgLenders.toFixed(1)} / ${totalLenders}`}
                </div>
              </div>
            </div>

            {/* By make + lender reach */}
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}
            >
              <div className="dc-card" style={{ ...card, padding: 20 }}>
                <div style={panelLabel}>Approval by make</div>
                <div
                  role="list"
                  aria-label="Approval scores by make"
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  {stats.makeRows.length === 0 && (
                    <span
                      role="status"
                      aria-live="polite"
                      style={{ fontSize: 13, color: "var(--color-text-subtle)" }}
                    >
                      No inventory loaded.
                    </span>
                  )}
                  {stats.makeRows.map((m) => (
                    <div
                      key={m.mk}
                      role="listitem"
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          width: 96,
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          flexShrink: 0,
                        }}
                      >
                        {m.mk}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 9,
                          borderRadius: 5,
                          background: "var(--color-bg-muted)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          className="ring-anim"
                          style={{
                            height: "100%",
                            width: `${m.avg}%`,
                            background: approvalColor(m.avg),
                            borderRadius: 5,
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 13,
                          ...mono,
                          fontWeight: 700,
                          width: 26,
                          textAlign: "right",
                          color: approvalColor(m.avg),
                          flexShrink: 0,
                        }}
                      >
                        {m.avg}
                      </span>
                      <span
                        style={{
                          fontSize: 11.5,
                          ...mono,
                          color: "var(--color-text-subtle)",
                          width: 54,
                          textAlign: "right",
                          flexShrink: 0,
                        }}
                      >
                        {m.n} {m.n === 1 ? "unit" : "units"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="dc-card" style={{ ...card, padding: 20 }}>
                <div style={panelLabel}>LENDER REACH · UNITS FITTING</div>
                <div
                  role="list"
                  aria-label="Lender reach and units fitting"
                  style={{ display: "flex", flexDirection: "column", gap: 11 }}
                >
                  {lenderReach.length === 0 && (
                    <span
                      role="status"
                      aria-live="polite"
                      style={{ fontSize: 13, color: "var(--color-text-subtle)" }}
                    >
                      No active lenders.
                    </span>
                  )}
                  {lenderReach.map((l) => {
                    const units = unitsPerLender[l.id] ?? 0;
                    const barPct = stats.n ? (units / stats.n) * 100 : 0;
                    return (
                      <div
                        key={l.id}
                        role="listitem"
                        style={{ display: "flex", alignItems: "center", gap: 12 }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            width: 96,
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            flexShrink: 0,
                          }}
                        >
                          {l.name}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: 9,
                            borderRadius: 5,
                            background: "var(--color-bg-muted)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            className="ring-anim"
                            style={{
                              height: "100%",
                              width: `${barPct}%`,
                              background:
                                units > 0 ? "var(--color-success)" : "var(--color-warning)",
                              borderRadius: 5,
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 12,
                            ...mono,
                            color: "var(--color-text-muted)",
                            width: 52,
                            textAlign: "right",
                            flexShrink: 0,
                          }}
                        >
                          {units}/{stats.n}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Pipeline snapshot */}
            <div className="dc-card" style={{ ...card, padding: 20, marginTop: 14 }}>
              <div style={panelLabel}>Pipeline snapshot</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    Financed in pipeline
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      ...mono,
                      marginTop: 6,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {pStats.total ? fmt(pStats.financed) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    Approval rate
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      ...mono,
                      marginTop: 6,
                      letterSpacing: "-0.02em",
                      color: "var(--color-success)",
                    }}
                  >
                    {pStats.approvalRate === null ? "—" : `${pStats.approvalRate}%`}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Funded</div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      ...mono,
                      marginTop: 6,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {pStats.funded}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Declined</div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      ...mono,
                      marginTop: 6,
                      letterSpacing: "-0.02em",
                      color: "var(--color-danger)",
                    }}
                  >
                    {pStats.declined}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const ReportsScreen = React.memo(ReportsScreenBase);
ReportsScreen.displayName = "ReportsScreen";
export default ReportsScreen;
