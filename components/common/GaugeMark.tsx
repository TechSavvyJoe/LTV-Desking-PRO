import React from "react";

interface GaugeMarkProps {
  /** Tile size in px. */
  size?: number;
  /** Tile corner radius in px (defaults to ~29% of size). */
  radius?: number;
  className?: string;
  /** Green drop-shadow halo behind the tile. */
  glow?: boolean;
}

/**
 * The LTV Desking logomark — a green tile holding a speedometer needle, the
 * "approval-odds gauge" motif rendered small. Reused by the login surface, the
 * command rail, and anywhere the brand mark appears. [dc-redesign]
 */
const GaugeMarkComponent: React.FC<GaugeMarkProps> = ({
  size = 34,
  radius,
  className,
  glow = true,
}) => {
  const r = radius ?? Math.round(size * 0.29);
  const icon = Math.round(size * 0.55);
  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: "var(--color-primary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: glow ? "0 8px 28px -6px var(--color-primary-subtle)" : "none",
        flexShrink: 0,
      }}
    >
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--on-primary)"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
        <path d="M13.4 12.6 19 7" />
        <path d="M3.5 13a8.5 8.5 0 0 1 17 0" />
      </svg>
    </div>
  );
};

export const GaugeMark = React.memo(GaugeMarkComponent);
export default GaugeMark;
