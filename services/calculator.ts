import type {
  AppState,
  Vehicle,
  DealData,
  CalculatedVehicle,
  Settings,
  VehicleCondition,
} from "../types";
import { getMiTradeInCreditCap, TAX_RATES } from "../constants";
import { getBackendProductSplit } from "./backendProducts";
import { selectBookValue } from "./bookValue";

/**
 * Round a monetary value to whole cents. All currency leaving the calculator is
 * rounded at the boundary so the financed amount and the displayed figures agree
 * with what a lender will actually amortize (no sub-cent float drift). [B7]
 *
 * ROUNDING POLICY: round-half-up on the magnitude (half AWAY from zero), not
 * banker's rounding — $0.125 → $0.13 and -$0.125 → -$0.13. The Math.sign/abs
 * form keeps negative amounts symmetric with positive ones (a bare Math.round
 * would round -0.125 to -0.12 but 0.125 to 0.13).
 */
export const roundCents = (value: number): number =>
  (Math.sign(value) * Math.round(Math.abs(value) * 100)) / 100;

/**
 * Coerce a possibly-blank numeric deal field to a number, treating empty string /
 * null / undefined / NaN as 0. Safe for fields where "unset" legitimately means 0
 * (down payment, fees, trade). NOT used for APR — see resolveRate. [B6]
 */
const toNumber = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const nonNegative = (value: unknown): number => Math.max(0, toNumber(value));

export interface RebateBreakdown {
  manufacturerRebate: number;
  dealerDiscount: number;
}

/**
 * Resolve the additive rebate fields without double-counting the legacy
 * `rebate` value. Explicit split fields win; otherwise legacy records retain
 * their historical taxable manufacturer-rebate treatment unless rebateType
 * explicitly identifies a dealer discount.
 */
export const getRebateBreakdown = (dealData: Partial<DealData>): RebateBreakdown => {
  const hasManufacturer =
    typeof dealData.manufacturerRebate === "number" && Number.isFinite(dealData.manufacturerRebate);
  const hasDealerDiscount =
    (typeof dealData.dealerDiscount === "number" && Number.isFinite(dealData.dealerDiscount)) ||
    (typeof dealData.dealerRebate === "number" && Number.isFinite(dealData.dealerRebate));

  if (hasManufacturer || hasDealerDiscount) {
    return {
      manufacturerRebate: hasManufacturer ? nonNegative(dealData.manufacturerRebate) : 0,
      dealerDiscount: hasDealerDiscount
        ? nonNegative(dealData.dealerDiscount ?? dealData.dealerRebate)
        : 0,
    };
  }

  const legacyRebate = nonNegative(dealData.rebate);
  return dealData.rebateType === "dealer"
    ? { manufacturerRebate: 0, dealerDiscount: legacyRebate }
    : { manufacturerRebate: legacyRebate, dealerDiscount: 0 };
};

export const getTransactionFees = (dealData: Partial<DealData>): number =>
  nonNegative(dealData.transactionFees ?? dealData.transactionFee);

export const calculateMonthlyPayment = (
  principal: number,
  annualRate: number,
  termMonths: number
): number | "Error" => {
  if (!Number.isFinite(principal) || !Number.isFinite(annualRate) || !Number.isFinite(termMonths)) {
    return "Error";
  }
  if (termMonths <= 0) return "Error"; // Term cannot be zero or negative
  if (principal <= 0) return 0; // No loan, no payment
  if (annualRate < 0) return "Error"; // Rate cannot be negative

  if (annualRate === 0) return roundCents(principal / termMonths);

  const monthlyRate = annualRate / 100 / 12;
  const payment =
    (principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths))) /
    (Math.pow(1 + monthlyRate, termMonths) - 1);

  if (!isFinite(payment) || isNaN(payment)) return "Error";
  return roundCents(payment);
};

