import React from "react";
import { fmt } from "../../utils/format";
import type { Settings } from "../../types";
import { otdColorFor, pct, ptiColorFor } from "./deskConstants";

export const Line: React.FC<{ label: string; value: string; color?: string; bold?: boolean }> =
  React.memo(({ label, value, color, bold }) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span
        style={{
          fontFamily: "var(--mono)",
          fontWeight: bold ? 700 : 400,
          color: color || "inherit",
        }}
      >
        {value}
      </span>
    </div>
  ));

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

export default React.memo(FinancialBreakdown);
