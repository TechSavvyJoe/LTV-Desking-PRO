import React from "react";
import { ApprovalGauge } from "../common/ApprovalGauge";
import { fmt } from "../../utils/format";
import type { splitPay } from "../../utils/format";
import type { Settings } from "../../types";
import { fitCountColor, otdColorFor, pct, ptiColorFor } from "./deskConstants";

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
      <ApprovalGauge score={score} colorVar={gaugeColor} label={bandLabel} width={116} />
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
    </div>
    <div className="desk-summary-metrics" aria-label="Deal structure metrics">
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

export const Metric: React.FC<{ label: string; value: string; tone?: "primary"; color?: string }> =
  React.memo(({ label, value, tone, color }) => (
    <div>
      <span>{label}</span>
      <strong style={{ color: tone === "primary" ? "var(--color-primary)" : color }}>
        {value}
      </strong>
    </div>
  ));

export default React.memo(InspectorSummary);
