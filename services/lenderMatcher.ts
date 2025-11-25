
import type { CalculatedVehicle, LenderProfile, DealData, FilterData, LenderTier } from '../types';

const formatCurrencySimple = (value: any): string => {
  if (typeof value !== 'number') return String(value);
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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
  
  if (!bank) {
      return { eligible: false, reasons: ["Invalid bank profile."], matchedTier: null };
  }

  // General bank-level checks
  if (bank.minIncome !== undefined && bank.minIncome > 0 && (monthlyIncome === null || monthlyIncome === undefined || monthlyIncome < bank.minIncome)) {
    reasons.push(`Income too low (${formatCurrencySimple(monthlyIncome)} < ${formatCurrencySimple(bank.minIncome)})`);
  }
  if (bank.maxPti !== undefined && bank.maxPti > 0 && monthlyIncome && typeof monthlyPayment === 'number' && monthlyPayment > 0) {
    const pti = (monthlyPayment / monthlyIncome) * 100;
    if (pti > bank.maxPti) {
      reasons.push(`PTI too high (${pti.toFixed(1)}% > ${bank.maxPti}%)`);
    }
  }

  // If general checks fail, we can stop here.
  if(reasons.length > 0) {
    return { eligible: false, reasons, matchedTier: null };
  }

  // Find a matching tier
  const tiers = bank.tiers || [];
  // Defensive check: Ensure tiers is an array before iterating
  if (!Array.isArray(tiers)) {
    reasons.push("Bank profile has invalid tiers structure.");
    return { eligible: false, reasons, matchedTier: null };
  }

  for (const tier of tiers) {
    if (!tier) continue; // Skip null/undefined tiers
    
    // FICO Score Check
    if (tier.minFico !== undefined && (creditScore === null || creditScore === undefined || creditScore < tier.minFico)) continue;
    if (tier.maxFico !== undefined && (creditScore !== null && creditScore !== undefined && creditScore > tier.maxFico)) continue;

    // Vehicle Year Check
    if (tier.minYear !== undefined && (typeof modelYear !== 'number' || modelYear < tier.minYear)) continue;
    if (tier.maxYear !== undefined && (typeof modelYear !== 'number' || modelYear > tier.maxYear)) continue;

    // Vehicle Mileage Check
    if (tier.minMileage !== undefined && (typeof mileage !== 'number' || mileage < tier.minMileage)) continue;
    if (tier.maxMileage !== undefined && (typeof mileage !== 'number' || mileage > tier.maxMileage)) continue;

    // Amount Financed Check
    if (tier.minAmountFinanced !== undefined && (typeof amountToFinance !== 'number' || amountToFinance < tier.minAmountFinanced)) continue;
    if (tier.maxAmountFinanced !== undefined && (typeof amountToFinance !== 'number' || amountToFinance > tier.maxAmountFinanced)) continue;
    
    // Loan Term Check
    if (tier.minTerm !== undefined && deal.loanTerm < tier.minTerm) continue;
    if (tier.maxTerm !== undefined && deal.loanTerm > tier.maxTerm) continue;

    // LTV (Loan-to-Value) Check
    if (tier.maxLtv !== undefined) {
      const bookValueSource = bank.bookValueSource || 'Trade';
      const bookValue = bookValueSource === 'Retail' && typeof jdPowerRetail === 'number' && jdPowerRetail > 0 ? jdPowerRetail : (typeof jdPower === 'number' && jdPower > 0 ? jdPower : null);

      if (bookValue === null) continue; // Cannot check LTV without a book value, so this tier is not a candidate.
      if (typeof amountToFinance !== 'number') continue;
      
      const otdLtv = (amountToFinance / bookValue) * 100;
      if (otdLtv > tier.maxLtv) continue; // Continue to the next tier if LTV is too high.
    }

    // If all checks pass, this tier is a match.
    return { eligible: true, reasons: [], matchedTier: tier };
  }

  // If the loop completes without finding a matching tier.
  reasons.push("No eligible lending tier found for this deal structure and vehicle.");
  return { eligible: false, reasons, matchedTier: null };
};
