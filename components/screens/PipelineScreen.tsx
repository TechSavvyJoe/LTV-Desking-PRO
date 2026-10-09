import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDealContext } from "../../context/DealContext";
import { useOpenDealInDesk } from "../../hooks/useOpenDealInDesk";
import { updateDeal, logDealEvent } from "../../lib/api";
import {
  CANONICAL_DEAL_STATUSES,
  STATUS_BUCKET_META,
  statusBucket,
  asPipelineDeal,
  pipelineMetricsFromCalculatedData,
} from "../../lib/dealMappers";
import type { CanonicalDealStatus, PipelineSavedDeal } from "../../lib/dealMappers";
import { calculateFinancials } from "../../services/calculator";
import Button from "../common/Button";
import { EmptyState } from "../common/states";
import * as Icons from "../common/Icons";
import { fmt } from "../../utils/format";
import { aprLabel } from "../desk/deskConstants";
import type { SavedDeal } from "../../types";

const mono = "var(--mono)";

/** 7-col grid per the mockup's PIPELINE table (lines 559/569). */
const GRID = "1.6fr 2fr var(--pipeline-term-track, 0.8fr) 1fr 0.9fr 1.2fr 1fr";

/** Completed checklists use the success color; incomplete progress stays neutral. */
const readinessColor = (s: number): string =>
  s === 100 ? "var(--color-success)" : "var(--color-text-muted)";

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

/** "STK" prefix only when the stock value does not already carry one. */
const stockLabel = (stock: string): string =>
  /^stk/i.test(String(stock).trim()) ? String(stock) : `STK ${stock}`;

const numVal = (v: number | "Error" | "N/A" | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const tnum: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

const headerCell: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: 0,
  color: "var(--color-text-muted)",
};

const metricLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--color-text-muted)",
  marginBottom: 4,
};

const metricValue: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  ...tnum,
};

const KpiCard: React.FC<{ label: string; value: number; color?: string }> = ({
  label,
  value,
  color,
}) => (
  <div
    style={{
      background: "var(--color-bg)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      padding: 18,
    }}
  >
    <div
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: "var(--color-text-muted)",
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 32,
        fontWeight: 700,
        marginTop: 8,
        letterSpacing: 0,
        fontVariantNumeric: "tabular-nums",
        ...(color ? { color } : null),
      }}
    >
      {value}
    </div>
  </div>
);

/**
 * Pipeline screen — the PIPELINE block of LTV Desking PRO.dc.html
 * (lines 542-604): 3 KPI cards over an expandable 7-col deal table. Rows are
 * projections of the PocketBase SavedDeal (realtime-subscribed via
 * DealContext); the drawer's metrics come from the persisted calculatedData
 * snapshot, recomputed with services/calculator when absent. Status writes
 * through updateDeal + a deal_status_changed event; "Open in desk" restores
 * the saved structure (legacy SavedDeals.onLoad semantics). [Phase 6]
 */
