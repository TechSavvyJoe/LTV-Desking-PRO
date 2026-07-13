import type {
  CalculatedVehicle,
  DealData,
  EligibilityStatus,
  FilterData,
  LenderProfile,
  LenderTier,
} from "../types";
import { selectBookValue } from "./bookValue";

const formatCurrencySimple = (value: number | string | undefined): string => {
  if (typeof value !== "number") return String(value || "0");
  try {
    return `$${value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  } catch {
    return `$${value}`;
  }
};

const finiteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const configuredLimit = (value: unknown): number | null => {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
};

const compareText = (left: string, right: string): number => {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
};

const effectiveTierRate = (tier: LenderTier): number | null => {
  const base = finiteNumber(tier.baseInterestRate);
  if (base === null) return null;
  return base + (finiteNumber(tier.rateAdder) ?? 0);
};

const SAMPLE_CONSTRAINT = "sample program - verify or convert before use";
const SAMPLE_REASON =
  "Sample program - illustrative only; verify or convert it before using it as an approval path.";

export interface EligibilityResult {
  eligible: boolean;
  status: EligibilityStatus;
  reasons: string[];
  matchedTier: LenderTier | null;
  /** Required constraints that cannot be evaluated with the current deal data. */
  uncheckedConstraints: string[];
  /** Effective tier buy rate (base + adder), when published. */
  effectiveRate: number | null;
  /** Number of configured constraints evaluated for the selected result. */
  evaluatedConstraints: number;
}

const fail = (reasons: string[], unchecked: string[] = []): EligibilityResult => ({
  eligible: false,
  status: "ineligible",
  reasons,
  matchedTier: null,
  uncheckedConstraints: unchecked,
  effectiveRate: null,
  evaluatedConstraints: 0,
});

interface TierCandidate {
  tier: LenderTier;
  unchecked: string[];
  effectiveRate: number | null;
  evaluatedConstraints: number;
}

const compareCandidates = (left: TierCandidate, right: TierCandidate): number => {
  if (left.unchecked.length !== right.unchecked.length) {
    return left.unchecked.length - right.unchecked.length;
  }
  if (left.effectiveRate === null && right.effectiveRate !== null) return 1;
  if (left.effectiveRate !== null && right.effectiveRate === null) return -1;
  if (left.effectiveRate !== null && right.effectiveRate !== null) {
    const rateDelta = left.effectiveRate - right.effectiveRate;
    if (rateDelta !== 0) return rateDelta;
  }
  if (left.evaluatedConstraints !== right.evaluatedConstraints) {
    return right.evaluatedConstraints - left.evaluatedConstraints;
  }
  const confidenceDelta =
    (finiteNumber(right.tier.confidence) ?? -1) - (finiteNumber(left.tier.confidence) ?? -1);
  if (confidenceDelta !== 0) return confidenceDelta;
  return compareText(left.tier.name || "", right.tier.name || "");
};

const pendingResult = (candidate: TierCandidate): EligibilityResult => ({
  eligible: false,
  status: "pending",
  reasons: candidate.unchecked.includes(SAMPLE_CONSTRAINT)
    ? [
        SAMPLE_REASON,
        ...(() => {
          const otherUnchecked = candidate.unchecked.filter((item) => item !== SAMPLE_CONSTRAINT);
          return otherUnchecked.length > 0
            ? [`Pending required information: ${otherUnchecked.join(", ")}.`]
            : [];
        })(),
      ]
    : [`Pending required information: ${candidate.unchecked.join(", ")}.`],
  matchedTier: candidate.tier,
  uncheckedConstraints: candidate.unchecked,
  effectiveRate: candidate.effectiveRate,
  evaluatedConstraints: candidate.evaluatedConstraints,
});

const samplePendingResult = (
  unchecked: Iterable<string>,
  evaluatedConstraints: number,
  reasons: string[] = [],
  matchedTier: LenderTier | null = null,
  effectiveRate: number | null = null
): EligibilityResult => ({
  eligible: false,
  status: "pending",
  reasons: [SAMPLE_REASON, ...reasons],
  matchedTier,
  uncheckedConstraints: [...new Set([SAMPLE_CONSTRAINT, ...unchecked])].sort(compareText),
  effectiveRate,
  evaluatedConstraints,
});

/**
 * Evaluate a bank's programs against the deal + vehicle.
 *
 * `asOfYear` anchors vehicle-age (tier.maxAge) checks; it defaults to the
 * current calendar year and exists so tests can pin a year instead of rotting
 * every January 1.
 */
export const checkBankEligibility = (
  vehicle: CalculatedVehicle,
  deal: DealData & FilterData,
  bank: LenderProfile,
  asOfYear: number = new Date().getFullYear()
): EligibilityResult => {
  if (!bank || typeof bank !== "object") return fail(["Invalid bank profile data."]);
  if (!deal || typeof deal !== "object") {
    return bank.isSample
      ? samplePendingResult([], 0, ["Deal data is invalid and cannot be evaluated."])
      : fail(["Invalid deal data."]);
  }

  const amountFinanced = finiteNumber(vehicle?.amountToFinance);
  if (amountFinanced === null) {
    const reasons = [
      "Cannot evaluate - financed amount unavailable (vehicle is missing a price or the deal can't be calculated).",
    ];
    return bank.isSample ? samplePendingResult([], 0, reasons) : fail(reasons);
  }
  if (amountFinanced <= 0) {
    const reasons = ["Amount financed must be greater than $0 for lender matching."];
    return bank.isSample ? samplePendingResult([], 0, reasons) : fail(reasons);
  }

  const backendAmount = finiteNumber(deal.backendProducts);
  if (backendAmount !== null && backendAmount < 0) {
    const reasons = ["Backend products cannot be negative."];
    return bank.isSample ? samplePendingResult([], 0, reasons) : fail(reasons);
  }
  const monthlyDebt = finiteNumber(deal.monthlyDebt);
  if (monthlyDebt !== null && monthlyDebt < 0) {
    const reasons = ["Monthly debt cannot be negative."];
    return bank.isSample ? samplePendingResult([], 0, reasons) : fail(reasons);
  }

  const creditScore = finiteNumber(deal.creditScore);
  const income = finiteNumber(deal.monthlyIncome);
  const payment = finiteNumber(vehicle?.monthlyPayment);
  const quotedRate = finiteNumber(deal.interestRate);
  const modelYear = finiteNumber(vehicle?.modelYear);
  const mileage = finiteNumber(vehicle?.mileage);
  const term = finiteNumber(deal.loanTerm);
  const make = (vehicle?.make || "").trim().toLowerCase();

  const bankReasons: string[] = [];
  const bankPending = new Set<string>();
  if (bank.isSample) bankPending.add(SAMPLE_CONSTRAINT);
  let bankEvaluated = 0;

  const bankMinFinanced = configuredLimit(bank.minAmountFinanced);
  if (bankMinFinanced !== null) {
    bankEvaluated++;
    if (amountFinanced < bankMinFinanced) {
      bankReasons.push(
        `Amount financed too low (${formatCurrencySimple(amountFinanced)} < ${formatCurrencySimple(bankMinFinanced)})`
      );
    }
  }
  const bankMaxFinanced = configuredLimit(bank.maxAmountFinanced);
  if (bankMaxFinanced !== null) {
    bankEvaluated++;
    if (amountFinanced > bankMaxFinanced) {
      bankReasons.push(
        `Amount financed too high (${formatCurrencySimple(amountFinanced)} > ${formatCurrencySimple(bankMaxFinanced)})`
      );
    }
  }

  const bankMaxBackend = configuredLimit(bank.maxBackend);
  if (bankMaxBackend !== null) {
    if (backendAmount === null) bankPending.add("backend amount");
    else {
      bankEvaluated++;
      if (backendAmount > bankMaxBackend) {
        bankReasons.push(
          `Backend too high (${formatCurrencySimple(backendAmount)} > ${formatCurrencySimple(bankMaxBackend)})`
        );
      }
    }
  }

  const bankMinIncome = configuredLimit(bank.minIncome);
  if (bankMinIncome !== null && bankMinIncome > 0) {
    if (income === null) bankPending.add("monthly income");
    else {
      bankEvaluated++;
      if (income < bankMinIncome) {
        bankReasons.push(
          `Income too low (${formatCurrencySimple(income)} < ${formatCurrencySimple(bankMinIncome)})`
        );
      }
    }
  }

  const bankMaxPti = configuredLimit(bank.maxPti);
  if (bankMaxPti !== null) {
    if (income === null) bankPending.add("monthly income for max PTI");
    else if (payment === null || payment < 0) bankPending.add("computed payment for max PTI");
    else {
      bankEvaluated++;
      const pti = income > 0 ? (payment / income) * 100 : Number.POSITIVE_INFINITY;
      if (pti > bankMaxPti) bankReasons.push(`PTI too high (${pti.toFixed(1)}% > ${bankMaxPti}%)`);
    }
  }

  const bankMaxDti = configuredLimit(bank.maxDti);
  if (bankMaxDti !== null) {
    if (income === null) bankPending.add("monthly income for max DTI");
    else if (monthlyDebt === null) bankPending.add("monthly debt for max DTI");
    else if (payment === null || payment < 0) bankPending.add("computed payment for max DTI");
    else {
      bankEvaluated++;
      const dti = income > 0 ? ((monthlyDebt + payment) / income) * 100 : Number.POSITIVE_INFINITY;
      if (dti > bankMaxDti) bankReasons.push(`DTI too high (${dti.toFixed(1)}% > ${bankMaxDti}%)`);
    }
  }

  if (bankReasons.length > 0) {
    return bank.isSample
      ? samplePendingResult(bankPending, bankEvaluated, bankReasons)
      : fail(bankReasons, [...bankPending]);
  }

  if (!Array.isArray(bank.tiers)) {
    return bank.isSample
      ? samplePendingResult(bankPending, bankEvaluated, [
          "Illustrative lender profile has an invalid tiers structure.",
        ])
      : fail(["Bank profile has invalid tiers structure."], [...bankPending]);
  }

  // Book value per THIS lender's declared source (no cross-book fallback):
  // a Retail-book lender's advance caps must never be applied to a trade-book
  // ratio. Shared selector keeps semantics identical to the calculator.
  const lenderBookValue = selectBookValue(vehicle ?? {}, bank.bookValueSource ?? "Trade");

  // Front-end LTV per this lender's book. The calculator's precomputed
  // vehicle.frontEndLtv is trade-book-preferred (retail fallback), so for a
  // lender on a different book we rebase it: net selling price is recovered
  // from the precomputed ratio and the calculator's own book choice, then
  // divided by the lender's book. [front-end-ltv book fix]
  const lenderFrontEndLtv = ((): number | null => {
    const precomputed = finiteNumber(vehicle?.frontEndLtv);
    if (precomputed === null || lenderBookValue === null) return null;
    const calculatorBookValue = selectBookValue(vehicle ?? {});
    if (calculatorBookValue === null) return null;
    return (precomputed * calculatorBookValue) / lenderBookValue;
  })();

  const passing: TierCandidate[] = [];
  const pending: TierCandidate[] = [];

  for (const tier of bank.tiers) {
    if (!tier || typeof tier !== "object") continue;

    const unchecked = new Set(bankPending);
    let evaluated = bankEvaluated;
    let rejected = false;

    const minFico = configuredLimit(tier.minFico);
    const maxFico = configuredLimit(tier.maxFico);
    if (minFico !== null || maxFico !== null) {
      if (creditScore === null) unchecked.add("credit score");
      else {
        if (minFico !== null) {
          evaluated++;
          if (creditScore < minFico) rejected = true;
        }
        if (maxFico !== null) {
          evaluated++;
          if (creditScore > maxFico) rejected = true;
        }
      }
    }

    const tierMinIncome = configuredLimit(tier.minIncome);
    if (tierMinIncome !== null && tierMinIncome > 0) {
      if (income === null) unchecked.add("monthly income");
      else {
        evaluated++;
        if (income < tierMinIncome) rejected = true;
      }
    }

    const minYear = configuredLimit(tier.minYear);
    const maxYear = configuredLimit(tier.maxYear);
    const maxAge = configuredLimit(tier.maxAge);
    if (minYear !== null || maxYear !== null || maxAge !== null) {
      if (modelYear === null) unchecked.add("vehicle model year");
      else {
        if (minYear !== null) {
          evaluated++;
          if (modelYear < minYear) rejected = true;
        }
        if (maxYear !== null) {
          evaluated++;
          if (modelYear > maxYear) rejected = true;
        }
        if (maxAge !== null) {
          evaluated++;
          if (asOfYear - modelYear > maxAge) rejected = true;
        }
      }
    }

    const minMileage = configuredLimit(tier.minMileage);
    const maxMileage = configuredLimit(tier.maxMileage);
    if (minMileage !== null || maxMileage !== null) {
      if (mileage === null) unchecked.add("vehicle mileage");
      else {
        if (minMileage !== null) {
          evaluated++;
          if (mileage < minMileage) rejected = true;
        }
        if (maxMileage !== null) {
          evaluated++;
          if (mileage > maxMileage) rejected = true;
        }
      }
    }

    const tierMinFinanced = configuredLimit(tier.minAmountFinanced);
    const tierMaxFinanced = configuredLimit(tier.maxAmountFinanced);
    if (tierMinFinanced !== null) {
      evaluated++;
      if (amountFinanced < tierMinFinanced) rejected = true;
    }
    if (tierMaxFinanced !== null) {
      evaluated++;
      if (amountFinanced > tierMaxFinanced) rejected = true;
    }

    const minTerm = configuredLimit(tier.minTerm);
    const maxTerm = configuredLimit(tier.maxTerm);
    if (minTerm !== null || maxTerm !== null) {
      if (term === null || term <= 0) unchecked.add("loan term");
      else {
        if (minTerm !== null) {
          evaluated++;
          if (term < minTerm) rejected = true;
        }
        if (maxTerm !== null) {
          evaluated++;
          if (term > maxTerm) rejected = true;
        }
      }
    }

    const excluded = Array.isArray(tier.excludedMakes) ? tier.excludedMakes : [];
    const included = Array.isArray(tier.includedMakes) ? tier.includedMakes : [];
    if (excluded.length > 0 || included.length > 0) {
      if (!make) unchecked.add("vehicle make");
      else {
        if (excluded.length > 0) {
          evaluated++;
          if (excluded.some((item) => String(item).trim().toLowerCase() === make)) rejected = true;
        }
        if (included.length > 0) {
          evaluated++;
          if (!included.some((item) => String(item).trim().toLowerCase() === make)) rejected = true;
        }
      }
    }

    const tierMaxPti = configuredLimit(tier.maxPti);
    if (tierMaxPti !== null) {
      if (income === null) unchecked.add("monthly income for tier max PTI");
      else if (payment === null || payment < 0) unchecked.add("computed payment for tier max PTI");
      else {
        evaluated++;
        const pti = income > 0 ? (payment / income) * 100 : Number.POSITIVE_INFINITY;
        if (pti > tierMaxPti) rejected = true;
      }
    }

    const maxRate = configuredLimit(tier.maxRate);
    if (maxRate !== null) {
      if (quotedRate === null) unchecked.add("quoted APR");
      else {
        evaluated++;
        if (quotedRate > maxRate) rejected = true;
      }
    }

    const tierMaxBackend = configuredLimit(tier.maxBackend);
    if (tierMaxBackend !== null) {
      if (backendAmount === null) unchecked.add("backend amount");
      else {
        evaluated++;
        if (backendAmount > tierMaxBackend) rejected = true;
      }
    }
    const maxBackendPercent = configuredLimit(tier.maxBackendPercent);
    if (maxBackendPercent !== null) {
      if (backendAmount === null) unchecked.add("backend amount for max backend percent");
      else {
        evaluated++;
        if ((backendAmount / amountFinanced) * 100 > maxBackendPercent) rejected = true;
      }
    }

    const maxLtv = configuredLimit(tier.maxLtv);
    const maxOtdLtv = configuredLimit(tier.otdLtv);
    const minLtv = configuredLimit(tier.minLtv);
    let computedLtv: number | null = null;
    if (maxLtv !== null || maxOtdLtv !== null || minLtv !== null) {
      if (lenderBookValue === null) unchecked.add("book value for LTV");
      else computedLtv = (amountFinanced / lenderBookValue) * 100;
    }
    if (computedLtv !== null) {
      if (maxLtv !== null) {
        evaluated++;
        if (computedLtv > maxLtv) rejected = true;
      }
      if (maxOtdLtv !== null) {
        evaluated++;
        if (computedLtv > maxOtdLtv) rejected = true;
      }
      if (minLtv !== null) {
        evaluated++;
        if (computedLtv < minLtv) rejected = true;
      }
    }

    const maxFrontEndLtv = configuredLimit(tier.frontEndLtv);
    if (maxFrontEndLtv !== null) {
      if (lenderFrontEndLtv === null) unchecked.add("front-end LTV");
      else {
        evaluated++;
        if (lenderFrontEndLtv > maxFrontEndLtv) rejected = true;
      }
    }

    if (tier.vehicleType && tier.vehicleType !== "all") {
      if (tier.vehicleType === "certified") unchecked.add("certified vehicle status");
      else if (!deal.vehicleCondition) unchecked.add("vehicle condition");
      else {
        evaluated++;
        if (deal.vehicleCondition !== tier.vehicleType) rejected = true;
      }
    }

    const tierMaxDti = configuredLimit(tier.maxDti);
    if (tierMaxDti !== null) {
      if (income === null) unchecked.add("monthly income for tier max DTI");
      else if (monthlyDebt === null) unchecked.add("monthly debt for tier max DTI");
      else if (payment === null || payment < 0) unchecked.add("computed payment for tier max DTI");
      else {
        evaluated++;
        const dti =
          income > 0 ? ((monthlyDebt + payment) / income) * 100 : Number.POSITIVE_INFINITY;
        if (dti > tierMaxDti) rejected = true;
      }
    }

    if (configuredLimit(tier.maxAdvance) !== null) {
      unchecked.add("max advance (verify lender-specific calculation)");
    }

    if (rejected) continue;
    const candidate: TierCandidate = {
      tier,
      unchecked: [...unchecked].sort(compareText),
      effectiveRate: effectiveTierRate(tier),
      evaluatedConstraints: evaluated,
    };
    if (candidate.unchecked.length > 0) pending.push(candidate);
    else passing.push(candidate);
  }

  if (passing.length > 0) {
    const best = passing.sort(compareCandidates)[0]!;
    return {
      eligible: true,
      status: "eligible",
      reasons: [],
      matchedTier: best.tier,
      uncheckedConstraints: [],
      effectiveRate: best.effectiveRate,
      evaluatedConstraints: best.evaluatedConstraints,
    };
  }

  if (pending.length > 0) return pendingResult(pending.sort(compareCandidates)[0]!);

  return bank.isSample
    ? samplePendingResult(bankPending, bankEvaluated, [
        "Illustrative criteria do not currently match this deal structure and vehicle.",
      ])
    : fail(["No fitting lending tier found for this deal structure and vehicle."]);
};
