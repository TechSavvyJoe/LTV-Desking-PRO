import React, { useRef } from "react";
import type { CalculatedVehicle, DealData } from "../../types";
import { fmt } from "../../utils/format";
import { assessmentColor } from "../../services/dealAssessment";

interface Props {
  vehicle: CalculatedVehicle;
  dealData: DealData;
  onResolveCheck?: (checkId: string) => void;
  onProfitChange?: (patch: NonNullable<DealData["profitInputs"]>) => void;
}
const PROFIT_FIELDS: Record<string, string> = {
  cost: "rating-unit-cost",
  products: "rating-product-cost",
  reserve: "rating-reserve",
  profit: "rating-target",
};
const RAIL_CHECKS = new Set(["fico", "income", "debt", "condition", "terms", "budget", "lender"]);
const money = (n: number | null) => (n === null ? "—" : fmt(n));
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

export const DealRatings: React.FC<Props> = ({
  vehicle,
  dealData,
  onProfitChange,
  onResolveCheck,
}) => {
  const profitDetailsRef = useRef<HTMLDetailsElement>(null);
  const a = vehicle.assessment;
  if (!a) return <p>Ratings require a fresh assessment on the desk.</p>;
  const profit = dealData.profitInputs ?? {};
  const unresolved = a.checks.filter((check) => check.status !== "pass");
  const nextChecks = unresolved
    .filter((check) =>
      PROFIT_FIELDS[check.id]
        ? Boolean(onProfitChange)
        : Boolean(onResolveCheck && RAIL_CHECKS.has(check.id))
    )
    .slice(0, 2);
  const resolveCheck = (checkId: string) => {
    const profitField = PROFIT_FIELDS[checkId];
    if (profitField && onProfitChange) {
      if (profitDetailsRef.current) profitDetailsRef.current.open = true;
      const field = document.getElementById(profitField);
      field?.focus();
      field?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
    } else if (RAIL_CHECKS.has(checkId)) onResolveCheck?.(checkId);
  };
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
      {nextChecks.length > 0 && (
        <section className="desk-rating-details" aria-label="Next to resolve">
          <div className="desk-panel-heading">
            <span>Next to resolve</span>
          </div>
          <ul>
            {nextChecks.map((check) => (
              <li
                key={check.id}
                data-status={check.status}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong>{check.label}</strong>
                  <span>
                    {check.id === "lender"
                      ? "Program review: dealership admin. Published rules only; no lender decision."
                      : check.detail}
                  </span>
                </div>
                <button
                  type="button"
                  className="desk-ghost-btn shrink-0"
                  aria-label={`Resolve ${check.label}`}
                  onClick={() => resolveCheck(check.id)}
                >
                  Resolve
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!onProfitChange && unresolved.some((check) => PROFIT_FIELDS[check.id]) && (
        <p className="desk-rating-caption">
          A manager must confirm costs, expected reserve and the dealer gross target.
        </p>
      )}
      {unresolved.some((check) => check.id === "lender") &&
        !nextChecks.some((check) => check.id === "lender") && (
          <p className="desk-rating-caption">
            Program review: dealership admin. Published rules only; no lender decision.{" "}
            {onResolveCheck && (
              <button
                type="button"
                className="desk-inline-link"
                onClick={() => resolveCheck("lender")}
              >
                Review program rules
              </button>
            )}
          </p>
        )}
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
        <details ref={profitDetailsRef} className="desk-rating-details">
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
