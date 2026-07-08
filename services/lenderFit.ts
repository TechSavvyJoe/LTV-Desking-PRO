import type { CalculatedVehicle, DealData, FilterData, LenderProfile, LenderTier } from "../types";
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
  reasons: string[];
  matchedTier: LenderTier | null;
}

export interface VehicleFit {
  entries: LenderFitEntry[];
  fitCount: number;
  fitNames: string[];
}

const isActive = (l: LenderProfile): boolean => l.active !== false;

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
    entries.push({
      lenderId: lender.id,
      name: lender.name,
      eligible: r.eligible,
      reasons: r.reasons,
      matchedTier: r.matchedTier,
    });
  }
  const fit = entries.filter((e) => e.eligible);
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
