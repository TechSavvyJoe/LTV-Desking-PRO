export const validateInput = (id: string, value: number | null): string | null => {
    // No validation for empty/null fields, as they are used to clear filters.
    if (value === null || value === undefined) {
        return null;
    }

    switch (id) {
        case 'downPayment':
        case 'backendProducts':
        case 'monthlyIncome':
        case 'maxPrice':
        case 'maxPayment':
        case 'stateFees':
            if (value < 0) return "Value cannot be negative.";
            break;
        case 'loanTerm':
            if (!Number.isInteger(value) || value <= 0) return "Term must be a positive whole number.";
            if (value > 120) return "Term is unusually high (max 120 mo).";
            break;
        case 'interestRate':
            if (value < 0) return "Interest rate cannot be negative.";
            if (value > 50) return "Interest rate seems high (max 50%).";
            break;
        case 'creditScore':
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