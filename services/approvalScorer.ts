import type { CalculatedVehicle, FilterData, ApprovalBand } from "../types";

/**
 * Centralized, tunable config for the approval-odds model. Everything that moves
 * the score lives here so it can be calibrated without touching logic.
 *
 * IMPORTANT: the score is an internal staff aid — NOT a calibrated probability
 * and NOT a credit decision. Components are normalized to 0-100 BEFORE weighting
 * (so the labeled weights are the real weights), and the displayed band is
 * additionally capped by live lender eligibility, so the gauge can never
 * contradict the rules engine. [WS-C]
 */
export const APPROVAL_CONFIG = {
  // FICO-led weighting (matches how lenders actually tier).
  weights: { credit: 0.45, ltv: 0.3, pti: 0.25 },
  fico: { floor: 450, ceil: 850 },
  ltv: { ideal: 100, zeroAt: 150 }, // ≤ideal → 100 ; ≥zeroAt → 0
  pti: { freeUpTo: 10, zeroAt: 30, unknown: 70 },
  // Affordability veto — a deal the customer plainly can't carry can't read high.
  ptiSoftCap: { threshold: 20, cap: 55 },
  ptiHardCap: { threshold: 25, cap: 35 },
  // Eligibility cap — fits no active lender → the number can't read above this.
  noFitCap: 45,
  bands: { veryStrong: 85, strong: 72, fair: 50 }, // weak is below `fair`
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
      : clamp(100 - Math.max(0, otdLtv - C.ltv.ideal) * (100 / (C.ltv.zeroAt - C.ltv.ideal)), 0, 100);
  if (otdLtv !== null && otdLtv > 125) reasons.push(`OTD LTV high (${Math.round(otdLtv)}%)`);

  let ptiRatio: number | undefined;
  let ptiComp: number = C.pti.unknown;
  if (income !== null && payment !== null) {
    ptiRatio = (payment / income) * 100;
    ptiComp = clamp(
      100 - Math.max(0, ptiRatio - C.pti.freeUpTo) * (100 / (C.pti.zeroAt - C.pti.freeUpTo)),
      0,
      100
    );
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

  const internalScore = Math.round(clamp(score, 2, 99));

  let band: ApprovalBand;
  if (fitCount <= 0) band = "none";
  else if (internalScore >= C.bands.veryStrong) band = "very-strong";
  else if (internalScore >= C.bands.strong) band = "strong";
  else if (internalScore >= C.bands.fair) band = "fair";
  else band = "weak";

  return { internalScore, band, ptiRatio, reasons };
};

export interface BandMeta {
  label: string;
  colorVar: string;
}

export const BAND_META: Record<ApprovalBand, BandMeta> = {
  "very-strong": { label: "Very strong", colorVar: "var(--color-success)" },
  strong: { label: "Strong", colorVar: "var(--color-success)" },
  fair: { label: "Fair", colorVar: "var(--color-warning)" },
  weak: { label: "Weak", colorVar: "var(--color-danger)" },
  none: { label: "No lender fit", colorVar: "var(--color-danger)" },
};
