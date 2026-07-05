import React from "react";
import { BAND_META } from "../../services/approvalScorer";
import type { ApprovalBand, CalculatedVehicle, DealData, Settings } from "../../types";

export const mono = "var(--mono)";

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

export const fitCountColor = (n: number): string =>
  n >= 4 ? "var(--color-success)" : n >= 1 ? "var(--color-warning)" : "var(--color-danger)";

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
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.12em",
  color: "var(--color-text-subtle)",
  marginBottom: 13,
  fontFamily: mono,
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
export const monoInput: React.CSSProperties = { ...inputStyle, fontFamily: mono };
export const cardStyle: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: 14,
  boxShadow: "var(--shadow)",
};
export const panelEyebrow: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.1em",
  fontFamily: mono,
  color: "var(--color-text-subtle)",
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
  { key: "vehicle", label: "VEHICLE", title: "Sort by vehicle" },
  { key: "price", label: "PRICE", title: "Sort by price" },
  { key: "frontEndLtv", label: "F·LTV", title: "Front-end LTV" },
  { key: "amountToFinance", label: "FIN", title: "Amount financed" },
  { key: "otdLtv", label: "OTD", title: "Out-the-door LTV" },
  { key: "monthlyPayment", label: "PMT", title: "Monthly payment" },
  { key: "approvalScore", label: "ODDS", title: "Approval odds" },
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
