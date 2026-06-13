export const validateInput = (id: string, value: number | null): string | null => {
  // No validation for empty/null fields, as they are used to clear filters.
  if (value === null || value === undefined) {
    return null;
  }

  switch (id) {
    case "downPayment":
    case "backendProducts":
    case "monthlyIncome":
    case "maxPrice":
    case "maxPayment":
    case "stateFees":
      if (value < 0) return "Value cannot be negative.";
      break;
    case "tradeInValue":
    case "tradeInPayoff":
      if (value < 0) return "Value cannot be negative.";
      if (value > 500000) return "Value is unusually high (max $500,000).";
      break;
    case "maxMiles":
      if (value < 0) return "Value cannot be negative.";
      if (value > 1000000) return "Mileage is unusually high (max 1,000,000).";
      break;
    case "maxOtdLtv":
      if (value < 0) return "Value cannot be negative.";
      if (value > 500) return "LTV filter is unusually high (max 500%).";
      break;
    case "loanTerm":
      if (!Number.isInteger(value) || value <= 0) return "Term must be a positive whole number.";
      if (value > 120) return "Term is unusually high (max 120 mo).";
      break;
    case "interestRate":
      if (value < 0) return "Interest rate cannot be negative.";
      if (value > 50) return "Interest rate seems high (max 50%).";
      break;
    case "creditScore":
      // A value of 0 is treated as an empty filter, so we don't validate it.
      if (value === 0) return null;
      if (!Number.isInteger(value)) return "Score must be a whole number.";
      if (value < 300 || value > 850) return "Credit score must be between 300 and 850.";
      break;
    default:
      return null;
  }
  return null;
};
