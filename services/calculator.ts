import type { Vehicle, DealData, CalculatedVehicle, Settings } from "../types";

/**
 * Round a monetary value to whole cents. All currency leaving the calculator is
 * rounded at the boundary so the financed amount and the displayed figures agree
 * with what a lender will actually amortize (no sub-cent float drift). [B7]
 */
const roundCents = (value: number): number => Math.round(value * 100) / 100;

/**
 * Coerce a possibly-blank numeric deal field to a number, treating empty string /
 * null / undefined / NaN as 0. Safe for fields where "unset" legitimately means 0
 * (down payment, fees, trade). NOT used for APR — see resolveRate. [B6]
 */
const toNumber = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const calculateMonthlyPayment = (
  principal: number,
  annualRate: number,
  termMonths: number
): number | "Error" => {
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
 */
const calculateSalesTax = (
  price: number,
  tradeInValue: number,
  settings: Settings,
  buyerState?: DealData["buyerState"]
): { tax: number; extraFees: number } => {
  const { docFee, cvrFee, defaultState, outOfStateTransitFee, customTaxRate } = settings;

  const TAX_RATES: Record<string, number> = {
    MI: 0.06,
    OH: 0.0575,
    IN: 0.07,
    IL: 0.0625,
    FL: 0.06,
  };
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

  let taxRate: number;
  let extraFees = 0;

  if (typeof customTaxRate === "number" && customTaxRate >= 0) {
    // Use custom rate (stored as percentage, e.g. 6.0 for 6%)
    taxRate = customTaxRate / 100;
  } else {
    // Default logic
    taxRate = stateRate;

    if (taxState !== "MI") {
      // Michigan reciprocity caps out-of-state tax at the Michigan statutory rate.
      // NOTE (flagged for F&I review): this caps the *collected* rate at MI's 6%.
      // For a buyer whose home state rate is higher than 6%, the remaining
      // differential is collected by the buyer's home state at registration — it
      // is intentionally not added here.
      taxRate = Math.min(michiganTaxRate, taxRate);
    }
  }

  // The out-of-state transit fee is a real out-of-state cost and must apply
  // regardless of whether a custom tax rate is in play. Previously it was only
  // added inside the default-rate branch, so a custom-rate out-of-state deal
  // silently dropped it and understated OTD. [B5]
  if (taxState !== "MI") {
    extraFees += toNumber(outOfStateTransitFee);
  }

  // Michigan caps the sales-tax trade-in credit by statute. [G17]
  // Stale stored settings may predate this field; fall back to the shipped
  // default rather than silently zeroing the trade credit.
  // TODO(owner): verify current MI statutory trade-in credit cap before pilot.
  const miTradeInCreditCap = Number.isFinite(settings.miTradeInCreditCap)
    ? settings.miTradeInCreditCap
    : 12000;
  const taxableTradeCredit =
    taxState === "MI" ? Math.min(tradeInValue, miTradeInCreditCap) : tradeInValue;

  const taxableAmount = Math.max(0, price - taxableTradeCredit) + docFee + cvrFee;
  const tax = roundCents(taxableAmount * taxRate); // [B7]

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
  const backendProducts = toNumber(dealData.backendProducts);
  const loanTerm = toNumber(dealData.loanTerm);
  const tradeInValue = toNumber(dealData.tradeInValue);
  const tradeInPayoff = toNumber(dealData.tradeInPayoff);
  const stateFees = toNumber(dealData.stateFees);
  const rebate = toNumber(dealData.rebate);

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

  const price = typeof vehicle.price === "number" ? vehicle.price : 0;
  const jdPower = typeof vehicle.jdPower === "number" ? vehicle.jdPower : 0;
  const jdPowerRetail = typeof vehicle.jdPowerRetail === "number" ? vehicle.jdPowerRetail : 0;
  const unitCost = typeof vehicle.unitCost === "number" ? vehicle.unitCost : 0;

  const { docFee, cvrFee } = settings;

  let baseOutTheDoorPrice: number | "Error" | "N/A" = "N/A";
  let salesTax: number | "Error" | "N/A" = "N/A";
  let frontEndLtv: number | "Error" | "N/A" = "N/A";
  let frontEndGross: number | "Error" | "N/A" = "N/A";
  let amountToFinance: number | "Error" | "N/A" = "N/A";
  let otdLtv: number | "Error" | "N/A" = "N/A";
  let monthlyPayment: number | "Error" | "N/A" = "N/A";

  // Only calculate if we have a valid price
  if (typeof vehicle.price === "number") {
    const netTradeIn = tradeInValue - tradeInPayoff;

    const { tax, extraFees } = calculateSalesTax(
      price,
      tradeInValue,
      settings,
      dealData.buyerState // per-deal buyer state overrides settings.defaultState [G18]
    );
    salesTax = tax;

    // Round OTD and amount-to-finance to cents so the payment is amortized off the
    // same figure the customer sees, and the financed amount reconciles. [B7]
    baseOutTheDoorPrice = roundCents(price + docFee + cvrFee + stateFees + salesTax + extraFees);

    if (typeof vehicle.unitCost === "number") {
      frontEndGross = roundCents(price - unitCost);
    }

    // Rebate reduces the financed amount like cash down (it is NOT tax-exempt in
    // this engine — the taxable base above is unchanged). [reconciliation 4/WS-C]
    amountToFinance = roundCents(
      baseOutTheDoorPrice + backendProducts - downPayment - netTradeIn - rebate
    );

    // An unset APR yields no payment rather than a spurious interest-free figure. [B6]
    monthlyPayment =
      interestRate === null
        ? "N/A"
        : calculateMonthlyPayment(amountToFinance, interestRate, loanTerm);

    // LTV Logic: Prefer Trade Book, fallback to Retail Book
    const bookValue = jdPower > 0 ? jdPower : jdPowerRetail > 0 ? jdPowerRetail : 0;

    if (bookValue > 0) {
      // Front-end LTV = selling price / book — the deal-independent unit advance
      // metric per the dc design contract (resolves flagged F&I decision #2).
      // Cash down / trade / taxes / fees do not move it; otdLtv carries the
      // deal-structure view. [reconciliation 5]
      frontEndLtv = (price / bookValue) * 100;
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
