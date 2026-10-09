import React, { useMemo, useState } from "react";
import type { CalculatedVehicle, DealData, FilterData, LenderProfile, Settings } from "../../types";
import { cashToPaymentTarget } from "../../services/paymentTarget";
import { assessDeal, holdIncompleteFits } from "../../services/dealAssessment";
import { lenderFitForVehicle } from "../../services/lenderFit";

interface Props {
  vehicle: CalculatedVehicle;
  dealData: DealData;
  settings: Settings;
  filters: FilterData;
  profiles: LenderProfile[];
  onApply: (term: number, down: number) => void;
}
const currency = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const signatureFor = ({ vehicle, ...rest }: Omit<Props, "onApply">) =>
  JSON.stringify({
    ...rest,
    vehicle: {
      vin: vehicle.vin,
      price: vehicle.price,
      jdPower: vehicle.jdPower,
      jdPowerRetail: vehicle.jdPowerRetail,
      unitCost: vehicle.unitCost,
      condition: vehicle.condition,
      modelYear: vehicle.modelYear,
      mileage: vehicle.mileage,
    },
  });

export const PaymentTarget: React.FC<Props> = ({ onApply, ...source }) => {
  const { vehicle, dealData, settings, filters, profiles } = source;
  const result = useMemo(
    () => cashToPaymentTarget(vehicle, dealData, settings, filters.maxPayment),
    [vehicle, dealData, settings, filters.maxPayment]
  );
  const assessment = useMemo(() => {
    if (result.status !== "proposal") return null;
    const structure = { ...dealData, downPayment: result.totalCash };
    const fit = holdIncompleteFits(
      lenderFitForVehicle(result.proposed, { ...structure, ...filters }, profiles),
      filters
    );
    return assessDeal(result.proposed, structure, filters, profiles, fit);
  }, [result, dealData, filters, profiles]);
  const [undo, setUndo] = useState<{ down: number; signature: string } | null>(null);
  // Do not include derived vehicle metrics: a cash edit legitimately updates
  // them after the debounce. All calculation source fields remain guarded.
  const canUndo = undo !== null && undo.signature === signatureFor(source);
  return (
    <section className="desk-payment-target" aria-label="Cash to payment ceiling">
      <div className="desk-panel-heading">
        <span>Reach the payment ceiling</span>
        <strong>Same rate & term</strong>
      </div>
      {result.status === "inputs-needed" ? (
        <p className="desk-rating-caption">{result.reason}</p>
      ) : result.status === "within-budget" ? (
        <p className="desk-rating-caption" role="status">
          {currency(result.current.monthlyPayment as number)} is within the entered ceiling.
        </p>
      ) : (
        <>
          <div className="desk-payment-target-hero">
            <div>
              <span>Additional customer cash</span>
              <strong>{currency(result.additionalCash)}</strong>
            </div>
            <div>
              <span>Estimated payment</span>
              <strong>{currency(result.proposed.monthlyPayment as number)}</strong>
            </div>
          </div>
          <p className="desk-rating-caption">
            {currency(result.totalCash)} total cash down · {currency(result.monthlySavings)} less /
            mo
          </p>
          <button
            type="button"
            className="desk-secondary-action"
            onClick={() => {
              setUndo({
                down: dealData.downPayment,
                signature: signatureFor({
                  ...source,
                  dealData: { ...dealData, downPayment: result.totalCash },
                }),
              });
              onApply(dealData.loanTerm, result.totalCash);
            }}
          >
            Apply cash down
          </button>
          <details className="desk-rating-details">
            <summary>Calculation & remaining checks</summary>
            <p className="desk-rating-caption">
              Minimum whole-cent cash for the displayed payment. Price, rate, term, trade, products
              and incentives stay fixed. Estimated interest decreases by{" "}
              {currency(result.interestSavings)}.
            </p>
            <p className="desk-rating-caption">
              {assessment?.fitCount ?? 0} verified program fits · {assessment?.pendingLenders ?? 0}{" "}
              pending.
              {assessment
                ? ` ${assessment.checks.filter((c) => c.status !== "pass").length} checks still need attention.`
                : ""}{" "}
              A payment estimate does not establish lender approval.
            </p>
          </details>
        </>
      )}
      {canUndo && (
        <button
          type="button"
          className="desk-ghost-btn"
          onClick={() => {
            onApply(dealData.loanTerm, undo.down);
            setUndo(null);
          }}
        >
          Undo cash change
        </button>
      )}
    </section>
  );
};
