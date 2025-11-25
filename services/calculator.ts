import type {
  Vehicle,
  DealData,
  CalculatedVehicle,
  Settings,
  AppState,
} from "../types";

export const calculateMonthlyPayment = (
  principal: number,
  annualRate: number,
  termMonths: number
): number | "Error" => {
  if (termMonths <= 0) return "Error"; // Term cannot be zero or negative
  if (principal <= 0) return 0; // No loan, no payment
  if (annualRate < 0) return "Error"; // Rate cannot be negative

  if (annualRate === 0) return principal / termMonths;

  const monthlyRate = annualRate / 100 / 12;
  const payment =
    (principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths))) /
    (Math.pow(1 + monthlyRate, termMonths) - 1);

  if (!isFinite(payment) || isNaN(payment)) return "Error";
  return payment;
};

export const calculateLoanAmount = (
  monthlyPayment: number,
  annualRate: number,
  termMonths: number
): number | "Error" => {
  if (monthlyPayment <= 0 || termMonths <= 0 || annualRate < 0) return 0;
  if (annualRate === 0) return monthlyPayment * termMonths;

  const monthlyRate = annualRate / 100 / 12;
  const principal =
    monthlyPayment *
    ((1 - Math.pow(1 + monthlyRate, -termMonths)) / monthlyRate);

  if (isNaN(principal) || !isFinite(principal)) return "Error";

  return principal;
};

const calculateSalesTax = (
  price: number,
  tradeInValue: number,
  settings: Settings
): { tax: number; extraFees: number } => {
  const { docFee, cvrFee, defaultState, outOfStateTransitFee, customTaxRate } =
    settings;

  const TAX_RATES: Record<string, number> = {
    MI: 0.06,
    OH: 0.0575,
    IN: 0.07,
  };

  let taxRate = 0.06;
  let extraFees = 0;

  if (typeof customTaxRate === "number" && customTaxRate >= 0) {
    // Use custom rate (stored as percentage, e.g. 6.0 for 6%)
    taxRate = customTaxRate / 100;
  } else {
    // Default logic
    taxRate = TAX_RATES[defaultState] ?? 0.06;

    if (defaultState !== "MI") {
      // Cap tax at Michigan's rate for reciprocity
      taxRate = Math.min(TAX_RATES.MI || 0.06, taxRate);
      extraFees += outOfStateTransitFee;
    }
  }

  const taxableAmount = Math.max(0, price - tradeInValue) + docFee + cvrFee;
  const tax = taxableAmount * taxRate;

  return { tax, extraFees };
};

export const calculateFinancials = (
  vehicle: Vehicle,
  dealData: DealData,
  settings: Settings
): CalculatedVehicle => {
  // Defensive defaults
  const downPayment = Number(dealData.downPayment) || 0;
  const backendProducts = Number(dealData.backendProducts) || 0;
  const loanTerm = Number(dealData.loanTerm) || 0;
  const interestRate = Number(dealData.interestRate) || 0;
  const tradeInValue = Number(dealData.tradeInValue) || 0;
  const tradeInPayoff = Number(dealData.tradeInPayoff) || 0;
  const stateFees = Number(dealData.stateFees) || 0;

  const price = typeof vehicle.price === "number" ? vehicle.price : 0;
  const jdPower = typeof vehicle.jdPower === "number" ? vehicle.jdPower : 0;
  const jdPowerRetail =
    typeof vehicle.jdPowerRetail === "number" ? vehicle.jdPowerRetail : 0;
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

    const { tax, extraFees } = calculateSalesTax(price, tradeInValue, settings);
    salesTax = tax;

    baseOutTheDoorPrice =
      price + docFee + cvrFee + stateFees + salesTax + extraFees;

    if (typeof vehicle.unitCost === "number") {
      frontEndGross = price - unitCost;
    }

    amountToFinance =
      baseOutTheDoorPrice + backendProducts - downPayment - netTradeIn;

    monthlyPayment = calculateMonthlyPayment(
      amountToFinance,
      interestRate,
      loanTerm
    );

    // LTV Logic: Prefer Trade Book, fallback to Retail Book
    const bookValue =
      jdPower > 0 ? jdPower : jdPowerRetail > 0 ? jdPowerRetail : 0;

    if (bookValue > 0) {
      const frontEndAmountToFinance =
        baseOutTheDoorPrice - downPayment - netTradeIn;
      frontEndLtv =
        frontEndAmountToFinance >= 0
          ? (frontEndAmountToFinance / bookValue) * 100
          : 0;
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
