import type { CalculatedVehicle, FilterData, ApprovalBand } from "../types";

/**
 * Centralized, tunable config for the approval-odds model. Everything that moves
 * the score lives here so it can be calibrated without touching logic.
 *
 * The weights and component curves deliberately adopt the dc mockup's formula
 * (LTV-led 0.36/0.50/0.14, ltvComp `115 − (otd − 100) · 2.2` clamped 0-105,
 * ptiComp `100 − max(0, pti − 12) · 5` with unknown income reading 100, final
 * clamp 8-98) so the shipped gauge matches the approved design contract.
 * The production hardening is RETAINED on top: PTI soft/hard affordability
 * caps, the no-fit cap + reasons, and neutral-50 for missing fico/ltv.
 * [reconciliation 1]
 *
 * IMPORTANT: the score is an internal staff aid — NOT a calibrated probability
 * and NOT a credit decision. Components are normalized to 0-100 BEFORE weighting
 * (so the labeled weights are the real weights), and the displayed band is
 * additionally capped by live lender eligibility, so the gauge can never
 * contradict the rules engine. [WS-C]
 */
export const APPROVAL_CONFIG = {
  // Mockup weighting (LTV-led — the desk's core structuring lever).
  weights: { credit: 0.36, ltv: 0.5, pti: 0.14 },
  fico: { floor: 450, ceil: 850 },
  // ltvComp = clamp(base − (otdLtv − pivot) · slope, 0, max)
  ltv: { base: 115, pivot: 100, slope: 2.2, max: 105 },
  // ptiComp = clamp(100 − max(0, pti − freeUpTo) · slope, 0, 100); unknown
  // income reads 100 (no affordability signal is not a bad signal).
  pti: { freeUpTo: 12, slope: 5, unknown: 100 },
  // Affordability veto — a deal the customer plainly can't carry can't read high.
  ptiSoftCap: { threshold: 20, cap: 55 },
  ptiHardCap: { threshold: 25, cap: 35 },
  // Eligibility cap — fits no active lender → the number can't read above this.
  noFitCap: 45,
  bands: { strong: 72, moderate: 50 }, // weak below `moderate`; fitCount 0 → none
  clamp: { floor: 8, ceil: 98 },
} as const;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const num = (v: number | "Error" | "N/A"): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export interface ApprovalResult {
  internalScore: number; // 0-100 shown on the gauge (hardened, eligibility-capped)
  band: ApprovalBand;
  ptiRatio?: number; // payment-to-income %, undefined when income is unknown
  reasons: string[]; // principal drag factors (for decline-like states)
}

/**
 * Score a vehicle's approval odds for the current deal. `fitCount` is the number
 * of active lenders the deal fits (from lenderFit) and caps the result.
 */
export const scoreApprovalOdds = (
  vehicle: CalculatedVehicle,
  deal: Pick<FilterData, "creditScore" | "monthlyIncome">,
  fitCount: number
): ApprovalResult => {
  const C = APPROVAL_CONFIG;
  const reasons: string[] = [];

  const fico = typeof deal.creditScore === "number" ? deal.creditScore : null;
  const otdLtv = num(vehicle.otdLtv);
  const payment = num(vehicle.monthlyPayment);
  const income =
    typeof deal.monthlyIncome === "number" && deal.monthlyIncome > 0 ? deal.monthlyIncome : null;

  // Each component normalized to 0-100 before weighting.
  const creditComp =
    fico === null
      ? 50
      : clamp(((fico - C.fico.floor) / (C.fico.ceil - C.fico.floor)) * 100, 0, 100);
  if (fico !== null && fico < 600) reasons.push("Credit score in subprime range");

  const ltvComp =
    otdLtv === null
      ? 50
      : clamp(C.ltv.base - (otdLtv - C.ltv.pivot) * C.ltv.slope, 0, C.ltv.max);
  if (otdLtv !== null && otdLtv > 125) reasons.push(`OTD LTV high (${Math.round(otdLtv)}%)`);

  let ptiRatio: number | undefined;
  let ptiComp: number = C.pti.unknown;
  if (income !== null && payment !== null) {
    ptiRatio = (payment / income) * 100;
    ptiComp = clamp(100 - Math.max(0, ptiRatio - C.pti.freeUpTo) * C.pti.slope, 0, 100);
    if (ptiRatio > 18) reasons.push(`Payment-to-income high (${ptiRatio.toFixed(1)}%)`);
  }

  let score =
    C.weights.credit * creditComp + C.weights.ltv * ltvComp + C.weights.pti * ptiComp;

  // Affordability veto.
  if (ptiRatio !== undefined && ptiRatio >= C.ptiHardCap.threshold)
    score = Math.min(score, C.ptiHardCap.cap);
  else if (ptiRatio !== undefined && ptiRatio >= C.ptiSoftCap.threshold)
    score = Math.min(score, C.ptiSoftCap.cap);

  // Eligibility cap — the gauge can't read high if nothing fits.
  if (fitCount <= 0) {
    score = Math.min(score, C.noFitCap);
    reasons.unshift("No active lender fits this structure");
  }

  const internalScore = Math.round(clamp(score, C.clamp.floor, C.clamp.ceil));

  let band: ApprovalBand;
  if (fitCount <= 0) band = "none";
  else if (internalScore >= C.bands.strong) band = "strong";
  else if (internalScore >= C.bands.moderate) band = "moderate";
  else band = "weak";

  return { internalScore, band, ptiRatio, reasons };
};

export interface BandMeta {
  label: string;
  colorVar: string;
}

export const BAND_META: Record<ApprovalBand, BandMeta> = {
  strong: { label: "Strong approval", colorVar: "var(--color-success)" },
  moderate: { label: "Moderate odds", colorVar: "var(--color-warning)" },
  weak: { label: "Weak — restructure", colorVar: "var(--color-danger)" },
  none: { label: "No lender fit", colorVar: "var(--color-danger)" },
};
