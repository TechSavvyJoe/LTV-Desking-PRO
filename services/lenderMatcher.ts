import type { CalculatedVehicle, LenderProfile, DealData, FilterData, LenderTier } from "../types";

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

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  matchedTier: LenderTier | null;
  /**
   * Constraints that exist on the lender/tier but could NOT be evaluated
   * (missing deal data or unsupported semantics). Surfaced in the UI so a
   * green check never silently overstates what was verified. [G20/G77]
   */
  uncheckedConstraints: string[];
}

const fail = (reasons: string[], unchecked: string[] = []): EligibilityResult => ({
  eligible: false,
  reasons,
  matchedTier: null,
  uncheckedConstraints: unchecked,
});

export const checkBankEligibility = (
  vehicle: CalculatedVehicle,
  deal: DealData & FilterData,
  bank: LenderProfile
): EligibilityResult => {
  // Extreme defensive programming to prevent crashes
  if (!bank || typeof bank !== "object") {
    return fail(["Invalid bank profile data."]);
  }

  if (!deal || typeof deal !== "object") {
    return fail(["Invalid deal data."]);
  }

  const { creditScore, monthlyIncome } = deal;

  // Defensive destructuring with defaults
  const {
    amountToFinance = 0,
    jdPower = 0,
    jdPowerRetail = 0,
    modelYear = 0,
    mileage = 0,
    monthlyPayment = 0,
  } = vehicle || {};

  // Sentinel guard: amountToFinance can be "N/A"/"Error" (no price, bad calc).
  // Previously Number() => NaN slid through every bounds check and could show
  // a bank as ELIGIBLE — fail closed with an explicit reason instead. [C-NaN]
  const amt = Number(amountToFinance);
  if (!Number.isFinite(amt)) {
    return fail([
      "Cannot evaluate — financed amount unavailable (vehicle is missing a price or the deal can't be calculated).",
    ]);
  }

  // Quoted APR may legitimately be unset ("" at runtime) — rate-cap checks are
  // then reported as unchecked rather than guessed. [G20]
  const rawRate = deal.interestRate;
  const quotedRate = typeof rawRate === "number" && Number.isFinite(rawRate) ? rawRate : null;
  const backendAmount = Number(deal.backendProducts) || 0;

  const reasons: string[] = [];
  const unchecked = new Set<string>();

  // General bank-level checks
  if (bank.minIncome !== undefined && bank.minIncome > 0) {
    const income = Number(monthlyIncome) || 0;
    if (income < bank.minIncome) {
      reasons.push(
        `Income too low (${formatCurrencySimple(income)} < ${formatCurrencySimple(bank.minIncome)})`
      );
    }
  }

  const income = Number(monthlyIncome) || 0;
  const payment = Number(monthlyPayment);
  const canCheckPti = income > 0 && Number.isFinite(payment) && payment > 0;
  if (bank.maxPti !== undefined && bank.maxPti > 0) {
    if (canCheckPti) {
      const pti = (payment / income) * 100;
      if (pti > bank.maxPti) {
        reasons.push(`PTI too high (${pti.toFixed(1)}% > ${bank.maxPti}%)`);
      }
    } else {
      unchecked.add("max PTI (needs income + a computed payment)");
    }
  }

  // If general checks fail, we can stop here.
  if (reasons.length > 0) {
    return fail(reasons, [...unchecked]);
  }

  // Find a matching tier
  const tiers = bank.tiers;
  // Defensive check: Ensure tiers is an array before iterating
  if (!tiers || !Array.isArray(tiers)) {
    return fail(["Bank profile has invalid tiers structure."], [...unchecked]);
  }

  for (const tier of tiers) {
    if (!tier || typeof tier !== "object") continue;

    // FICO Score Check
    if (
      tier.minFico !== undefined &&
      (creditScore === null || creditScore === undefined || creditScore < tier.minFico)
    )
      continue;
    if (
      tier.maxFico !== undefined &&
      creditScore !== null &&
      creditScore !== undefined &&
      creditScore > tier.maxFico
    )
      continue;

    // Tier-level minIncome (if specified) — enforce more tier fields. [robustness]
    if (tier.minIncome !== undefined && tier.minIncome > 0) {
      const income = Number(monthlyIncome) || 0;
      if (income < tier.minIncome) continue;
    }

    // Vehicle Year Check
    const year = Number(modelYear);
    if (tier.minYear !== undefined && (isNaN(year) || year < tier.minYear)) continue;
    if (tier.maxYear !== undefined && (isNaN(year) || year > tier.maxYear)) continue;

    // Vehicle Mileage Check
    const miles = Number(mileage);
    if (tier.minMileage !== undefined && (isNaN(miles) || miles < tier.minMileage)) continue;
    if (tier.maxMileage !== undefined && (isNaN(miles) || miles > tier.maxMileage)) continue;

    // Amount Financed Check
    if (tier.minAmountFinanced !== undefined && amt < tier.minAmountFinanced) continue;
    if (tier.maxAmountFinanced !== undefined && amt > tier.maxAmountFinanced) continue;

    // Loan Term Check (coerce like other numeric fields; bad term skips tier)
    const term = Number(deal.loanTerm);
    if (tier.minTerm !== undefined && (isNaN(term) || term < tier.minTerm)) continue;
    if (tier.maxTerm !== undefined && (isNaN(term) || term > tier.maxTerm)) continue;

    // Make exclusions / inclusions — previously extracted from rate sheets but
    // silently ignored by matching. [G20]
    const make = (vehicle?.make || "").trim().toLowerCase();
    const excluded = Array.isArray(tier.excludedMakes) ? tier.excludedMakes : [];
    const included = Array.isArray(tier.includedMakes) ? tier.includedMakes : [];
    if (excluded.length > 0) {
      if (make) {
        if (excluded.some((m) => String(m).trim().toLowerCase() === make)) continue;
      } else {
        unchecked.add("excluded makes (vehicle make unknown)");
      }
    }
    if (included.length > 0) {
      if (make) {
        if (!included.some((m) => String(m).trim().toLowerCase() === make)) continue;
      } else {
        unchecked.add("included makes (vehicle make unknown)");
      }
    }

    // Tier-level PTI — same semantics as the bank-level check. [G20]
    if (tier.maxPti !== undefined && tier.maxPti > 0) {
      if (canCheckPti) {
        const pti = (payment / income) * 100;
        if (pti > tier.maxPti) continue;
      } else {
        unchecked.add("tier max PTI (needs income + a computed payment)");
      }
    }

    // Max buy/contract rate vs the quoted APR. [G20]
    if (tier.maxRate !== undefined && tier.maxRate > 0) {
      if (quotedRate !== null) {
        if (quotedRate > tier.maxRate) continue;
      } else {
        unchecked.add("max APR (no rate entered on the deal)");
      }
    }

    // Backend caps vs the deal's backend dollars. maxBackendPercent is
    // evaluated against book value when one exists. [G20]
    if (tier.maxBackend !== undefined && tier.maxBackend > 0 && backendAmount > tier.maxBackend)
      continue;
    if (tier.maxBackendPercent !== undefined && tier.maxBackendPercent > 0 && backendAmount > 0) {
      const bookForBackend =
        typeof jdPower === "number" && jdPower > 0
          ? jdPower
          : typeof jdPowerRetail === "number" && jdPowerRetail > 0
            ? jdPowerRetail
            : null;
      if (bookForBackend !== null) {
        if ((backendAmount / bookForBackend) * 100 > tier.maxBackendPercent) continue;
      } else {
        unchecked.add("max backend % (no book value)");
      }
    }

    // LTV (Loan-to-Value) Check — enforce BOTH `maxLtv` (generic cap) and
    // `otdLtv` (explicit out-the-door cap). AI-extracted tiers often carry
    // only `otdLtv`; ignoring it overstated eligibility and made the Lenders
    // screen's otdLtv editor a no-op. [review/P2]
    const ltvCaps = [tier.maxLtv, tier.otdLtv].filter(
      (n): n is number => typeof n === "number" && n > 0
    );
    if (ltvCaps.length > 0) {
      const bookValueSource = bank.bookValueSource || "Trade";
      const bookValue =
        bookValueSource === "Retail" && typeof jdPowerRetail === "number" && jdPowerRetail > 0
          ? jdPowerRetail
          : typeof jdPower === "number" && jdPower > 0
            ? jdPower
            : null;

      if (bookValue === null) continue; // Cannot check LTV without a book value
      if (amt <= 0) continue;

      const otdLtv = (amt / bookValue) * 100;
      if (otdLtv > Math.min(...ltvCaps)) continue;
    }

    // Front-end LTV cap, using the calculator's front-end figure. [G20]
    if (tier.frontEndLtv !== undefined && tier.frontEndLtv > 0) {
      const fe = Number(vehicle?.frontEndLtv);
      if (Number.isFinite(fe)) {
        if (fe > tier.frontEndLtv) continue;
      } else {
        unchecked.add("front-end LTV cap (not computable)");
      }
    }

    // Constraints extracted from rate sheets whose lender-specific semantics we
    // don't model yet — say so instead of pretending they passed. [G20]
    if (tier.maxAdvance !== undefined && tier.maxAdvance > 0) {
      unchecked.add("max advance (semantics vary by lender — verify on the rate sheet)");
    }
    if (tier.vehicleType) {
      unchecked.add(`vehicle type "${tier.vehicleType}" (no body-type data on inventory)`);
    }
    if (tier.maxDti !== undefined && tier.maxDti > 0) {
      unchecked.add("max DTI (customer debts not collected)");
    }

    // Unmodeled tier fields: add unchecked notes so eligibility never silently
    // claims more than was actually verified. [G20 from deep review]
    if (tier.minLtv !== undefined && tier.minLtv > 0) {
      unchecked.add("min LTV (LTV floor constraint not evaluated by matcher)");
    }
    if (tier.maxAge !== undefined && tier.maxAge > 0) {
      unchecked.add("max age (maxAge not modeled — year/minYear used where possible)");
    }

    // If all evaluable checks pass, this tier is a preliminary fit.
    return { eligible: true, reasons: [], matchedTier: tier, uncheckedConstraints: [...unchecked] };
  }

  // If the loop completes without finding a matching tier.
  reasons.push("No fitting lending tier found for this deal structure and vehicle.");
  return fail(reasons, [...unchecked]);
};
