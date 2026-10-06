import React from "react";
import { BAND_META } from "../../services/approvalScorer";
import type { ApprovalBand, CalculatedVehicle, DealData, Settings } from "../../types";

/** Identifiers only (VIN, stock number, shortcuts). Numerals use the sans + `sansNum`. */
export const mono = "var(--mono)";

/** Numeric data: body sans with tabular figures. */
export const sansNum: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontVariantNumeric: "tabular-nums",
};

/**
 * Spacing for the parts of a meta line. Render each part as its own inline
 * span, put a plain space between them, and give every part but the last this
 * margin; screen readers then get a real pause where a bullet used to be.
 */
export const metaItem: React.CSSProperties = { marginInlineEnd: 6 };

/** Terms shipped by the dc design contract (chips + desking-grid rows). */
export const DESK_TERMS = [60, 72, 84, 96];
/** Desking-grid down-payment columns. */
export const DESK_DOWNS = [0, 1000, 2500, 5000];
export const DOWN_LABELS = ["$0", "$1K", "$2.5K", "$5K"];

export const GRID = "2fr 0.95fr 0.85fr 1.1fr 0.9fr 1fr 0.95fr";

export const numVal = (v: number | "Error" | "N/A" | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
export const pct = (v: number | "Error" | "N/A") =>
  numVal(v) === null ? "—" : `${Math.round(v as number)}%`;

/** OTD LTV band colors from settings.ltvThresholds — never hardcoded. */
export const otdColorFor = (
  v: number | "Error" | "N/A",
  th: { warn: number; danger: number }
): string => {
  const n = numVal(v);
  if (n === null) return "var(--color-text-subtle)";
  return n >= th.danger
    ? "var(--color-danger)"
    : n >= th.warn
      ? "var(--color-warning)"
      : "var(--color-success)";
};
export const otdBgFor = (
  v: number | "Error" | "N/A",
  th: { warn: number; danger: number }
): string => {
  const n = numVal(v);
  if (n === null) return "transparent";
  return n >= th.danger
    ? "var(--color-danger-subtle)"
    : n >= th.warn
      ? "var(--color-warning-subtle)"
      : "var(--color-success-subtle)";
};

/** PTI display color per the mockup: ≤13 healthy, ≤18 watch, else danger. */
export const ptiColorFor = (pti: number | undefined): string =>
  pti === undefined
    ? "var(--color-text-muted)"
    : pti <= 13
      ? "var(--color-success)"
      : pti <= 18
        ? "var(--color-warning)"
        : "var(--color-danger)";

/**
 * Color for an "N fit" count. A zero while lender checks are still pending is
 * unknown, not a decline, so it reads neutral rather than danger.
 */
export const fitCountColor = (n: number, pending = false): string =>
  n >= 4
    ? "var(--color-success)"
    : n >= 1
      ? "var(--color-warning)"
      : pending
        ? "var(--color-text-muted)"
        : "var(--color-danger)";

export const bandColor = (v: CalculatedVehicle): string =>
  BAND_META[v.approvalBand ?? "none"].colorVar;

/** "Make Model Trim" (year lives in the sub-meta), with a safe fallback. */
export const nameShort = (v: CalculatedVehicle): string =>
  v.make && v.model ? `${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}` : v.vehicle;

export const aprLabel = (rate: DealData["interestRate"]): string =>
  typeof rate === "number" && Number.isFinite(rate) ? `${rate}%` : "—";

/* ---------- shared styles (mockup-exact) ---------- */

export const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--color-text-muted)",
  display: "block",
  marginBottom: 5,
};
export const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: 0,
  color: "var(--color-text-muted)",
  marginBottom: 13,
};
export const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--color-bg-subtle)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "8px 11px",
  fontSize: 14,
  color: "var(--color-text)",
  fontFamily: "inherit",
  outline: "none",
};
/** Numeric input: sans with tabular figures (mono is for identifiers only). */
export const monoInput: React.CSSProperties = { ...inputStyle, ...sansNum };
export const cardStyle: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-card)",
};
export const panelEyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: 0,
  color: "var(--color-text-muted)",
  marginBottom: 11,
};

/* ---------- sortable columns ---------- */

export type SortKey =
  | "vehicle"
  | "price"
  | "frontEndLtv"
  | "amountToFinance"
  | "otdLtv"
  | "monthlyPayment"
  | "approvalScore";

export const SORT_COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "vehicle", label: "Vehicle", title: "Sort by vehicle" },
  { key: "price", label: "Price", title: "Sort by price" },
  { key: "frontEndLtv", label: "Front LTV", title: "Front-end LTV" },
  { key: "amountToFinance", label: "Financed", title: "Amount financed" },
  { key: "otdLtv", label: "OTD LTV", title: "Out-the-door LTV" },
  { key: "monthlyPayment", label: "Payment", title: "Monthly payment" },
  { key: "approvalScore", label: "Approval", title: "Approval odds" },
];

/** Mockup per-key first-click directions: name ascends, every metric descends. */
export const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  vehicle: "asc",
  price: "desc",
  frontEndLtv: "desc",
  amountToFinance: "desc",
  otdLtv: "desc",
  monthlyPayment: "desc",
  approvalScore: "desc",
};

export const isSortKey = (k: string | null): k is SortKey => !!k && k in DEFAULT_DIR;
