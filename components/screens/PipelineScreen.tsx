import React, { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDealContext } from "../../context/DealContext";
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
import { APPROVAL_CONFIG } from "../../services/approvalScorer";
import { EmptyState } from "../common/states";
import * as Icons from "../common/Icons";
import { fmt } from "../../utils/format";
import type { SavedDeal } from "../../types";

const mono = "var(--mono)";

/** 7-col grid per the mockup's PIPELINE table (lines 559/569). */
const GRID = "1.6fr 2fr 0.8fr 1fr 0.9fr 1.2fr 1fr";

/**
 * Approval-score color, driven by the scorer's own band thresholds
 * (APPROVAL_CONFIG.bands) so the pipeline can never drift from the gauge.
 */
const approvalColor = (s: number): string =>
  s >= APPROVAL_CONFIG.bands.strong
    ? "var(--color-success)"
    : s >= APPROVAL_CONFIG.bands.moderate
      ? "var(--color-warning)"
      : "var(--color-danger)";

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

const numVal = (v: number | "Error" | "N/A" | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const headerCell: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.1em",
  fontFamily: mono,
  color: "var(--color-text-subtle)",
};

const metricLabel: React.CSSProperties = {
  fontSize: 11,
  fontFamily: mono,
  color: "var(--color-text-subtle)",
  marginBottom: 4,
};

