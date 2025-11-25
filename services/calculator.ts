
import type { Vehicle, DealData, CalculatedVehicle, Settings, AppState } from '../types';

export const calculateMonthlyPayment = (principal: number, annualRate: number, termMonths: number): number | 'Error' => {
  if (principal < 0 || termMonths <= 0 || annualRate < 0) return 'Error';
  if (principal === 0) return 0;
  if (annualRate === 0) return principal / termMonths;

  const monthlyRate = (annualRate / 100) / 12;
  const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
  return payment;
};

export const calculateLoanAmount = (monthlyPayment: number, annualRate: number, termMonths: number): number | 'Error' => {
  if (monthlyPayment <= 0 || termMonths <= 0 || annualRate < 0) return 0;
  if (annualRate === 0) return monthlyPayment * termMonths;

  const monthlyRate = (annualRate / 100) / 12;
  const principal = monthlyPayment * ((1 - Math.pow(1 + monthlyRate, -termMonths)) / monthlyRate);
  
  if (isNaN(principal) || !isFinite(principal)) return 'Error';

  return principal;
};

const calculateSalesTax = (price: number, tradeInValue: number, settings: Settings): { tax: number, extraFees: number } => {
    const { docFee, cvrFee, defaultState, outOfStateTransitFee } = settings;
    
    // Define tax rates for relevant states.
    const TAX_RATES = {
        MI: 0.06,
        OH: 0.0575, 
        IN: 0.07,
    };

    let taxRate = TAX_RATES[defaultState];
    let extraFees = 0;

    // This logic assumes the dealership is in Michigan (MI), which has reciprocal tax agreements with some states.
    // For an out-of-state deal (e.g., OH or IN), a MI-based dealership is only required to collect tax up to its own state's rate (6%).
    // If the customer's home state has a higher tax rate, they are responsible for paying the difference when they register the vehicle.
    // A transit permit fee is also added for out-of-state deals to allow the customer to drive the vehicle home legally.
    if (defaultState !== 'MI') {
        // We cap the collected tax at Michigan's rate.
        taxRate = Math.min(TAX_RATES.MI, TAX_RATES[defaultState]);
        extraFees += outOfStateTransitFee; 
    }
    
    // Tax is calculated on the price of the vehicle MINUS the trade-in value (if any), plus any taxable fees like the Doc Fee and CVR Fee.
    const taxableAmount = Math.max(0, price - tradeInValue) + docFee + cvrFee;
    const tax = taxableAmount * taxRate;

    return { tax, extraFees };
};


export const calculateFinancials = (vehicle: Vehicle, dealData: DealData, settings: Settings): CalculatedVehicle => {
  const { downPayment, backendProducts, loanTerm, interestRate, tradeInValue, tradeInPayoff, stateFees } = dealData;
  const { price, jdPower, jdPowerRetail, unitCost } = vehicle;
  const { docFee, cvrFee } = settings;
  
  let baseOutTheDoorPrice: number | 'Error' | 'N/A' = 'N/A';
  let salesTax: number | 'Error' | 'N/A' = 'N/A';
  let frontEndLtv: number | 'Error' | 'N/A' = 'N/A';
  let frontEndGross: number | 'Error' | 'N/A' = 'N/A';
  let amountToFinance: number | 'Error' | 'N/A' = 'N/A';
  let otdLtv: number | 'Error' | 'N/A' = 'N/A';
  let monthlyPayment: number | 'Error' | 'N/A' = 'N/A';

  if (typeof price === 'number') {
    const netTradeIn = tradeInValue - tradeInPayoff;
    
    const { tax, extraFees } = calculateSalesTax(price, tradeInValue, settings);
    salesTax = tax;
    
    baseOutTheDoorPrice = price + docFee + cvrFee + stateFees + salesTax + extraFees;

    if (typeof unitCost === 'number') {
      frontEndGross = price - unitCost;
    }

    amountToFinance = baseOutTheDoorPrice + backendProducts - downPayment - netTradeIn;
    
    monthlyPayment = calculateMonthlyPayment(amountToFinance, interestRate, loanTerm);

    if (typeof jdPower === 'number' && jdPower > 0) {
      const frontEndAmountToFinance = baseOutTheDoorPrice - downPayment - netTradeIn;
      frontEndLtv = frontEndAmountToFinance >= 0 ? (frontEndAmountToFinance / jdPower) * 100 : 0;
      otdLtv = amountToFinance >= 0 ? (amountToFinance / jdPower) * 100 : 0;
    } else if(typeof jdPowerRetail === 'number' && jdPowerRetail > 0) {
        // Fallback to retail book value if trade value is missing
        const frontEndAmountToFinance = baseOutTheDoorPrice - downPayment - netTradeIn;
        frontEndLtv = frontEndAmountToFinance >= 0 ? (frontEndAmountToFinance / jdPowerRetail) * 100 : 0;
        otdLtv = amountToFinance >= 0 ? (amountToFinance / jdPowerRetail) * 100 : 0;
    } else {
      frontEndLtv = 'Error';
      otdLtv = 'Error';
    }

  } else {
    baseOutTheDoorPrice = 'Error';
    salesTax = 'Error';
    frontEndGross = 'Error';
    amountToFinance = 'Error';
    monthlyPayment = 'Error';
    frontEndLtv = 'Error';
    otdLtv = 'Error';
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