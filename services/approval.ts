import type { CalculatedVehicle, DealData, FilterData, LenderProfile, Settings } from "../types";
import { checkBankEligibility } from "./lenderMatcher";

/**
 * Preliminary approval-odds heuristic for the desk inventory grid. NOT a credit
 * decision — it blends borrower credit, OTD-LTV headroom, term, and how many of
 * the dealer's own lender programs the deal actually fits (so a cheap unit that
 * fails every lender minimum doesn't read as "strong"). Mirrors the approved
 * Direction C mockup. The lender-fit screen reuses the real lenderMatcher.
 */
export interface ApprovalResult {
  /** 0–100, or null when OTD LTV can't be computed (missing book value, etc.) */
  score: number | null;
  /** lender programs the deal currently fits */
  fitCount: number;
  /** total active lender programs screened */
  total: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function computeApproval(
  item: CalculatedVehicle,
  opts: {
    lenderProfiles: LenderProfile[];
    dealData: DealData;
    filters: FilterData;
    settings?: Settings;
  }
): ApprovalResult {
  const { lenderProfiles, dealData, filters } = opts;
  const total = lenderProfiles.length;
  const deal = { ...dealData, ...filters };

  let fitCount = 0;
  for (const bank of lenderProfiles) {
    try {
      if (checkBankEligibility(item, deal, bank).eligible) fitCount++;
    } catch {
      // a malformed lender profile shouldn't break the whole grid
    }
  }

  const otd = item.otdLtv;
  if (typeof otd !== "number") {
    return { score: null, fitCount, total };
  }

  const credit = typeof filters.creditScore === "number" ? filters.creditScore : null;
  const term = typeof dealData.loanTerm === "number" ? dealData.loanTerm : 72;

  // credit unknown → neutral 0.5 so the ring is still meaningful, not punitive
  const cf = credit == null ? 0.5 : clamp01((credit - 520) / (790 - 520));
  const lf = clamp01((142 - otd) / (142 - 100));
  const tf = clamp01((96 - term) / (96 - 48));
  const fr = total > 0 ? fitCount / total : 0;

  const score = Math.round((cf * 0.5 + lf * 0.2 + tf * 0.05 + fr * 0.25) * 100);
  return { score, fitCount, total };
}
