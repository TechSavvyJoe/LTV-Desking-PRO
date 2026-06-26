import React from "react";

/**
 * The LTV Desking PRO logomark. Single source of truth for the brand
 * visual. Pass `size` for raw pixels, or use `className` for tailwind
 * sizing (e.g. w-10 h-10).
 *
 * Mark composition: a loan-to-value "gauge" — a sweeping arc with a
 * needle pointing up-and-right (a strong deal) — echoing the approval
 * rings used throughout the desk. On a green-gradient rounded tile for
 * the "default" variant; inherits `currentColor` as a flat "glyph".
 */

interface BrandMarkProps {
  /** Pixel size; overrides className width/height if both supplied */
  size?: number;
  className?: string;
  /** Render mode: "default" (rounded square w/ background), "glyph" (no background) */
  variant?: "default" | "glyph";
  "aria-label"?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  size,
  className,
  variant = "default",
  "aria-label": ariaLabel = "LTV Desking PRO",
}) => {
  const dims = size ? { width: size, height: size } : undefined;
  const ink = variant === "default" ? "#06140a" : "currentColor";
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      style={dims}
    >
      {variant === "default" && (
        <>
          <defs>
            <linearGradient
              id="lv-mark-grad"
              x1="0"
              y1="0"
              x2="32"
              y2="32"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#6fd086" />
              <stop offset="1" stopColor="#2ea043" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="9" fill="url(#lv-mark-grad)" />
        </>
      )}
      <path
        d="M7 21.5 A 10 10 0 1 1 25 21.5"
        fill="none"
        stroke={ink}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M16 16 L 21.5 10.5" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.9" fill={ink} />
    </svg>
  );
};

/**
 * Wordmark — the brand mark + product name, side by side. Use as the
 * top-of-page identifier in login screens, headers, and the marketing
 * landing once it exists.
 */
export const BrandWordmark: React.FC<{
  className?: string;
  tagline?: string;
  size?: "sm" | "md" | "lg";
}> = ({ className = "", tagline, size = "md" }) => {
  const dims = size === "lg" ? "w-12 h-12" : size === "sm" ? "w-7 h-7" : "w-9 h-9";
  const titleSize = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <BrandMark className={dims} variant="default" />
      <div className="leading-tight">
        <p
          className={`${titleSize} font-display font-bold tracking-tight text-white`}
          style={{ letterSpacing: "-0.02em" }}
        >
          LTV Desking <span className="text-[var(--color-primary)]">PRO</span>
        </p>
        {tagline && <p className="text-xs text-slate-400 mt-0.5">{tagline}</p>}
      </div>
    </div>
  );
};

export default BrandMark;
