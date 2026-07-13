import type { Vehicle } from "../types";

/** Which guide book a lender advances against. */
export type BookValueSource = "Trade" | "Retail";

/**
 * Coerce a raw book value ("N/A", numeric string from freeform PB JSON, etc.)
 * to a positive finite number, or null when there is no usable book value.
 */
const positiveBook = (value: unknown): number | null => {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Single source of truth for choosing the book value that backs an LTV ratio.
 * Used by BOTH the calculator and the lender rules engine so the two can never
 * silently diverge on which book a ratio was computed against.
 *
 * - source "Trade" / "Retail": the lender's declared book, with NO
 *   cross-fallback — a Retail-book lender's caps must never be applied to a
 *   trade-book ratio (and vice versa). Returns null when that book is missing.
 * - source omitted: the calculator's display default — trade book preferred,
 *   retail book as fallback (matches the historical frontEndLtv/otdLtv logic).
 */
export const selectBookValue = (
  vehicle: Partial<Pick<Vehicle, "jdPower" | "jdPowerRetail">>,
  source?: BookValueSource
): number | null => {
  const trade = positiveBook(vehicle.jdPower);
  const retail = positiveBook(vehicle.jdPowerRetail);
  if (source === "Retail") return retail;
  if (source === "Trade") return trade;
  return trade ?? retail;
};
