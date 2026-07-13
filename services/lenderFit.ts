import type {
  CalculatedVehicle,
  DealData,
  EligibilityStatus,
  FilterData,
  LenderProfile,
  LenderTier,
} from "../types";
import { checkBankEligibility } from "./lenderMatcher";

/**
 * lenderFit — aggregates the existing per-lender rules engine
 * (checkBankEligibility) into the "how many lenders fit" view the redesign
 * needs (the gauge's fitCount, the inventory "X/Y lenders" column, and the
 * Lenders matrix "units fitting" bars). It does NOT re-implement eligibility;
 * the rules engine stays the single source of truth. [WS-C]
 */

export interface LenderFitEntry {
  lenderId: string;
  name: string;
  eligible: boolean;
  status?: EligibilityStatus;
  reasons: string[];
  matchedTier: LenderTier | null;
  uncheckedConstraints?: string[];
  effectiveRate?: number | null;
  evaluatedConstraints?: number;
}

export interface VehicleFit {
  entries: LenderFitEntry[];
  fitCount: number;
  fitNames: string[];
}

const isActive = (l: LenderProfile): boolean => l.active !== false;

const statusRank: Record<EligibilityStatus, number> = {
  eligible: 0,
  pending: 1,
  ineligible: 2,
};

const compareText = (left: string, right: string): number => {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
};

/** Verified fits rank by published effective rate, then evaluated rule quality. */
const compareFitEntries = (left: LenderFitEntry, right: LenderFitEntry): number => {
  const leftStatus = left.status ?? (left.eligible ? "eligible" : "ineligible");
  const rightStatus = right.status ?? (right.eligible ? "eligible" : "ineligible");
  const statusDelta = statusRank[leftStatus] - statusRank[rightStatus];
  if (statusDelta !== 0) return statusDelta;
  const leftUnchecked = left.uncheckedConstraints?.length ?? 0;
  const rightUnchecked = right.uncheckedConstraints?.length ?? 0;
  if (leftUnchecked !== rightUnchecked) {
    return leftUnchecked - rightUnchecked;
  }
  const leftRate = left.effectiveRate ?? null;
  const rightRate = right.effectiveRate ?? null;
  if (leftRate === null && rightRate !== null) return 1;
  if (leftRate !== null && rightRate === null) return -1;
  if (leftRate !== null && rightRate !== null) {
    const rateDelta = leftRate - rightRate;
    if (rateDelta !== 0) return rateDelta;
  }
  const leftEvaluated = left.evaluatedConstraints ?? 0;
  const rightEvaluated = right.evaluatedConstraints ?? 0;
  if (leftEvaluated !== rightEvaluated) {
    return rightEvaluated - leftEvaluated;
  }
  const nameDelta = compareText(left.name, right.name);
  return nameDelta !== 0 ? nameDelta : compareText(left.lenderId, right.lenderId);
};

/** Per-vehicle lender fit across all active lenders. */
export const lenderFitForVehicle = (
  vehicle: CalculatedVehicle,
  deal: DealData & FilterData,
  lenders: LenderProfile[]
): VehicleFit => {
  const entries: LenderFitEntry[] = [];
  for (const lender of lenders) {
    if (!lender || !isActive(lender)) continue;
    const r = checkBankEligibility(vehicle, deal, lender);
    const status: EligibilityStatus =
      r.status ??
      (r.eligible
        ? "eligible"
        : Array.isArray(r.uncheckedConstraints) && r.uncheckedConstraints.length > 0
          ? "pending"
          : "ineligible");
    entries.push({
      lenderId: lender.id,
      name: lender.name,
      eligible: r.eligible,
      status,
      reasons: r.reasons,
      matchedTier: r.matchedTier,
      uncheckedConstraints: r.uncheckedConstraints ?? [],
      effectiveRate: r.effectiveRate ?? null,
      evaluatedConstraints: r.evaluatedConstraints ?? 0,
    });
  }
  entries.sort(compareFitEntries);
  const fit = entries.filter(
    (e) => (e.status ?? (e.eligible ? "eligible" : "ineligible")) === "eligible" && e.eligible
  );
  return { entries, fitCount: fit.length, fitNames: fit.map((e) => e.name) };
};

/** Count of inventory units each active lender currently fits. */
export const unitsForEachLender = (
  inventory: CalculatedVehicle[],
  deal: DealData & FilterData,
  lenders: LenderProfile[]
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const lender of lenders) {
    if (!lender || !isActive(lender)) continue;
    let n = 0;
    for (const v of inventory) {
      if (checkBankEligibility(v, deal, lender).eligible) n++;
    }
    counts[lender.id] = n;
  }
  return counts;
};

/** Total number of active lenders (denominator for "X / Y lenders fit"). */
export const activeLenderCount = (lenders: LenderProfile[]): number =>
  lenders.filter((l) => l && isActive(l)).length;
