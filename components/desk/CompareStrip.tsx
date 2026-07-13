import React from "react";
import type { CalculatedVehicle } from "../../types";
import { fmt } from "../../utils/format";
import { StarIcon, XMarkIcon } from "../common/Icons";
import { bandColor, nameShort, numVal, otdBgFor, otdColorFor, pct } from "./deskConstants";

interface CompareStripProps {
  vehicles: CalculatedVehicle[];
  focusedVin: string | null;
  thresholds: { warn: number; danger: number };
  onFocus: (vin: string) => void;
  onRemove: (vin: string) => void;
}

const CompareStripBase: React.FC<CompareStripProps> = ({
  vehicles,
  focusedVin,
  thresholds,
  onFocus,
  onRemove,
}) => (
  <section className="desk-card desk-compare-strip" aria-labelledby="desk-compare-title">
    <div className="desk-compare-header">
      <StarIcon className="desk-compare-star" aria-hidden="true" />
      <h2 id="desk-compare-title">Compare</h2>
      <span>{vehicles.length} pinned · reprices live as you change the deal</span>
    </div>

    <div className="desk-compare-list">
      {vehicles.map((vehicle) => {
        const focused = vehicle.vin === focusedVin;
        const payment = numVal(vehicle.monthlyPayment);
        return (
          <article key={vehicle.vin} className="desk-compare-card" data-focused={focused}>
            <button
              type="button"
              className="desk-compare-focus"
              onClick={() => onFocus(vehicle.vin)}
              aria-label={`Focus ${nameShort(vehicle)} on desk`}
            >
              <span className="desk-compare-name">{nameShort(vehicle)}</span>
              <span className="desk-compare-meta">
                {vehicle.modelYear} · STK {vehicle.stock}
              </span>
              <span className="desk-compare-payment">
                <strong>{payment === null ? "—" : fmt(payment)}</strong>
                <small>/mo</small>
              </span>
              <span className="desk-compare-metrics">
                <strong style={{ color: bandColor(vehicle) }}>
                  {vehicle.approvalScore ?? "—"}
                </strong>
                <small>odds</small>
                <span
                  className="desk-compare-odds-pill"
                  style={{
                    color: otdColorFor(vehicle.otdLtv, thresholds),
                    background: otdBgFor(vehicle.otdLtv, thresholds),
                  }}
                >
                  {pct(vehicle.otdLtv)}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="desk-compare-remove"
              onClick={() => onRemove(vehicle.vin)}
              aria-label={`Remove ${nameShort(vehicle)} from compare`}
              title="Remove from compare"
            >
              <XMarkIcon aria-hidden="true" />
            </button>
          </article>
        );
      })}
    </div>
  </section>
);

export const CompareStrip = React.memo(CompareStripBase);
CompareStrip.displayName = "CompareStrip";