const metricValue: React.CSSProperties = {
  fontSize: 15,
  fontFamily: mono,
  fontWeight: 600,
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
      borderRadius: 14,
      padding: 18,
      boxShadow: "var(--shadow)",
    }}
  >
    <div
      style={{
        fontSize: 12,
        fontWeight: 600,
        fontFamily: mono,
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
    setDealData,
    setFilters,
    setCustomerName,
    setSalespersonName,
    setScratchPadNotes,
    setActiveVehicle,
    setFocusVin,
    setMessage,
    processedInventory,
    clearDealAndFilters,
  } = useDealContext();

  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { warn, danger } = settings.ltvThresholds;

  // OTD LTV colors come from settings.ltvThresholds — never hardcoded 115/125.
  const otdColor = (n: number | null): string => {
    if (n === null) return "var(--color-text-subtle)";
    return n >= danger
      ? "var(--color-danger)"
      : n >= warn
        ? "var(--color-warning)"
        : "var(--color-success)";
  };

  const deals = useMemo<PipelineSavedDeal[]>(() => savedDeals.map(asPipelineDeal), [savedDeals]);

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
    const approvalScore = persisted.approvalScore ?? deal.vehicle.approvalScore ?? null;
    return { payment, otdLtv, financed, approvalScore };
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
    if (from === next) return;

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
            text: `Status updated to ${titleCase(next)} · ${deal.customerName}`,
          });
        } else {
          applyStatus(from);
          setMessage({ type: "error", text: "Couldn't update the deal status. Try again." });
        }
      })
      .catch(() => {
        applyStatus(from);
        setMessage({ type: "error", text: "Couldn't update the deal status. Try again." });
      });
  };

  const handleOpenInDesk = useCallback(
    (deal: PipelineSavedDeal) => {
      // Restore the saved structure — legacy SavedDeals.onLoad semantics.
      setCustomerName(deal.customerName);
      setSalespersonName(deal.salespersonName || "");
      setDealData(deal.dealData);
      setFilters((prev) => ({
        ...prev,
        creditScore: deal.customerFilters?.creditScore ?? null,
        monthlyIncome: deal.customerFilters?.monthlyIncome ?? null,
      }));
      setScratchPadNotes(deal.notes || "");

      // Focus the saved vehicle only if it still exists in live inventory.
      const vin = deal.vehicle?.vin;
      const live = vin ? processedInventory.find((v) => v.vin === vin) : undefined;
      if (live) {
        setFocusVin(live.vin);
        setActiveVehicle(live);
        setMessage({ type: "success", text: "Deal loaded successfully." });
      } else {
        setFocusVin(null);
        setActiveVehicle(null);
        setMessage({
          type: "warning",
          text: "Vehicle no longer in inventory; deal terms restored",
        });
      }
      navigate("/desk");
    },
    [
      setCustomerName,
      setSalespersonName,
      setDealData,
      setFilters,
      setScratchPadNotes,
      setActiveVehicle,
      setFocusVin,
      processedInventory,
      setMessage,
      navigate,
    ]
  );

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
          <span
            style={{
              fontSize: 11,
              fontFamily: mono,
              letterSpacing: "0.18em",
              color: "var(--color-text-subtle)",
            }}
          >
            DEAL PIPELINE
          </span>
          <div style={{ height: 20, width: 1, background: "var(--color-border)" }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>{counts.total} working deals</span>
        </div>
        <button
          onClick={handleNewDeal}
          className="transition-colors btn-primary"
          aria-label="Start new deal"
          title="Start a new deal on the desk"
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
            <path d="M12 5v14M5 12h14" />
          </svg>
          New deal
        </button>
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
          <KpiCard label="Working deals" value={counts.total} />
          <KpiCard
            label="Approved / funded"
            value={counts.approvedFunded}
            color="var(--color-success)"
          />
          <KpiCard label="Pending lender" value={counts.pending} color="var(--color-warning)" />
        </div>

        {/* Deal table */}
        <div
          role="table"
          aria-label="Deal pipeline"
          aria-rowcount={deals.length + 1}
          style={{
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            boxShadow: "var(--shadow)",
            overflow: "hidden",
          }}
        >
          <div role="rowgroup">
            <div
              className="pipeline-screen-columns"
              role="row"
              aria-rowindex={1}
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
                Approval
              </span>
              <span role="columnheader" style={headerCell}>
                Lender
              </span>
              <span role="columnheader" style={{ ...headerCell, textAlign: "right" }}>
                Status
              </span>
            </div>
          </div>

          {deals.length === 0 && (
            <EmptyState
              icon={<Icons.FolderIcon className="w-full h-full" />}
              title="No deals in the pipeline yet"
              description="Structure a vehicle on the desk and hit Save deal — it lands here with its payment, approval odds and lender status."
              primaryAction={{ label: "New deal", onClick: handleNewDeal }}
            />
          )}

          <div role="rowgroup">
            {deals.map((deal, dealIndex) => {
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
                  {/* Row — click / Enter / Space toggles the drawer (single-open) */}
                  <div
                    className="inv-row pipeline-screen-row"
                    onClick={toggleExpanded}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleExpanded();
                      }
                    }}
                    role="row"
                    aria-rowindex={dealIndex + 2}
                    tabIndex={0}
                    aria-expanded={expanded}
                    aria-label={`Deal for ${deal.customerName}`}
                    aria-controls={`pipeline-panel-${deal.id}`}
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
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--color-text-subtle)",
                          width: 8,
                          flexShrink: 0,
                        }}
                        aria-hidden="true"
                      >
                        {expanded ? "▾" : "▸"}
                      </span>
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
                          fontFamily: mono,
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
                          fontSize: 13.5,
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
                        STK {deal.vehicle.stock}
                      </div>
                    </div>
                    <span
                      role="cell"
                      data-label="Term"
                      style={{
                        fontSize: 13.5,
                        textAlign: "right",
                        fontFamily: mono,
                        color: "var(--color-text-muted)",
                      }}
                    >
                      {deal.dealData.loanTerm} mo
                    </span>
                    <span
                      role="cell"
                      data-label="Payment"
                      style={{
                        fontSize: 14,
                        textAlign: "right",
                        fontFamily: mono,
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {metrics.payment === null ? "—" : `${fmt(metrics.payment)}/mo`}
                    </span>
                    <span
                      role="cell"
                      data-label="Approval"
                      style={{
                        fontSize: 14,
                        textAlign: "right",
                        fontFamily: mono,
                        fontWeight: 700,
                        color:
                          metrics.approvalScore === null
                            ? "var(--color-text-subtle)"
                            : approvalColor(metrics.approvalScore),
                      }}
                    >
                      {metrics.approvalScore === null ? "—" : Math.round(metrics.approvalScore)}
                    </span>
                    <span
                      role="cell"
                      data-label="Lender"
                      style={{
                        fontSize: 13.5,
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
                          fontFamily: mono,
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
                      style={{
                        padding: "4px 20px 18px 37px",
                        background: "var(--color-bg-subtle)",
                      }}
                    >
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
                          <div style={metricLabel}>APR</div>
                          <div style={metricValue}>{deal.dealData.interestRate}%</div>
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
                          Status
                        </label>
                        <select
                          id={`deal-status-${deal.id}`}
                          className="dc-input"
                          value={deal.status}
                          onChange={(e) =>
                            handleStatusChange(deal, e.target.value as CanonicalDealStatus)
                          }
                          style={{
                            background: "var(--color-bg)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 8,
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
                        <button
                          onClick={() => handleOpenInDesk(deal)}
                          className="transition-colors btn-primary"
                          style={{
                            marginLeft: "auto",
                            border: "1px solid transparent",
                            borderRadius: 8,
                            padding: "8px 14px",
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          Open in desk →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const PipelineScreen: React.FC = React.memo(PipelineScreenBase);
PipelineScreen.displayName = "PipelineScreen";
export default PipelineScreen;