export const calculateLoanAmount = (
  monthlyPayment: number,
  annualRate: number,
  termMonths: number
): number | "Error" => {
  // Match calculateMonthlyPayment's contract: invalid term / negative rate is an
  // "Error", not a silent 0 that a caller would mistake for a valid principal. [B8]
  if (
    !Number.isFinite(monthlyPayment) ||
    !Number.isFinite(annualRate) ||
    !Number.isFinite(termMonths)
  ) {
    return "Error";
  }
  if (termMonths <= 0) return "Error";
  if (annualRate < 0) return "Error";
  if (monthlyPayment <= 0) return 0; // No payment, no principal
  if (annualRate === 0) return roundCents(monthlyPayment * termMonths);

  const monthlyRate = annualRate / 100 / 12;
  const principal = monthlyPayment * ((1 - Math.pow(1 + monthlyRate, -termMonths)) / monthlyRate);

  if (isNaN(principal) || !isFinite(principal)) return "Error";

  return roundCents(principal);
};

/**
 * SCOPE OF THE TAX ENGINE [G16]
 *
 * This engine models a Michigan DEALER selling to MI/OH/IN/IL/FL BUYERS. For an
 * out-of-state buyer, Michigan reciprocity applies: the dealer collects
 * the buyer's home-state rate capped at the MI statutory rate. Out-of-state
 * DEALERSHIPS are NOT modeled — the state here is the BUYER's state for a
 * Michigan dealership, not the dealership's own state.
 *
 * Notes on taxable base:
 * - docFee + cvrFee are included in taxableAmount (taxed).
 * - stateFees (registration/title etc.) are added to OTD but EXCLUDED from tax base.
 *   (Explicitly not part of taxableAmount = max(0, price - credit) + doc + cvr.)
 * - manufacturer rebates remain taxable and are deducted from amount financed.
 * - dealer discounts reduce selling price before tax.
 * - transaction fees are dealer charges and are included in the taxable base.
 */
const OUT_OF_STATE_TRADE_CREDIT: Record<Exclude<AppState, "MI">, readonly VehicleCondition[]> = {
  OH: ["new"],
  IN: ["new", "used"],
  IL: ["new", "used"],
  FL: ["new", "used"],
};

const outOfStateTradeCredit = (
  state: Exclude<AppState, "MI">,
  tradeInValue: number,
  buyerStateWasExplicit: boolean,
  vehicleCondition?: VehicleCondition
): number => {
  if (!buyerStateWasExplicit || !vehicleCondition) return 0;
  const supportedConditions = OUT_OF_STATE_TRADE_CREDIT[state];
  return supportedConditions.includes(vehicleCondition) ? tradeInValue : 0;
};

