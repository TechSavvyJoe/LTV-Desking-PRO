import React from "react";

interface ScoreRingProps {
  /** Approval score 0–100 (drives the arc sweep). */
  score: number;
  /** Rendered size in px (viewBox stays 24). */
  size?: number;
  /** CSS color for the value arc, e.g. "var(--color-success)". */
  colorVar: string;
  className?: string;
}

/** 2π · r9 — dash length of the full value circle. */
const CIRCUMFERENCE = 56.55;

/**
 * Small circular approval-score ring used on desk/inventory rows — a
 * border-strong track with a tweened (.ring-anim) color arc, per the dc
 * mockup's r=9 row rings. Decorative: the score is rendered as text beside
 * it, so the SVG is aria-hidden. [dc-redesign]
 */
const ScoreRingComponent: React.FC<ScoreRingProps> = ({
  score,
  size = 20,
  colorVar,
  className,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
    <circle
      cx="12"
      cy="12"
      r="9"
      fill="none"
      stroke="var(--color-border-strong)"
      strokeWidth="2.5"
    />
    <circle
      className="ring-anim"
      cx="12"
      cy="12"
      r="9"
      fill="none"
      stroke={colorVar}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeDasharray={CIRCUMFERENCE}
      strokeDashoffset={(CIRCUMFERENCE * (1 - score / 100)).toFixed(2)}
      transform="rotate(-90 12 12)"
    />
  </svg>
);

export const ScoreRing = React.memo(ScoreRingComponent);
export default ScoreRing;
