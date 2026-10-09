import type { CalculatedVehicle, DealData, Settings, Vehicle } from "../types";
import { calculateFinancials, roundCents } from "./calculator";
import { validateInput } from "./validator";

export type PaymentTargetResult =
  | { status: "inputs-needed"; reason: string }
  | { status: "within-budget"; current: CalculatedVehicle }
  | {
      status: "proposal";
      current: CalculatedVehicle;
      proposed: CalculatedVehicle;
      additionalCash: number;
      totalCash: number;
      monthlySavings: number;
      interestSavings: number;
    };

const money = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10_000_000;

/**
 * Minimum additional cash, in whole cents, that puts the engine's rounded
 * payment at or below the customer's ceiling. Price, rate, term, products,
 * trade, incentives and tax settings stay fixed. This is a cash proposal,
 * not a lender decision. Binary search uses the actual engine at every step;
 * an inverse amortization estimate alone misses rounded-payment boundaries.
 */
export function cashToPaymentTarget(
  vehicle: Vehicle,
  deal: DealData,
  settings: Settings,
  ceiling: number | null | undefined
): PaymentTargetResult {
  const needed = (reason: string): PaymentTargetResult => ({ status: "inputs-needed", reason });
  if (!money(ceiling) || ceiling <= 0) return needed("Enter a positive payment ceiling.");
  if (!money(vehicle.price) || vehicle.price <= 0) return needed("Confirm the vehicle price.");
  if (
    typeof deal.interestRate !== "number" ||
    validateInput("interestRate", deal.interestRate) ||
    typeof deal.loanTerm !== "number" ||
    validateInput("loanTerm", deal.loanTerm)
  )
    return needed("Enter an interest rate from 0–50% and a whole term from 1–120 months.");
  if (
    !money(deal.downPayment) ||
    Math.abs(deal.downPayment * 100 - Math.round(deal.downPayment * 100)) > 0.000001
  )
    return needed("Enter cash down in whole cents.");
  const requiredAmounts = [
    deal.tradeInValue,
    deal.tradeInPayoff,
    deal.backendProducts,
    deal.stateFees,
    settings.docFee,
    settings.cvrFee,
    settings.outOfStateTransitFee,
  ];
  const optionalAmounts = [
    deal.vscAmount,
    deal.gapAmount,
    deal.rebate,
    deal.manufacturerRebate,
    deal.dealerDiscount,
    deal.dealerRebate,
    deal.transactionFees,
    deal.transactionFee,
  ];
  if (
    requiredAmounts.some((n) => !money(n)) ||
    optionalAmounts.some((n) => n !== undefined && !money(n)) ||
    (settings.customTaxRate !== null &&
      (!money(settings.customTaxRate) || settings.customTaxRate > 100))
  )
    return needed("Confirm trade, products, incentives, fees and tax inputs.");

  try {
    const current = calculateFinancials(vehicle, deal, settings);
    if (!money(current.amountToFinance) || !money(current.monthlyPayment))
      return needed("Confirm the financed amount and estimated payment.");
    if (current.monthlyPayment <= ceiling) return { status: "within-budget", current };

    const originalCashCents = Math.round(deal.downPayment * 100);
    const reprice = (extraCents: number) =>
      calculateFinancials(
        vehicle,
        { ...deal, downPayment: (originalCashCents + extraCents) / 100 },
        settings
      );
    let low = 0;
    // Paying off the current principal is a guaranteed upper bound; never
    // search negative financed amounts or unlimited cash inputs.
    let high = Math.round(current.amountToFinance * 100);
    if (!Number.isSafeInteger(high) || originalCashCents + high > 1_000_000_000)
      return needed("The cash proposal exceeds the supported amount.");
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      const payment = reprice(mid).monthlyPayment;
      if (!money(payment)) return needed("A valid payment could not be calculated.");
      if (payment <= ceiling) high = mid;
      else low = mid + 1;
    }
    const proposed = reprice(low);
    if (!money(proposed.monthlyPayment) || !money(proposed.amountToFinance))
      return needed("A valid payment could not be calculated.");
    const currentInterest = current.monthlyPayment * deal.loanTerm - current.amountToFinance;
    const proposedInterest = proposed.monthlyPayment * deal.loanTerm - proposed.amountToFinance;
    return {
      status: "proposal",
      current,
      proposed,
      additionalCash: low / 100,
      totalCash: (originalCashCents + low) / 100,
      monthlySavings: roundCents(current.monthlyPayment - proposed.monthlyPayment),
      // At 0% a rounded monthly amount can leave a final-installment
      // remainder. That rounding remainder is never interest.
      interestSavings:
        deal.interestRate === 0 ? 0 : roundCents(Math.max(0, currentInterest - proposedInterest)),
    };
  } catch {
    return needed("Confirm the supported buyer state and tax settings.");
  }
}
