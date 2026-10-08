import React from "react";
import type { CalculatedVehicle } from "../../types";
import { assessmentColor } from "../../services/dealAssessment";
import { fmt } from "../../utils/format";
import { StarIcon, XMarkIcon } from "../common/Icons";
import {
  metaItem,
  mono,
  nameShort,
  numVal,
  otdBgFor,
  otdColorFor,
  pct,
  sansNum,
  stockLabel,
} from "./deskConstants";

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
      <span>
        <span style={{ ...metaItem, ...sansNum }}>{vehicles.length} pinned</span>{" "}
        <span style={{ color: "var(--color-text-muted)" }}>
          — reprices live as you change the deal
        </span>
      </span>
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
              aria-current={focused ? "true" : undefined}
            >
              <span className="desk-compare-name">{nameShort(vehicle)}</span>
              <span className="desk-compare-meta">
                <span style={{ ...metaItem, ...sansNum }}>{vehicle.modelYear}</span>{" "}
                <span style={{ fontFamily: mono }}>{stockLabel(vehicle.stock)}</span>
              </span>
              <span className="desk-compare-payment">
                <strong style={sansNum}>{payment === null ? "—" : fmt(payment)}</strong>
                <small>/mo</small>
              </span>
              <span className="desk-compare-metrics">
                <strong style={{ ...sansNum, color: assessmentColor(vehicle.assessment) }}>
                  {!vehicle.assessment ? (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">Deal readiness not assessed</span>
                    </>
                  ) : (
                    `${vehicle.readinessScore ?? "—"}%`
                  )}
                </strong>
                <small>checks passed</small>
                <span
                  className="desk-compare-odds-pill"
                  style={{
                    ...sansNum,
                    color: otdColorFor(vehicle.otdLtv, thresholds),
                    background: otdBgFor(vehicle.otdLtv, thresholds),
                  }}
                >
                  {pct(vehicle.otdLtv)}
                </span>
              </span>
              <span className="desk-compare-details">
                Gross{" "}
                {vehicle.assessment?.totalGross == null
                  ? "unknown"
                  : fmt(vehicle.assessment.totalGross)}{" "}
                · Interest{" "}
                {vehicle.assessment?.totalInterest == null
                  ? "unknown"
                  : fmt(vehicle.assessment.totalInterest)}
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