const calculateSalesTax = (
  discountedPrice: number,
  tradeInValue: number,
  transactionFees: number,
  settings: Settings,
  buyerState?: DealData["buyerState"],
  vehicleCondition?: VehicleCondition
): { tax: number; extraFees: number } => {
  const { docFee, cvrFee, defaultState, outOfStateTransitFee, customTaxRate } = settings;

  const michiganTaxRate = TAX_RATES.MI;
  if (michiganTaxRate === undefined) {
    throw new Error("Michigan tax rate must be configured for reciprocal tax calculations.");
  }

  // Per-deal buyer state overrides the settings-level default; undefined
  // preserves the prior settings-only behavior. [G18]
  const taxState = buyerState ?? defaultState;

  // Fail loudly instead of silently taxing an unknown state at 6%. AppState is
  // limited to MI/OH/IN/IL/FL so this should be unreachable — if it fires, data
  // outside the modeled domain reached the tax engine. [G16]
  const stateRate = TAX_RATES[taxState];
  if (stateRate === undefined) {
    throw new Error(`Unsupported tax state: ${String(taxState)}`);
  }

  let extraFees = 0;

  // The out-of-state transit fee is a real out-of-state cost and must apply
  // regardless of whether a custom tax rate is in play. Previously it was only
  // added inside the default-rate branch, so a custom-rate out-of-state deal
  // silently dropped it and understated OTD. [B5]
  if (taxState !== "MI") {
    extraFees += toNumber(outOfStateTransitFee);
  }

  // Michigan caps the sales-tax trade-in credit by statute, with a scheduled
  // annual step-up (see getMiTradeInCreditCap in constants.ts). [G17]
  // A dealer-configured settings value still wins; stale stored settings may
  // predate this field, in which case the statutory cap for the current
  // calendar year applies rather than silently zeroing the trade credit.
  const miTradeInCreditCap = Number.isFinite(settings.miTradeInCreditCap)
    ? settings.miTradeInCreditCap
    : getMiTradeInCreditCap();
  const miTradeCredit = Math.min(nonNegative(tradeInValue), Math.max(0, miTradeInCreditCap));
  const taxableFees = nonNegative(docFee) + nonNegative(cvrFee) + transactionFees;
  const taxFor = (rate: number, tradeCredit: number): number =>
    roundCents((Math.max(0, discountedPrice - tradeCredit) + taxableFees) * rate);

  let tax: number;
  if (typeof customTaxRate === "number" && Number.isFinite(customTaxRate) && customTaxRate >= 0) {
    const customTradeCredit =
      taxState === "MI"
        ? miTradeCredit
        : outOfStateTradeCredit(
            taxState,
            nonNegative(tradeInValue),
            buyerState === taxState,
            vehicleCondition
          );
    tax = taxFor(customTaxRate / 100, customTradeCredit);
  } else if (taxState === "MI") {
    tax = taxFor(michiganTaxRate, miTradeCredit);
  } else {
    // Michigan Form 485 requires both computations and collection of the lesser:
    // home-state law/rate versus Michigan law/rate. The home-state allowance is
    // only used when this deal explicitly identifies a supported buyer state and,
    // for Ohio, the purchased vehicle condition.
    const homeTradeCredit = outOfStateTradeCredit(
      taxState,
      nonNegative(tradeInValue),
      buyerState === taxState,
      vehicleCondition
    );
    tax = Math.min(taxFor(stateRate, homeTradeCredit), taxFor(michiganTaxRate, miTradeCredit));
  }

  return { tax, extraFees: roundCents(extraFees) };
};

