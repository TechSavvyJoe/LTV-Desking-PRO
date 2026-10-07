import React from "react";
import type { CalculatedVehicle, DealData } from "../../types";
import { fmt } from "../../utils/format";
import { assessmentColor } from "../../services/dealAssessment";

interface Props {
  vehicle: CalculatedVehicle;
  dealData: DealData;
  onProfitChange?: (patch: NonNullable<DealData["profitInputs"]>) => void;
}
const money = (n: number | null) => (n === null ? "—" : fmt(n));
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

export const DealRatings: React.FC<Props> = ({ vehicle, dealData, onProfitChange }) => {
  const a = vehicle.assessment;
  if (!a) return <p>Ratings require a fresh assessment on the desk.</p>;
  const profit = dealData.profitInputs ?? {};
  const field = (
    id: string,
    label: string,
    value: number | undefined,
    set: (n: number | undefined) => void
  ) => (
    <div className="desk-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="dc-input tabular-nums"
        type="number"
        min="0"
        max="10000000"
        step="0.01"
        value={value ?? ""}
        placeholder="Unknown"
        onChange={(e) => {
          const n = e.target.value === "" ? undefined : Number(e.target.value);
          if (n === undefined || (Number.isFinite(n) && n >= 0 && n <= 10000000)) set(n);
        }}
      />
    </div>
  );
  return (
    <section className="desk-ratings" aria-label="Explainable deal ratings">
      <div className="desk-panel-heading">
        <span>Deal analysis</span>
        <strong style={{ color: assessmentColor(a) }}>
          {a.readiness}% · {a.passed}/{a.total} checks
        </strong>
      </div>
      <p className="desk-rating-caption">
        {a.label}. Counts passed checks; never an approval probability.
      </p>
      <div className="desk-rating-metrics">
        <Metric
          label="Budget used"
          value={pct(a.budgetUsedPercent)}
          tone={
            a.budgetHeadroom === null ? undefined : a.budgetHeadroom < 0 ? "warning" : "success"
          }
          note={
            a.budgetHeadroom === null
              ? "Set a customer payment ceiling"
              : `${money(Math.abs(a.budgetHeadroom))} ${a.budgetHeadroom < 0 ? "over budget" : "monthly headroom"}`
          }
        />
        <Metric
          label="Gross target"
          value={pct(a.profitTargetPercent)}
          tone={
            a.profitHeadroom === null ? undefined : a.profitHeadroom < 0 ? "warning" : "success"
          }
          note={
            a.profitHeadroom === null
              ? "Confirm costs, reserve and target"
              : `${money(Math.abs(a.profitHeadroom))} ${a.profitHeadroom < 0 ? "below" : "above"} target`
          }
        />
        <Metric
          label="PTI / DTI"
          value={`${pct(a.pti)} / ${pct(a.dti)}`}
          note="Payment / income · debt + payment / income"
        />
        <Metric
          label="Total interest"
          value={money(a.totalInterest)}
          note={`${money(a.totalPayments)} total loan payments · estimated`}
        />
        <Metric
          label="Data complete"
          value={`${a.completeness}%`}
          note="Entered checks, including failures"
        />
        <Metric
          label="Lender match"
          value={pct(a.lenderMatchPercent)}
          note={`${a.fitCount}/${a.checkedLenders} checked · ${a.pendingLenders} pending`}
        />
      </div>
      <div className="desk-gross-breakdown" aria-label="Estimated dealer gross">
        <div>
          <span>Front gross</span>
          <strong>{money(a.frontGross)}</strong>
        </div>
        <div>
          <span>Product gross</span>
          <strong>{money(a.productGross)}</strong>
        </div>
        <div>
          <span>Estimated total gross</span>
          <strong>{money(a.totalGross)}</strong>
        </div>
      </div>
      {a.dominatedBy !== undefined && (
        <p className="desk-rating-caption">
          {a.dominatedBy === 0
            ? "Tradeoff option: no fully assessed unit improves payment, interest and gross together."
            : `${a.dominatedBy} fully assessed unit${a.dominatedBy === 1 ? "" : "s"} offer no higher payment or interest and no lower gross.`}
        </p>
      )}
      <details className="desk-rating-details">
        <summary>
          Why this rating · {a.checks.filter((c) => c.status !== "pass").length} checks to resolve
        </summary>
        <ul>
          {a.checks.map((c) => (
            <li key={c.id} data-status={c.status}>
              <strong>
                {c.status === "pass" ? "Pass" : c.status === "fail" ? "Fail" : "Missing"} ·{" "}
                {c.label}
              </strong>
              <span>{c.detail}</span>
            </li>
          ))}
        </ul>
      </details>
      {onProfitChange && (
        <details className="desk-rating-details">
          <summary>Set profit inputs</summary>
          <p className="desk-rating-caption">
            Confirm costs for{" "}
            {/^stk/i.test(String(vehicle.stock)) ? vehicle.stock : `STK ${vehicle.stock}`}. All-in
            cost includes acquisition, recon, pack and carrying costs. Imported unit cost:{" "}
            {typeof vehicle.unitCost === "number" ? fmt(vehicle.unitCost) : "unknown"}.
          </p>
          <div className="desk-rating-inputs">
            {field(
              "rating-unit-cost",
              "All-in unit cost ($)",
              profit.allInUnitCosts?.[vehicle.vin],
              (n) => {
                const costs = { ...profit.allInUnitCosts };
                if (n === undefined) delete costs[vehicle.vin];
                else costs[vehicle.vin] = n;
                onProfitChange({ allInUnitCosts: costs });
              }
            )}
            {field("rating-product-cost", "Total product cost ($)", profit.productCost, (n) =>
              onProfitChange({ productCost: n })
            )}
            {field("rating-reserve", "Expected reserve / flat ($)", profit.reserve, (n) =>
              onProfitChange({ reserve: n })
            )}
            {field("rating-target", "Minimum total gross ($)", profit.target, (n) =>
              onProfitChange({ target: n })
            )}
          </div>
          <p className="desk-rating-caption">
            Estimates require confirmed costs and lender terms. Enter 0 where applicable. Reserve is
            entered, not inferred. Total gross excludes later chargebacks and overhead.
          </p>
        </details>
      )}
    </section>
  );
};
const Metric = ({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "success" | "warning";
}) => (
  <div>
    <span>{label}</span>
    <strong style={tone ? { color: `var(--color-${tone})` } : undefined}>{value}</strong>
    <small>{note}</small>
  </div>
);
