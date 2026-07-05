/**
 * Money formatting helpers — verbatim semantics from the dc design contract
 * ("LTV Desking PRO.dc.html" fmt / fmtN / splitPay). Shared by the desk,
 * pipeline, reports and modal surfaces so every number renders identically.
 */

/** "$1,234" — rounded whole-dollar currency. */
export const fmt = (n: number): string => "$" + Math.round(n).toLocaleString("en-US");

/** "1,234" — rounded number, no currency symbol. */
export const fmtN = (n: number): string => Math.round(n).toLocaleString("en-US");

export interface SplitPay {
  /** "$1,234" — dollars, floored. */
  whole: string;
  /** ".56" — cents, always two digits. */
  frac: string;
}

/**
 * Split a payment into dollars + cents for the big-number/small-cents payment
 * hero. Cents round half-up; a 100-cent carry rolls into the whole dollars
 * (e.g. 123.999 → "$124" + ".00").
 */
export const splitPay = (p: number): SplitPay => {
  let whole = Math.floor(p);
  let cents = Math.round((p - whole) * 100);
  if (cents === 100) {
    whole += 1;
    cents = 0;
  }
  return {
    whole: "$" + whole.toLocaleString("en-US"),
    frac: "." + String(cents).padStart(2, "0"),
  };
};
