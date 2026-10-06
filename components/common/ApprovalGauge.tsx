import React from "react";

interface ApprovalGaugeProps {
  /** 0-100 approval-odds score. */
  score: number;
  /** Band color (CSS var) — drives the arc, glow, and numeral. */
  colorVar: string;
  /** Band label, used for the accessible name. */
  label?: string;
  /** Overall SVG width in px. */
  width?: number;
  /** Id of an element with supplementary text (e.g. the "estimate, not a
   * credit decision" disclaimer), forwarded to the svg's aria-describedby
   * so screen readers announce it against the gauge itself rather than an
   * unnamed wrapper. [ship-gate SHOULD-FIX #7] */
  ariaDescribedBy?: string;
  /** Unknown odds (band "pending"): track only, no value arc, "—" numeral. */
  indeterminate?: boolean;
}

// Arc length of the r=80 semicircle (M20 100 A80 80 0 0 1 180 100).
const ARC_LEN = Math.PI * 80; // ≈ 251.33

/**
 * The signature approval-odds gauge — a semicircle that fills with the band
 * color and shows the numeric score. Mirrors the gauge in LTV Desking
 * PRO.dc.html. role="img" with a value+status name; users read the number, not
 * the angle. The numeric is shown but is capped against real lender eligibility
 * upstream (see approvalScorer), and surfaces always carry the "estimate, not a
 * credit decision" disclaimer. When `indeterminate` (lender checks pending,
 * odds unknown) it shows the bare track and "—" rather than a capped number
 * that would read as a decline. [WS-C / dc-redesign]
 */
const ApprovalGaugeComponent: React.FC<ApprovalGaugeProps> = ({
  score,
  colorVar,
  label = "",
  width = 216,
  ariaDescribedBy,
  indeterminate = false,
}) => {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const offset = (ARC_LEN * (1 - s / 100)).toFixed(2);
  const height = Math.round(width * (124 / 216));
  const suffix = label ? `, ${label}` : "";
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 116"
      style={{ overflow: "visible", position: "relative" }}
      role="img"
      aria-label={
        indeterminate ? `Approval odds pending${suffix}` : `Approval odds ${s} of 100${suffix}`
      }
      aria-describedby={ariaDescribedBy}
    >
      <path
        d="M20 100 A80 80 0 0 1 180 100"
        fill="none"
        stroke="var(--color-border-strong)"
        strokeWidth={9}
        strokeLinecap="round"
      />
      <g stroke="var(--color-text-subtle)" strokeWidth={2} opacity={0.45}>
        <line x1="16" y1="100" x2="27" y2="100" />
        <line x1="41" y1="41" x2="48.6" y2="48.6" />
        <line x1="100" y1="16" x2="100" y2="27" />
        <line x1="159" y1="41" x2="151.4" y2="48.6" />
        <line x1="184" y1="100" x2="173" y2="100" />
      </g>
      {!indeterminate && (
        <path
          className="ring-anim"
          data-gauge-value
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={ARC_LEN.toFixed(2)}
          style={{
            stroke: colorVar,
            strokeDashoffset: offset,
            filter: `drop-shadow(0 0 7px ${colorVar})`,
          }}
        />
      )}
      <text
        x="100"
        y="86"
        textAnchor="middle"
        fontSize="46"
        fontWeight={700}
        style={{ fill: colorVar, fontFamily: "var(--mono)" }}
      >
        {indeterminate ? "—" : s}
      </text>
    </svg>
  );
};

export const ApprovalGauge = React.memo(ApprovalGaugeComponent);
export default ApprovalGauge;
