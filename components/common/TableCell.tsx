import React from "react";
import CopyToClipboard from "./CopyToClipboard";

export const formatCurrency = (value: number | string | undefined): string => {
  if (value === undefined || value === null || value === "N/A" || value === "Error") return "N/A";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num)
    ? "N/A"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(num);
};

/**
 * Currency with cents. Use for figures a customer reconciles against a
 * contract — monthly payment, sales tax, OTD, amount financed — where
 * whole-dollar rounding visibly disagrees with the financed math.
 */
export const formatCurrencyExact = (value: number | string | undefined): string => {
  if (value === undefined || value === null || value === "N/A" || value === "Error") return "N/A";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num)
    ? "N/A"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
};

/**
 * PocketBase serializes datetimes as "YYYY-MM-DD HH:MM:SS.sssZ" (space
 * separator) — a non-ISO form WebKit's Date parser rejects, so iPads render
 * "Invalid Date". Normalize the space to "T" before parsing.
 */
const normalizePbDate = (dateString: string): string =>
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(dateString) ? dateString.replace(" ", "T") : dateString;

export const formatPercentage = (
  value: number | string | undefined,
  decimals: number = 2
): string => {
  if (value === undefined || value === null || value === "N/A" || value === "Error") return "N/A";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num) ? "N/A" : `${num.toFixed(decimals)}%`;
};

export const formatNumber = (value: number | string | undefined): string => {
  if (value === undefined || value === null || value === "N/A" || value === "Error") return "N/A";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num) ? "N/A" : num.toLocaleString();
};

export const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return "N/A";
  try {
    return new Date(normalizePbDate(dateString)).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch (e) {
    return "Invalid Date";
  }
};

export const formatDateTime = (dateString: string | undefined): string => {
  if (!dateString) return "N/A";
  try {
    return new Date(normalizePbDate(dateString)).toLocaleString("en-US", {
      year: "2-digit",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch (e) {
    return "Invalid Date";
  }
};

import { useSettings } from "../../hooks/useSettings";

// Status colors come from semantic CSS-variable tokens (theme-aware, contrast-
// checked) — never hardcoded Tailwind colors. Every status cell also carries a
// non-color glyph so meaning survives for colorblind users (WCAG 1.4.1).
type StatusTier = { color: string; bg: string; glyph: string; label: string };

const DEFAULT_LTV_THRESHOLDS = { warn: 115, danger: 125, critical: 135 };

const ltvTier = (
  value: number,
  thresholds: { warn: number; danger: number; critical: number }
): StatusTier => {
  const { warn, danger, critical } = thresholds;
  if (value >= critical)
    return {
      color: "var(--color-danger)",
      bg: "var(--color-danger-subtle)",
      glyph: "▲",
      label: "critical LTV",
    };
  if (value >= danger)
    return {
      color: "var(--color-danger)",
      bg: "var(--color-danger-subtle)",
      glyph: "▲",
      label: "high LTV",
    };
  if (value >= warn)
    return {
      color: "var(--color-warning)",
      bg: "var(--color-warning-subtle)",
      glyph: "●",
      label: "elevated LTV",
    };
  return {
    color: "var(--color-success)",
    bg: "var(--color-success-subtle)",
    glyph: "✓",
    label: "healthy LTV",
  };
};

const NaCell = () => (
  <span className="financial-cell font-medium text-sm" style={{ color: "var(--color-text-subtle)" }}>
    --
  </span>
);

interface LtvCellProps {
  value: number | "Error" | "N/A";
}
export const LtvCell: React.FC<LtvCellProps> = ({ value }) => {
  const [settings] = useSettings();
  const thresholds = settings.ltvThresholds || DEFAULT_LTV_THRESHOLDS;
  if (typeof value !== "number") return <NaCell />;
  const t = ltvTier(value, thresholds);
  return (
    <CopyToClipboard valueToCopy={value}>
      <span className="financial-cell font-bold" style={{ color: t.color }} title={t.label}>
        <span aria-hidden="true" style={{ marginRight: 4, fontSize: "0.85em" }}>
          {t.glyph}
        </span>
        {formatPercentage(value, 0)}
      </span>
    </CopyToClipboard>
  );
};

export const OtdLtvCell: React.FC<LtvCellProps> = ({ value }) => {
  const [settings] = useSettings();
  const thresholds = settings.ltvThresholds || DEFAULT_LTV_THRESHOLDS;
  if (typeof value !== "number") return <NaCell />;
  const t = ltvTier(value, thresholds);
  return (
    <CopyToClipboard valueToCopy={value}>
      <span
        className="financial-cell font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs"
        style={{ color: t.color, background: t.bg }}
        title={t.label}
      >
        <span aria-hidden="true">{t.glyph}</span>
        {formatPercentage(value, 0)}
      </span>
    </CopyToClipboard>
  );
};

interface GrossCellProps {
  value: number | "Error" | "N/A";
}
export const GrossCell: React.FC<GrossCellProps> = ({ value }) => {
  if (typeof value !== "number") return <NaCell />;
  const isNegative = value < 0;
  const color = isNegative ? "var(--color-danger)" : "var(--color-success)";
  const bg = isNegative ? "var(--color-danger-subtle)" : "var(--color-success-subtle)";
  return (
    <CopyToClipboard valueToCopy={value}>
      <span
        className="financial-cell inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-xs"
        style={{ color, background: bg }}
        title={isNegative ? "negative gross" : "positive gross"}
      >
        <span aria-hidden="true">{isNegative ? "▼" : "▲"}</span>
        {formatCurrency(value)}
      </span>
    </CopyToClipboard>
  );
};

interface PaymentCellProps {
  value: number | "Error" | "N/A";
}
export const PaymentCell: React.FC<PaymentCellProps> = ({ value }) => (
  <CopyToClipboard valueToCopy={value}>
    <span className="financial-cell font-bold" style={{ color: "var(--color-text)" }}>
      {formatCurrency(value)}
    </span>
  </CopyToClipboard>
);
