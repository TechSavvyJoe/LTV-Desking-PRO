import React, { useMemo, useCallback } from "react";
import { useDealContext } from "../../context/DealContext";
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

const READINESS_CONFIG = { bands: { strong: 100, moderate: 50 } };

const tnum: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

const card: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-card)",
};

/** KPI / inner tiles: 8px radius, no shadow. */
const kpiTile: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
};

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--color-text-muted)",
};

const panelLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--color-text-muted)",
  margin: "0 0 16px",
};

const numVal = (v: number | "Error" | "N/A" | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Checklist progress: complete, partial or early stage. */
const readinessColor = (s: number): string =>
  s >= READINESS_CONFIG.bands.strong
    ? "var(--color-success)"
    : s >= READINESS_CONFIG.bands.moderate
      ? "var(--color-warning)"
      : "var(--color-text-muted)";

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
      className="bar-row-label"
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
      className="bar-row-value"
      style={{
        fontSize: 13,
        ...tnum,
        fontWeight: 600,
        width: rightWidth,
        textAlign: "right",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {right}
    </span>
  </div>
);

const BarRow = React.memo(BarRowComponent);

/**
 * Count and share. Sighted users get the two-number layout; screen readers get
 * one clean phrase ("12 units, 34%") instead of two bare numbers.
 */
const CountShare: React.FC<{ count: number; share: string }> = ({ count, share }) => (
  <>
    <span aria-hidden="true">{count}</span>{" "}
    <span aria-hidden="true" style={{ marginLeft: 6 }}>
      {share}
    </span>
    <span className="sr-only">
      {count} {count === 1 ? "unit" : "units"}, {share}
    </span>
  </>
);

/**
 * An unknown value: shows "—" to sighted users, and says why to screen readers
 * (a bare dash is read as "dash").
 */
const Unknown: React.FC<{ reason?: string }> = ({ reason = "pending" }) => (
  <>
    <span aria-hidden="true">—</span>
    <span className="sr-only">{reason}</span>
  </>
);

/**
 * Reports — pure client aggregation over the context's single scoring pass
 * (processedInventory: the same set the desk ranks), savedDeals,
 * unitsPerLender and the active lender roster. Mirrors the REPORTS block of
 * LTV Desking PRO.dc.html (lines 678-758). No new fetches; everything is
 * derived from real scorer/calculator outputs. [P7]
 */
const ReportsScreenBase: React.FC = () => {
  const {
    settings,
    processedInventory,
    safeLenderProfiles,
    savedDeals,
    unitsPerLender,
    loadSampleData,
  } = useDealContext();

  const totalLenders = activeLenderCount(safeLenderProfiles);

  const stats = useMemo(() => {
    const rows = processedInventory;
    const n = rows.length;
    // Missing inputs still have a known checklist count; legacy ratings do not.
    const ranked = rows.filter((v) => v.assessment !== undefined);
    const rankedN = ranked.length;
    const pendingRows = rows.filter((v) => v.assessment?.label === "Inputs needed");

    const scores = ranked.map((v) => v.readinessScore ?? 0);
    const otds = rows.map((v) => numVal(v.otdLtv)).filter((x): x is number => x !== null);
    const pays = rows.map((v) => numVal(v.monthlyPayment)).filter((x): x is number => x !== null);
    const prices = rows.map((v) => numVal(v.price)).filter((x): x is number => x !== null);

    const avgScore = rankedN ? Math.round(scores.reduce((a, b) => a + b, 0) / rankedN) : null;
    const avgOtd = otds.length ? Math.round(otds.reduce((a, b) => a + b, 0) / otds.length) : null;
    const avgPay = pays.length ? pays.reduce((a, b) => a + b, 0) / pays.length : null;
    const totalValue = prices.reduce((a, b) => a + b, 0);

    const strong = ranked.filter(
      (v) => (v.readinessScore ?? 0) >= READINESS_CONFIG.bands.strong
    ).length;
    const moderate = ranked.filter((v) => {
      const s = v.readinessScore ?? 0;
      return s >= READINESS_CONFIG.bands.moderate && s < READINESS_CONFIG.bands.strong;
    }).length;
    const weak = rankedN - strong - moderate;

    const best = ranked.reduce<CalculatedVehicle | null>(
      (a, v) => (a === null || (v.readinessScore ?? 0) > (a.readinessScore ?? 0) ? v : a),
      null
    );

    // Reach is measured over ranked units only: a pending unit's 0 fits means
    // "not checked yet", not "no lender fits".
    const avgLenders = rankedN
      ? ranked.reduce((a, v) => a + (v.assessment?.fitCount ?? 0), 0) / rankedN
      : null;

    // Readiness by make (ranked units only) — unparseable makes land in "Other".
    const makeMap = new Map<string, { n: number; sum: number }>();
    for (const v of ranked) {
      let mk = (v.make || "").trim();
      if (!mk) {
        // vehicle strings are "YYYY Make Model Trim" — parse the second token.
        const parts = (v.vehicle || "").trim().split(/\s+/);
        mk = /^\d{4}$/.test(parts[0] || "") ? parts[1] || "" : parts[0] || "";
      }
      if (!mk) mk = "Other";
      const cur = makeMap.get(mk) ?? { n: 0, sum: 0 };
      cur.n += 1;
      cur.sum += v.readinessScore ?? 0;
      makeMap.set(mk, cur);
    }
    const makeRows = [...makeMap.entries()]
      .map(([mk, m]) => ({ mk, n: m.n, avg: Math.round(m.sum / m.n) }))
      .sort((a, b) => b.avg - a.avg);

    return {
      n,
      rankedN,
      pendingN: pendingRows.length,
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

  // Distribution shares are of the RANKED units (pending ones are excluded).
  const pct = (count: number): string =>
    stats.rankedN ? `${Math.round((count / stats.rankedN) * 100)}%` : "0%";
  const share = (count: number): number => (stats.rankedN ? (count / stats.rankedN) * 100 : 0);

  const bestName = stats.best
    ? stats.best.make && stats.best.model
      ? `${stats.best.make} ${stats.best.model}${stats.best.trim ? " " + stats.best.trim : ""}`
      : stats.best.vehicle
    : null;
  const bestScore = stats.best?.readinessScore ?? null;

  const lenderReach = safeLenderProfiles.filter((l) => l.active !== false);

  return (
    <div className="reports-screen" data-screen-label="Reports">
      <header
        className="reports-screen-header"
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
        <div
          className="reports-screen-summary"
          style={{ display: "flex", alignItems: "center", gap: 14 }}
        >
          <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Reports</h1>
          <span
            className="reports-screen-description"
            style={{ fontSize: 13, color: "var(--color-text-muted)" }}
          >
            Deal checklist results against the current structure
          </span>
        </div>
      </header>

      <div className="reports-screen-content" style={{ padding: "22px 24px", maxWidth: 1100 }}>
        {stats.n === 0 ? (
          <EmptyState
            icon={<Icons.ChartIcon className="w-full h-full" />}
            title="No inventory to report on"
            description="Reports appear once inventory is imported. Load sample data to preview them."
            primaryAction={{ label: "Load sample data", onClick: loadSampleData }}
          />
        ) : (
          <>
            {/* KPI row */}
            <div
              className="reports-kpi-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 14,
                marginBottom: 14,
              }}
            >
              <div className="dc-card" style={{ ...kpiTile, padding: 18 }}>
                <div style={kpiLabel}>Avg readiness</div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    marginTop: 8,
                    letterSpacing: 0,
                    ...tnum,
                    color:
                      stats.avgScore === null
                        ? "var(--color-text-muted)"
                        : readinessColor(stats.avgScore),
                  }}
                >
                  {stats.avgScore ?? <Unknown />}
                </div>
              </div>
              <div className="dc-card" style={{ ...kpiTile, padding: 18 }}>
                <div style={kpiLabel}>Avg OTD LTV</div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    marginTop: 8,
                    letterSpacing: 0,
                    ...tnum,
                    color:
                      stats.avgOtd === null ? "var(--color-text-muted)" : otdColor(stats.avgOtd),
                  }}
                >
                  {stats.avgOtd === null ? <Unknown /> : `${stats.avgOtd}%`}
                </div>
              </div>
              <div className="dc-card" style={{ ...kpiTile, padding: 18 }}>
                <div style={kpiLabel}>Avg payment</div>
                <div
                  style={{ fontSize: 32, fontWeight: 700, marginTop: 8, letterSpacing: 0, ...tnum }}
                >
                  {stats.avgPay === null ? <Unknown /> : `${fmt(stats.avgPay)}/mo`}
                </div>
              </div>
              <div className="dc-card" style={{ ...kpiTile, padding: 18 }}>
                <div style={kpiLabel}>Inventory value</div>
                <div
                  style={{ fontSize: 32, fontWeight: 700, marginTop: 8, letterSpacing: 0, ...tnum }}
                >
                  {fmt(stats.totalValue)}
                </div>
              </div>
            </div>

            {/* Readiness distribution */}
            <div className="dc-card" style={{ ...card, padding: 20 }}>
              <h2 style={panelLabel}>
                Readiness distribution — {stats.n} {stats.n === 1 ? "unit" : "units"}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <BarRow
                  label={
                    <>
                      All checks passed{" "}
                      <span style={{ color: "var(--color-text-subtle)" }}>
                        ({READINESS_CONFIG.bands.strong}+)
                      </span>
                    </>
                  }
                  labelWidth={130}
                  pct={share(stats.strong)}
                  color="var(--color-success)"
                  height={10}
                  right={<CountShare count={stats.strong} share={pct(stats.strong)} />}
                  rightWidth={92}
                />
                <BarRow
                  label={
                    <>
                      Partial{" "}
                      <span style={{ color: "var(--color-text-subtle)" }}>
                        ({READINESS_CONFIG.bands.moderate}–{READINESS_CONFIG.bands.strong - 1})
                      </span>
                    </>
                  }
                  labelWidth={130}
                  pct={share(stats.moderate)}
                  color="var(--color-warning)"
                  height={10}
                  right={<CountShare count={stats.moderate} share={pct(stats.moderate)} />}
                  rightWidth={92}
                />
                <BarRow
                  label={
                    <>
                      Early stage{" "}
                      <span style={{ color: "var(--color-text-subtle)" }}>
                        (&lt;{READINESS_CONFIG.bands.moderate})
                      </span>
                    </>
                  }
                  labelWidth={130}
                  pct={share(stats.weak)}
                  color="var(--color-text-muted)"
                  height={10}
                  right={<CountShare count={stats.weak} share={pct(stats.weak)} />}
                  rightWidth={92}
                />
              </div>
              {stats.pendingN > 0 && (
                <div
                  data-testid="reports-pending-note"
                  style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 14 }}
                >
                  {stats.pendingN} of {stats.n} {stats.n === 1 ? "unit is" : "units are"} pending —{" "}
                  complete missing checks on the desk
                </div>
              )}
            </div>

            {/* 3-card row */}
            <div
              className="reports-three-column-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 14,
                marginTop: 14,
              }}
            >
              <div className="dc-card" style={{ ...kpiTile, padding: 18 }}>
                <div style={kpiLabel}>Most checks passed</div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    marginTop: 8,
                    letterSpacing: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    ...(stats.best ? {} : { color: "var(--color-text-muted)" }),
                  }}
                >
                  {bestName ?? <Unknown />}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    ...tnum,
                    marginTop: 4,
                    color:
                      bestScore === null ? "var(--color-text-muted)" : readinessColor(bestScore),
                  }}
                >
                  {bestScore === null ? (
                    // The unit name above already says "pending" to screen readers.
                    <span aria-hidden="true">—</span>
                  ) : (
                    `${bestScore}% checks passed`
                  )}
                </div>
              </div>
              <div className="dc-card" style={{ ...kpiTile, padding: 18 }}>
                <div style={kpiLabel}>Payment range</div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    ...tnum,
                    marginTop: 10,
                    letterSpacing: 0,
                    color:
                      stats.payMin === null || stats.payMax === null
                        ? "var(--color-text-muted)"
                        : undefined,
                  }}
                >
                  {stats.payMin === null || stats.payMax === null ? (
                    <Unknown />
                  ) : (
                    `${fmt(stats.payMin)} – ${fmt(stats.payMax)}`
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 5 }}>
                  per month, current deal
                </div>
              </div>
              <div className="dc-card" style={{ ...kpiTile, padding: 18 }}>
                <div style={kpiLabel}>Avg lenders / unit</div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    ...tnum,
                    marginTop: 8,
                    letterSpacing: 0,
                    color: "var(--color-primary)",
                  }}
                >
                  {stats.avgLenders === null ? (
                    <Unknown />
                  ) : (
                    `${stats.avgLenders.toFixed(1)} / ${totalLenders}`
                  )}
                </div>
              </div>
            </div>

            {/* By make + lender reach */}
            <div
              className="reports-two-column-grid"
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}
            >
              <div className="dc-card" style={{ ...card, padding: 20 }}>
                <h2 style={panelLabel}>Readiness by make</h2>
                {stats.makeRows.length === 0 && (
                  <span
                    role="status"
                    aria-live="polite"
                    style={{ fontSize: 13, color: "var(--color-text-muted)" }}
                  >
                    {stats.pendingN > 0
                      ? "No ranked units yet — lender checks are pending."
                      : "No inventory loaded."}
                  </span>
                )}
                <div
                  role="list"
                  aria-label="Deal readiness by make"
                  style={{
                    display: stats.makeRows.length === 0 ? "none" : "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
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
                            background: readinessColor(m.avg),
                            borderRadius: 5,
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 13,
                          ...tnum,
                          fontWeight: 700,
                          width: 26,
                          textAlign: "right",
                          color: readinessColor(m.avg),
                          flexShrink: 0,
                        }}
                      >
                        {m.avg}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          ...tnum,
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
                <h2 style={panelLabel}>Lender reach — units fitting</h2>
                {lenderReach.length === 0 && (
                  <span
                    role="status"
                    aria-live="polite"
                    style={{ fontSize: 13, color: "var(--color-text-muted)" }}
                  >
                    No active lenders.
                  </span>
                )}
                <div
                  role="list"
                  aria-label="Lender reach and units fitting"
                  style={{
                    display: lenderReach.length === 0 ? "none" : "flex",
                    flexDirection: "column",
                    gap: 11,
                  }}
                >
                  {lenderReach.map((l) => {
                    const units = unitsPerLender[l.id] ?? 0;
                    const barPct = stats.rankedN ? (units / stats.rankedN) * 100 : 0;
                    return (
                      <div
                        key={l.id}
                        role="listitem"
                        style={{ display: "flex", alignItems: "center", gap: 12 }}
                      >
                        <span
                          className="lender-reach-label"
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
                            ...tnum,
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
              <h2 style={panelLabel}>Pipeline snapshot</h2>
              <div
                className="reports-pipeline-grid"
                style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}
              >
                <div>
                  <div style={kpiLabel}>Financed in pipeline</div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      ...tnum,
                      marginTop: 6,
                      letterSpacing: 0,
                      ...(pStats.total ? {} : { color: "var(--color-text-muted)" }),
                    }}
                  >
                    {pStats.total ? fmt(pStats.financed) : <Unknown reason="no deals yet" />}
                  </div>
                </div>
                <div>
                  <div style={kpiLabel}>Approval rate</div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      ...tnum,
                      marginTop: 6,
                      letterSpacing: 0,
                      color:
                        pStats.approvalRate === null || pStats.approvalRate === 0
                          ? "var(--color-text-muted)"
                          : "var(--color-success)",
                    }}
                  >
                    {pStats.approvalRate === null ? (
                      <Unknown reason="no deals yet" />
                    ) : (
                      `${pStats.approvalRate}%`
                    )}
                  </div>
                </div>
                <div>
                  <div style={kpiLabel}>Funded</div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      ...tnum,
                      marginTop: 6,
                      letterSpacing: 0,
                    }}
                  >
                    {pStats.funded}
                  </div>
                </div>
                <div>
                  <div style={kpiLabel}>Declined</div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      ...tnum,
                      marginTop: 6,
                      letterSpacing: 0,
                      color:
                        pStats.declined > 0 ? "var(--color-danger)" : "var(--color-text-muted)",
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
