
import type { CalculatedVehicle, LenderProfile, DealData, FilterData, LenderTier } from '../types';

const formatCurrencySimple = (value: any): string => {
  if (typeof value !== 'number') return String(value || '0');
  try {
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  } catch {
      return `$${value}`;
  }
};

interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  matchedTier: LenderTier | null;
}

export const checkBankEligibility = (
  vehicle: CalculatedVehicle,
  deal: DealData & FilterData,
  bank: LenderProfile
): EligibilityResult => {
  // Extreme defensive programming to prevent crashes
  if (!bank || typeof bank !== 'object') {
      return { eligible: false, reasons: ["Invalid bank profile data."], matchedTier: null };
  }

  if (!deal || typeof deal !== 'object') {
      return { eligible: false, reasons: ["Invalid deal data."], matchedTier: null };
  }

  const { creditScore, monthlyIncome } = deal;
  
  // Defensive destructuring with defaults
  const { 
    amountToFinance = 0, 
    jdPower = 0, 
    jdPowerRetail = 0, 
    modelYear = 0, 
    mileage = 0, 
    monthlyPayment = 0 
  } = vehicle || {};
  
  const reasons: string[] = [];
  
  // General bank-level checks
  if (bank.minIncome !== undefined && bank.minIncome > 0) {
      const income = Number(monthlyIncome) || 0;
      if (income < bank.minIncome) {
        reasons.push(`Income too low (${formatCurrencySimple(income)} < ${formatCurrencySimple(bank.minIncome)})`);
      }
  }

  if (bank.maxPti !== undefined && bank.maxPti > 0 && monthlyIncome && monthlyIncome > 0) {
    const pment = Number(monthlyPayment);
    if (pment > 0) {
        const pti = (pment / monthlyIncome) * 100;
        if (pti > bank.maxPti) {
            reasons.push(`PTI too high (${pti.toFixed(1)}% > ${bank.maxPti}%)`);
        }
    }
  }

  // If general checks fail, we can stop here.
  if(reasons.length > 0) {
    return { eligible: false, reasons, matchedTier: null };
  }

  // Find a matching tier
  const tiers = bank.tiers;
  // Defensive check: Ensure tiers is an array before iterating
  if (!tiers || !Array.isArray(tiers)) {
    reasons.push("Bank profile has invalid tiers structure.");
    return { eligible: false, reasons, matchedTier: null };
  }

  for (const tier of tiers) {
    if (!tier || typeof tier !== 'object') continue; 
    
    // FICO Score Check
    if (tier.minFico !== undefined && (creditScore === null || creditScore === undefined || creditScore < tier.minFico)) continue;
    if (tier.maxFico !== undefined && (creditScore !== null && creditScore !== undefined && creditScore > tier.maxFico)) continue;

    // Vehicle Year Check
    const year = Number(modelYear);
    if (tier.minYear !== undefined && (isNaN(year) || year < tier.minYear)) continue;
    if (tier.maxYear !== undefined && (isNaN(year) || year > tier.maxYear)) continue;

    // Vehicle Mileage Check
    const miles = Number(mileage);
    if (tier.minMileage !== undefined && (isNaN(miles) || miles < tier.minMileage)) continue;
    if (tier.maxMileage !== undefined && (isNaN(miles) || miles > tier.maxMileage)) continue;

    // Amount Financed Check
    const amt = Number(amountToFinance);
    if (tier.minAmountFinanced !== undefined && (isNaN(amt) || amt < tier.minAmountFinanced)) continue;
    if (tier.maxAmountFinanced !== undefined && (isNaN(amt) || amt > tier.maxAmountFinanced)) continue;
    
    // Loan Term Check
    if (tier.minTerm !== undefined && deal.loanTerm < tier.minTerm) continue;
    if (tier.maxTerm !== undefined && deal.loanTerm > tier.maxTerm) continue;

    // LTV (Loan-to-Value) Check
    if (tier.maxLtv !== undefined) {
      const bookValueSource = bank.bookValueSource || 'Trade';
      const bookValue = bookValueSource === 'Retail' && typeof jdPowerRetail === 'number' && jdPowerRetail > 0 ? jdPowerRetail : (typeof jdPower === 'number' && jdPower > 0 ? jdPower : null);

      if (bookValue === null) continue; // Cannot check LTV without a book value
      if (amt <= 0) continue;
      
      const otdLtv = (amt / bookValue) * 100;
      if (otdLtv > tier.maxLtv) continue;
    }

    // If all checks pass, this tier is a match.
    return { eligible: true, reasons: [], matchedTier: tier };
  }

  // If the loop completes without finding a matching tier.
  reasons.push("No eligible lending tier found for this deal structure and vehicle.");
  return { eligible: false, reasons, matchedTier: null };
};