const PipelineScreenBase: React.FC = () => {
  const {
    settings,
    savedDeals,
    setSavedDeals,
    setActiveVehicle,
    setFocusVin,
    setMessage,
    clearDealAndFilters,
  } = useDealContext();

  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CanonicalDealStatus | "all">("all");
  const pendingWrites = useRef(new Set<string>());
  const [updatingIds, setUpdatingIds] = useState(new Set<string>());
  const { warn, danger } = settings.ltvThresholds;

  // OTD LTV colors come from settings.ltvThresholds — never hardcoded 115/125.
  const otdColor = (n: number | null): string => {
    if (n === null) return "var(--color-text-muted)";
    return n >= danger
      ? "var(--color-danger)"
      : n >= warn
        ? "var(--color-warning)"
        : "var(--color-success)";
  };

  const deals = useMemo<PipelineSavedDeal[]>(() => savedDeals.map(asPipelineDeal), [savedDeals]);
  const visibleDeals = useMemo(() => {
    const query = search.trim().toLowerCase();
    return deals.filter(
      (deal) =>
        (statusFilter === "all" || deal.status === statusFilter) &&
        (!query ||
          [
            deal.customerName,
            deal.salespersonName,
            deal.vehicle.vehicle,
            deal.vehicle.stock,
            deal.vehicle.vin,
            deal.lenderName,
          ].some((value) => typeof value === "string" && value.toLowerCase().includes(query)))
    );
  }, [deals, search, statusFilter]);

  const counts = useMemo(() => {
    let pending = 0;
    let approvedFunded = 0;
    for (const d of deals) {
      const bucket = statusBucket(d.status);
      if (bucket === "pending") pending += 1;
      else if (bucket === "approved" || bucket === "funded") approvedFunded += 1;
    }
    return { total: deals.length, pending, approvedFunded };
  }, [deals]);

  /**
   * Drawer metrics — persisted snapshot first (reconciliation 7), then a
   * recompute of the saved vehicle snapshot against the saved deal terms with
   * the real calculator, then the vehicle snapshot's own stored figures.
   */
  const metricsFor = (deal: PipelineSavedDeal) => {
    const persisted = pipelineMetricsFromCalculatedData(deal.calculatedData);
    let { payment, otdLtv, financed } = persisted;
    if (payment === null || otdLtv === null || financed === null) {
      const calc = calculateFinancials(deal.vehicle, deal.dealData, settings);
      payment = payment ?? numVal(calc.monthlyPayment) ?? numVal(deal.vehicle.monthlyPayment);
      otdLtv = otdLtv ?? numVal(calc.otdLtv) ?? numVal(deal.vehicle.otdLtv);
      financed = financed ?? numVal(calc.amountToFinance) ?? numVal(deal.vehicle.amountToFinance);
    }
    // Only versioned checklists have a saved readiness percentage.
    const readinessUnknown = !deal.vehicle.assessment;
    const readinessScore = deal.vehicle.assessment?.readiness ?? null;
    return { payment, otdLtv, financed, readinessScore, readinessUnknown };
  };

  // --- Actions ---------------------------------------------------------------

  const handleNewDeal = () => {
    // Reset deal + filters to the dealer's settings defaults and clear the
    // focused unit — the mockup's onNewDeal, wired to the real context.
    clearDealAndFilters();
    setActiveVehicle(null);
    setFocusVin(null);
    setMessage({ type: "success", text: "New deal started" });
    navigate("/desk");
  };

  const handleStatusChange = (deal: PipelineSavedDeal, next: CanonicalDealStatus) => {
    const from = deal.status;
    if (from === next || pendingWrites.current.has(deal.id)) return;
    pendingWrites.current.add(deal.id);
    setUpdatingIds(new Set(pendingWrites.current));

    // Optimistic update; the realtime subscription confirms, and a failed
    // write reverts so the pill never lies about what the server holds.
    const applyStatus = (status: CanonicalDealStatus) =>
      setSavedDeals((prev) =>
        prev.map((d) => (d.id === deal.id ? ({ ...d, status } as SavedDeal) : d))
      );
    applyStatus(next);

    updateDeal(deal.id, { status: next })
      .then((saved) => {
        if (saved) {
          logDealEvent("deal_status_changed", {
            customerName: deal.customerName,
            vin: deal.vehicle.vin,
            snapshot: { from, to: next },
          });
          setMessage({
            type: "success",
            text: `${deal.customerName} moved to ${titleCase(next)}`,
          });
        } else {
          applyStatus(from);
          setMessage({ type: "error", text: "Couldn't update the deal status. Try again." });
        }
      })
      .catch(() => {
        applyStatus(from);
        setMessage({ type: "error", text: "Couldn't update the deal status. Try again." });
      })
      .finally(() => {
        pendingWrites.current.delete(deal.id);
        setUpdatingIds(new Set(pendingWrites.current));
      });
  };

  // Restore the saved structure — shared with the ⌘K palette (hooks/useOpenDealInDesk).
  const handleOpenInDesk = useOpenDealInDesk();

  return (
    <div data-screen-label="Pipeline">
      {/* Sub-header — mockup lines 544-551 */}
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
          <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Pipeline</h1>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            {counts.total} saved {counts.total === 1 ? "deal" : "deals"}
          </span>
        </div>
        <Button
          type="button"
          onClick={handleNewDeal}
          variant="primary"
          aria-label="Start new deal"
          title="Start a new deal on the desk"
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
            <path d="M12 5v14M5 12h14" />
          </svg>
          New deal
        </Button>
      </header>

      <div style={{ padding: "20px 24px" }}>
        {/* KPI cards — mockup lines 553-557 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 14,
            marginBottom: 16,
          }}
        >
          <KpiCard label="Saved deals" value={counts.total} />
          <KpiCard
            label="Approved / funded"
            value={counts.approvedFunded}
            color="var(--color-success)"
          />
          <KpiCard label="In progress" value={counts.pending} color="var(--color-warning)" />
        </div>

        {deals.length > 0 && (
          <div className="pipeline-filters">
            <label className="pipeline-search">
              <span>Find a deal</span>
              <input
                type="search"
                className="dc-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Customer, stock, VIN, salesperson or lender"
              />
            </label>
            <label>
              <span>Deal status</span>
              <select
                className="dc-input"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as CanonicalDealStatus | "all")
                }
              >
                <option value="all">All statuses</option>
                {CANONICAL_DEAL_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {titleCase(status)}
                  </option>
                ))}
              </select>
            </label>
            <span role="status" className="pipeline-result-count">
              {visibleDeals.length} of {deals.length} deals
            </span>
          </div>
        )}

        {deals.length === 0 ? (
          <EmptyState
            icon={<Icons.FolderIcon className="w-full h-full" />}
            title="No saved deals yet"
            description="Structure a vehicle on the desk and click Save deal to add it here."
            primaryAction={{ label: "New deal", onClick: handleNewDeal }}
          />
        ) : visibleDeals.length === 0 ? (
          <EmptyState
            title="No matching deals"
            description="Try a different search or status."
            primaryAction={{
              label: "Clear filters",
              onClick: () => {
                setSearch("");
                setStatusFilter("all");
              },
            }}
          />
        ) : (
          <div
            role="table"
            aria-label="Deal pipeline"
            style={{
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-card)",
              overflow: "hidden",
            }}
          >
            <div role="rowgroup">
              <div
                className="pipeline-screen-columns"
                role="row"
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
                <span role="columnheader" style={headerCell}>
                  Customer
                </span>
                <span role="columnheader" style={headerCell}>
                  Vehicle
                </span>
                <span role="columnheader" style={{ ...headerCell, textAlign: "right" }}>
                  Term
                </span>
                <span role="columnheader" style={{ ...headerCell, textAlign: "right" }}>
                  Payment
                </span>
                <span role="columnheader" style={{ ...headerCell, textAlign: "right" }}>
                  Readiness
                </span>
                <span role="columnheader" style={headerCell}>
                  Lender
                </span>
                <span role="columnheader" style={{ ...headerCell, textAlign: "right" }}>
                  Status
                </span>
              </div>
            </div>

            <div role="rowgroup">
              {visibleDeals.map((deal) => {
                const bucket = statusBucket(deal.status);
                const meta = STATUS_BUCKET_META[bucket];
                const expanded = expandedId === deal.id;
                const metrics = metricsFor(deal);
                const savedDate = new Date(deal.date || deal.createdAt || Date.now());
                const savedFmt = Number.isNaN(savedDate.getTime())
                  ? "—"
                  : savedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                const toggleExpanded = () =>
                  setExpandedId((cur) => (cur === deal.id ? null : deal.id));

                return (
                  <div key={deal.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {/* Row — mouse click toggles the drawer; the chevron button is the keyboard control (single-open) */}
                    <div
                      className="inv-row pipeline-screen-row"
                      onClick={toggleExpanded}
                      role="row"
                      aria-label={`Deal for ${deal.customerName}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: GRID,
                        columnGap: 14,
                        alignItems: "center",
                        padding: "12px 20px",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        role="cell"
                        style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}
                      >
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={`pipeline-panel-${deal.id}`}
                          aria-label={`${expanded ? "Hide" : "Show"} details for ${deal.vehicle.vehicle}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded();
                          }}
                          style={{
                            fontSize: 10,
                            color: "var(--color-text-subtle)",
                            width: 8,
                            flexShrink: 0,
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                        </button>
                        <div
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 9,
                            background: "var(--color-bg-muted)",
                            color: "var(--color-text-muted)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                          aria-hidden="true"
                        >
                          {initialsOf(deal.customerName)}
                        </div>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {deal.customerName}
                        </span>
                      </div>
                      <div role="cell" style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {deal.vehicle.vehicle}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--color-text-subtle)",
                            fontFamily: mono,
                          }}
                        >
                          {stockLabel(deal.vehicle.stock)}
                        </div>
                      </div>
                      <span
                        role="cell"
                        data-label="Term"
                        style={{
                          fontSize: 13,
                          textAlign: "right",
                          ...tnum,
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {deal.dealData.loanTerm > 0 ? `${deal.dealData.loanTerm} mo` : "—"}
                      </span>
                      <span
                        role="cell"
                        data-label="Payment"
                        style={{
                          fontSize: 14,
                          textAlign: "right",
                          fontWeight: 600,
                          ...tnum,
                        }}
                      >
                        {metrics.payment === null ? "—" : `${fmt(metrics.payment)}/mo`}
                      </span>
                      <span
                        role="cell"
                        data-label="Readiness"
                        title={metrics.readinessUnknown ? "No saved checklist" : undefined}
                        aria-label={
                          metrics.readinessUnknown
                            ? "Legacy deal: readiness was not recorded"
                            : undefined
                        }
                        style={{
                          fontSize: 14,
                          textAlign: "right",
                          fontWeight: 700,
                          ...tnum,
                          color:
                            metrics.readinessScore === null
                              ? "var(--color-text-subtle)"
                              : readinessColor(metrics.readinessScore),
                        }}
                      >
                        {metrics.readinessScore === null ? "—" : Math.round(metrics.readinessScore)}
                      </span>
                      <span
                        role="cell"
                        data-label="Lender"
                        style={{
                          fontSize: 13,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {deal.lenderName ?? "—"}
                      </span>
                      <span role="cell" data-label="Status" style={{ textAlign: "right" }}>
                        <span
                          title={deal.status}
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            padding: "3px 9px",
                            borderRadius: 6,
                            color: meta.colorVar,
                            background: meta.bgVar,
                          }}
                        >
                          {meta.label}
                        </span>
                      </span>
                    </div>

                    {/* Drawer — mockup lines 582-598 */}
                    {expanded && (
                      <div
                        id={`pipeline-panel-${deal.id}`}
                        role="row"
                        style={{
                          padding: "4px 20px 18px 37px",
                          background: "var(--color-bg-subtle)",
                        }}
                      >
                        <div role="cell" aria-colspan={7}>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(5,1fr)",
                              gap: 12,
                              margin: "10px 0 16px",
                              maxWidth: 620,
                            }}
                          >
                            <div>
                              <div style={metricLabel}>Down</div>
                              <div style={metricValue}>{fmt(deal.dealData.downPayment || 0)}</div>
                            </div>
                            <div>
                              <div style={metricLabel}>Interest rate</div>
                              <div style={metricValue}>{aprLabel(deal.dealData.interestRate)}</div>
                            </div>
                            <div>
                              <div style={metricLabel}>Financed</div>
                              <div style={metricValue}>
                                {metrics.financed === null ? "—" : fmt(metrics.financed)}
                              </div>
                            </div>
                            <div>
                              <div style={metricLabel}>OTD LTV</div>
                              <div style={{ ...metricValue, color: otdColor(metrics.otdLtv) }}>
                                {metrics.otdLtv === null ? "—" : `${Math.round(metrics.otdLtv)}%`}
                              </div>
                            </div>
                            <div>
                              <div style={metricLabel}>Saved</div>
                              <div style={metricValue}>{savedFmt}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <label
                              htmlFor={`deal-status-${deal.id}`}
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                color: "var(--color-text-muted)",
                              }}
                            >
                              Dealer-entered status
                            </label>
                            <select
                              id={`deal-status-${deal.id}`}
                              className="dc-input"
                              value={deal.status}
                              disabled={updatingIds.has(deal.id)}
                              aria-busy={updatingIds.has(deal.id)}
                              onChange={(e) =>
                                handleStatusChange(deal, e.target.value as CanonicalDealStatus)
                              }
                              style={{
                                background: "var(--color-bg)",
                                border: "1px solid var(--color-border)",
                                borderRadius: "var(--radius-md)",
                                padding: "7px 10px",
                                fontSize: 14,
                                color: "var(--color-text)",
                                fontFamily: "inherit",
                                outline: "none",
                                cursor: "pointer",
                              }}
                            >
                              {CANONICAL_DEAL_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {titleCase(status)}
                                </option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              onClick={() => handleOpenInDesk(deal)}
                              variant="primary"
                              className="ml-auto"
                            >
                              Open in desk →
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PipelineScreen: React.FC = React.memo(PipelineScreenBase);
PipelineScreen.displayName = "PipelineScreen";
export default PipelineScreen;
