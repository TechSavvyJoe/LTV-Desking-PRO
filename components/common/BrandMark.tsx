import React from "react";

/**
 * The LTV Desking PRO logomark. Single source of truth for the brand
 * visual — same shape as the favicon, just scalable. Pass `size` for
 * raw pixels, or use `className` for tailwind sizing (e.g. w-10 h-10).
 *
 * Mark composition: two stylized letterforms — a tall "L" (front-end
 * gross) and a softer "V" (loan-to-value V-curve) — in primary-blue
 * on slate-950. Reads as "LV" at small sizes; the "v" tightens at
 * larger scales.
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
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      style={dims}
    >
      {variant === "default" && <rect width="32" height="32" rx="7" fill="#0F172A" />}
      <path d="M9 8v16h6v-2.5h-3.5V8H9z" fill="#3B82F6" />
      <path d="M16.5 8l3.25 11.5L23 8h2.5l-4.5 16h-2.5L14 8h2.5z" fill="#60A5FA" />
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
          className={`${titleSize} font-bold tracking-tight text-[var(--color-text)]`}
          style={{ letterSpacing: "-0.02em" }}
        >
          LTV Desking <span style={{ color: "var(--color-primary)" }}>PRO</span>
        </p>
        {tagline && <p className="text-xs text-[var(--color-text-subtle)] mt-0.5">{tagline}</p>}
      </div>
    </div>
  );
};

export default BrandMark;
