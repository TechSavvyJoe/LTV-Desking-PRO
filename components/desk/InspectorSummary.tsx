import React, { useId } from "react";
import { ApprovalGauge } from "../common/ApprovalGauge";
import { fmt } from "../../utils/format";
import type { splitPay } from "../../utils/format";
import type { Settings } from "../../types";
import { fitCountColor, metaItem, otdColorFor, pct, ptiColorFor, sansNum } from "./deskConstants";

interface InspectorSummaryProps {
  score: number;
  bandLabel: string;
  gaugeColor: string;
  pay: ReturnType<typeof splitPay> | null;
  loanTerm: number;
  apr: string;
  fitCount: number;
  totalLenders: number;
  /** Band "pending": odds unknown until the held lender checks resolve. */
  pending?: boolean;
  pendingCount?: number;
  /** One-line unblock hint (field names only), surfaced as the caption's title. */
  pendingReason?: string | null;
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
  pending = false,
  pendingCount = 0,
  pendingReason,
  financed,
  backendProducts,
  otdLtv,
  pti,
  thresholds,
}) => {
  const disclaimerId = useId();
  return (
    <section className="desk-inspector-summary pay-glow">
      <div className="desk-score-cell">
        <ApprovalGauge
          score={score}
          colorVar={gaugeColor}
          label={bandLabel}
          width={116}
          ariaDescribedBy={disclaimerId}
          indeterminate={pending}
        />
        {/* The gauge's accessible name already ends with the band label;
            hide the visible copy so it isn't read twice. */}
        <div className="desk-score-label" style={{ color: gaugeColor }} aria-hidden="true">
          {bandLabel}
        </div>
        {pending ? (
          <>
            <div className="desk-fit-caption">
              <strong style={{ ...sansNum, color: "var(--color-text-muted)" }}>
                {fitCount} fit
              </strong>
              {", "}
              <span style={sansNum}>{pendingCount} pending</span>
            </div>
            {/* What unblocks the checks, as text — not a hover-only tooltip, so
                touch, keyboard and screen-reader users get it too. */}
            {pendingReason && <p className="desk-pending-reason">{pendingReason}</p>}
          </>
        ) : (
          <div className="desk-fit-caption">
            <strong style={{ ...sansNum, color: fitCountColor(fitCount) }}>
              {fitCount}/{totalLenders}
            </strong>{" "}
            lenders fit
          </div>
        )}
      </div>
      <div className="desk-payment-cell">
        <div className="desk-payment-label">Est. monthly payment</div>
        <div className="desk-payment-value">
          {/* Split dollars/cents are visual only; the reading is one amount. */}
          <span style={sansNum} aria-hidden="true">
            {pay ? pay.whole : "—"}
          </span>
          <small style={sansNum} aria-hidden="true">
            {pay ? pay.frac : ""}
          </small>
          <span className="sr-only">
            {pay ? `${pay.whole}${pay.frac} per month` : "No payment estimate"}
          </span>
        </div>
        <div className="desk-payment-meta">
          <span style={{ ...metaItem, ...sansNum }}>{loanTerm} mo</span>{" "}
          <span style={{ ...metaItem, ...sansNum }}>{apr} APR</span> <span>estimate</span>
        </div>
      </div>
      <div
        id={disclaimerId}
        className="desk-fit-caption"
        style={{ gridColumn: "1 / -1", textAlign: "center", lineHeight: 1.3, marginTop: 1 }}
      >
        Estimate, not a credit decision or offer of credit. Final terms require a lender credit
        check.
      </div>
      <div className="desk-summary-metrics" role="group" aria-label="Deal structure metrics">
        <Metric
          label="Amount financed"
          value={financed === null ? "—" : fmt(financed)}
          tone="primary"
        />
        <Metric label="Back-end products" value={fmt(backendProducts)} color="var(--color-text)" />
        <Metric
          label="Out-the-door LTV"
          value={pct(otdLtv)}
          color={otdColorFor(otdLtv, thresholds)}
        />
        <Metric
          label="Payment-to-income"
          value={pti !== undefined ? `${pti.toFixed(1)}%` : "—"}
          color={ptiColorFor(pti)}
        />
      </div>
    </section>
  );
};

export const Metric: React.FC<{ label: string; value: string; tone?: "primary"; color?: string }> =
  React.memo(({ label, value, tone, color }) => (
    <div>
      <span>{label}</span>
      <strong style={{ ...sansNum, color: tone === "primary" ? "var(--color-primary)" : color }}>
        {value}
      </strong>
    </div>
  ));

export default React.memo(InspectorSummary);