export const calculateFinancials = (
  vehicle: Vehicle,
  dealData: DealData,
  settings: Settings
): CalculatedVehicle => {
  // Defensive defaults — empty/blank fields collapse to 0, which is the correct
  // intent for down payment, fees, and trade values.
  const downPayment = toNumber(dealData.downPayment);
  const backendProducts = getBackendProductSplit(dealData).total;
  // Term gets the same "unset means no quote" semantics as APR (below): a
  // blank / zero / negative / NaN term yields an "N/A" payment rather than a
  // fabricated 1-month quote. Valid terms are floored to whole months (terms
  // are whole months per contract). [term-unset]
  const rawTerm: unknown = dealData.loanTerm;
  const termIsBlank =
    rawTerm === "" ||
    rawTerm === null ||
    rawTerm === undefined ||
    (typeof rawTerm === "number" && !Number.isFinite(rawTerm));
  const flooredTerm = termIsBlank ? 0 : Math.floor(toNumber(rawTerm));
  const loanTerm: number | null = flooredTerm >= 1 ? flooredTerm : null;
  const tradeInValue = toNumber(dealData.tradeInValue);
  const tradeInPayoff = toNumber(dealData.tradeInPayoff);
  const stateFees = toNumber(dealData.stateFees);
  const { manufacturerRebate, dealerDiscount } = getRebateBreakdown(dealData);
  const transactionFees = getTransactionFees(dealData);

  // APR is special: a cleared field arrives as "" at runtime (see DealControls
  // handleDealChange). Treat blank/NaN as "unset" (no payment quoted) so we never
  // present an interest-free payment by accident, while still honoring a real 0%
  // promotional rate entered explicitly. [B6]
  const rawRate: unknown = dealData.interestRate;
  const rateIsBlank =
    rawRate === "" ||
    rawRate === null ||
    rawRate === undefined ||
    (typeof rawRate === "number" && !Number.isFinite(rawRate));
  const interestRate: number | null = rateIsBlank ? null : toNumber(rawRate);

  const price = Math.max(0, typeof vehicle.price === "number" ? vehicle.price : 0);
  const jdPower = typeof vehicle.jdPower === "number" ? vehicle.jdPower : 0;
  const jdPowerRetail = typeof vehicle.jdPowerRetail === "number" ? vehicle.jdPowerRetail : 0;
  const unitCost = typeof vehicle.unitCost === "number" ? vehicle.unitCost : 0;

  const docFee = nonNegative(settings.docFee);
  const cvrFee = nonNegative(settings.cvrFee);

  let baseOutTheDoorPrice: number | "Error" | "N/A" = "N/A";
  let salesTax: number | "Error" | "N/A" = "N/A";
  let frontEndLtv: number | "Error" | "N/A" = "N/A";
  let frontEndGross: number | "Error" | "N/A" = "N/A";
  let amountToFinance: number | "Error" | "N/A" = "N/A";
  let otdLtv: number | "Error" | "N/A" = "N/A";
  let monthlyPayment: number | "Error" | "N/A" = "N/A";

  // Only calculate if we have a valid (positive) price. Negative prices are now rejected
  // upstream in parser and schema; treat here as missing for safety. [negative prices]
  // price var is clamped >=0 above.
  if (price > 0) {
    const netTradeIn = tradeInValue - tradeInPayoff;
    const discountedPrice = Math.max(0, price - dealerDiscount);

    const { tax, extraFees } = calculateSalesTax(
      discountedPrice,
      tradeInValue,
      transactionFees,
      settings,
      dealData.buyerState,
      dealData.vehicleCondition
    );
    salesTax = tax;

    // Round OTD and amount-to-finance to cents so the payment is amortized off the
    // same figure the customer sees, and the financed amount reconciles. [B7]
    baseOutTheDoorPrice = roundCents(
      discountedPrice + docFee + cvrFee + transactionFees + stateFees + salesTax + extraFees
    );

    if (typeof vehicle.unitCost === "number") {
      frontEndGross = roundCents(discountedPrice - unitCost);
    }

    // Manufacturer rebate reduces principal after tax. Dealer discount is already
    // reflected in discountedPrice/baseOutTheDoorPrice and is not subtracted twice.
    amountToFinance = roundCents(
      baseOutTheDoorPrice + backendProducts - downPayment - netTradeIn - manufacturerRebate
    );

    // An unset APR or an unset/invalid term yields no payment rather than a
    // spurious interest-free or 1-month figure. [B6][term-unset]
    monthlyPayment =
      interestRate === null || loanTerm === null
        ? "N/A"
        : calculateMonthlyPayment(amountToFinance, interestRate, loanTerm);

    // LTV Logic: Prefer Trade Book, fallback to Retail Book — via the shared
    // book-value selector so the lender rules engine uses identical semantics.
    const bookValue = selectBookValue({ jdPower, jdPowerRetail }) ?? 0;

    if (bookValue > 0) {
      // Front-end LTV = net selling price / book - the deal-independent unit advance
      // metric per the dc design contract (resolves flagged F&I decision #2).
      // Cash down / trade / taxes / fees do not move it; otdLtv carries the
      // deal-structure view. [reconciliation 5]
      frontEndLtv = (discountedPrice / bookValue) * 100;
      otdLtv = amountToFinance >= 0 ? (amountToFinance / bookValue) * 100 : 0;
    } else {
      frontEndLtv = "Error";
      otdLtv = "Error";
    }
  } else {
    // Return defaults if price is missing
    baseOutTheDoorPrice = "N/A";
    salesTax = "N/A";
    frontEndGross = "N/A";
    amountToFinance = "N/A";
    monthlyPayment = "N/A";
    frontEndLtv = "N/A";
    otdLtv = "N/A";
  }

  return {
    ...vehicle,
    baseOutTheDoorPrice,
    salesTax,
    frontEndLtv,
    frontEndGross,
    amountToFinance,
    otdLtv,
    monthlyPayment,
  };
};
