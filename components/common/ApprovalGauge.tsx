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
}

// Arc length of the r=80 semicircle (M20 100 A80 80 0 0 1 180 100).
const ARC_LEN = Math.PI * 80; // ≈ 251.33

/**
 * The signature approval-odds gauge — a semicircle that fills with the band
 * color and shows the numeric score. Mirrors the gauge in LTV Desking
 * PRO.dc.html. role="img" with a value+status name; users read the number, not
 * the angle. The numeric is shown but is capped against real lender eligibility
 * upstream (see approvalScorer), and surfaces always carry the "estimate, not a
 * credit decision" disclaimer. [WS-C / dc-redesign]
 */
export const ApprovalGauge: React.FC<ApprovalGaugeProps> = ({
  score,
  colorVar,
  label = "",
  width = 216,
}) => {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const offset = (ARC_LEN * (1 - s / 100)).toFixed(2);
  const height = Math.round(width * (124 / 216));
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 116"
      style={{ overflow: "visible", position: "relative" }}
      role="img"
      aria-label={`Approval odds ${s} of 100${label ? `, ${label}` : ""}`}
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
      <path
        className="ring-anim"
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
      <text
        x="100"
        y="86"
        textAnchor="middle"
        fontSize="46"
        fontWeight={700}
        style={{ fill: colorVar, fontFamily: "var(--mono)" }}
      >
        {s}
      </text>
    </svg>
  );
};

export default ApprovalGauge;
