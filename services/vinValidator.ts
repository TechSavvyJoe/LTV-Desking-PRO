/**
 * VIN Validation Service
 * Validates Vehicle Identification Numbers (VINs) with proper checksum verification.
 *
 * VIN Format:
 * - 17 characters total
 * - Characters 1-3: World Manufacturer Identifier (WMI)
 * - Character 9: Check digit
 * - Characters 10-17: Vehicle Identifier Section (VIS)
 * - No I, O, or Q allowed (to avoid confusion with 1 and 0)
 */

// Transliteration values for VIN characters
const VIN_TRANSLITERATIONS: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
};

// Position weights for VIN checksum calculation
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Validates VIN format (17 chars, no I/O/Q)
 */
export const isValidVinFormat = (vin: string): boolean => {
  if (typeof vin !== "string") return false;
  // Must be exactly 17 characters, alphanumeric, no I, O, or Q
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin);
};

/**
 * Calculates the VIN check digit (position 9)
 * Returns the expected check digit character
 */
export const calculateVinCheckDigit = (vin: string): string | null => {
  if (!isValidVinFormat(vin)) return null;

  const vinUpper = vin.toUpperCase();
  let sum = 0;

  for (let i = 0; i < 17; i++) {
    const char = vinUpper[i];
    if (i === 8) continue; // Skip check digit position

    const translitValue = VIN_TRANSLITERATIONS[char ?? ""];
    const weight = VIN_WEIGHTS[i];

    if (translitValue === undefined || weight === undefined) return null;
    sum += translitValue * weight;
  }

  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
};

/**
 * Validates VIN check digit (position 9)
 * Note: Many VINs in the wild have incorrect check digits,
 * so this should be used as a warning, not a hard failure.
 */
export const validateVinCheckDigit = (vin: string): boolean => {
  if (!isValidVinFormat(vin)) return false;

  const vinUpper = vin.toUpperCase();
  const expectedCheckDigit = calculateVinCheckDigit(vinUpper);
  const actualCheckDigit = vinUpper[8];

  return expectedCheckDigit === actualCheckDigit;
};

/**
 * Full VIN validation result
 */
export interface VinValidationResult {
  isValid: boolean;
  formatValid: boolean;
  checksumValid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Performs full VIN validation with detailed results
 */
export const validateVin = (vin: string): VinValidationResult => {
  const result: VinValidationResult = {
    isValid: false,
    formatValid: false,
    checksumValid: false,
    warnings: [],
    errors: [],
  };

  if (!vin) {
    result.errors.push("VIN is required");
    return result;
  }

  if (typeof vin !== "string") {
    result.errors.push("VIN must be a string");
    return result;
  }

  const trimmedVin = vin.trim().toUpperCase();

  // Check length
  if (trimmedVin.length !== 17) {
    result.errors.push(`VIN must be 17 characters (got ${trimmedVin.length})`);
    return result;
  }

  // Check for invalid characters (I, O, Q)
  if (/[IOQ]/i.test(trimmedVin)) {
    result.errors.push("VIN cannot contain letters I, O, or Q");
    return result;
  }

  // Check format
  if (!isValidVinFormat(trimmedVin)) {
    result.errors.push("VIN contains invalid characters");
    return result;
  }

  result.formatValid = true;

  // Validate checksum
  result.checksumValid = validateVinCheckDigit(trimmedVin);

  if (!result.checksumValid) {
    // Many real-world VINs have incorrect check digits
    result.warnings.push("VIN check digit may be incorrect (position 9)");
  }

  // VIN is valid if format is correct (checksum is a warning, not an error)
  result.isValid = result.formatValid;

  return result;
};

/**
 * Simple boolean check if VIN is valid (format only)
 * Use this for quick validation in forms.
 */
export const isValidVin = (vin: string): boolean => {
  return isValidVinFormat(vin);
};

/**
 * Strict VIN validation including checksum.
 * Returns true only if both format and checksum are valid.
 */
export const isValidVinStrict = (vin: string): boolean => {
  const result = validateVin(vin);
  return result.formatValid && result.checksumValid;
};
