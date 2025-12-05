/**
 * Utility functions for safe data handling and parsing
 */

/**
 * Safely parse a number from various input types
 * @param value - Value to parse as number
 * @param fallback - Fallback value if parsing fails (default: 0)
 * @returns Parsed number or fallback
 */
export const safeParseNumber = (
  value: unknown,
  fallback: number = 0
): number => {
  if (typeof value === "number") {
    return isNaN(value) || !isFinite(value) ? fallback : value;
  }

  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ""));
    return isNaN(parsed) || !isFinite(parsed) ? fallback : parsed;
  }

  return fallback;
};

/**
 * Safely parse a boolean from various input types
 * @param value - Value to parse as boolean
 * @param fallback - Fallback value if parsing fails (default: false)
 * @returns Parsed boolean or fallback
 */
export const safeParseBoolean = (
  value: unknown,
  fallback: boolean = false
): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    if (lower === "true" || lower === "1" || lower === "yes") return true;
    if (lower === "false" || lower === "0" || lower === "no") return false;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return fallback;
};

/**
 * Format currency with proper locale and handling of edge cases
 * @param value - Number to format as currency
 * @param options - Intl.NumberFormat options
 * @returns Formatted currency string
 */
export const formatCurrencySafe = (
  value: number | "Error" | "N/A",
  options: Intl.NumberFormatOptions = {}
): string => {
  if (value === "Error") return "Error";
  if (value === "N/A") return "N/A";
  if (typeof value !== "number" || isNaN(value) || !isFinite(value))
    return "N/A";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
};

/**
 * Format percentage with proper handling
 * @param value - Number to format as percentage
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 */
export const formatPercentageSafe = (
  value: number | "Error" | "N/A",
  decimals: number = 1
): string => {
  if (value === "Error") return "Error";
  if (value === "N/A") return "N/A";
  if (typeof value !== "number" || isNaN(value) || !isFinite(value))
    return "N/A";

  return `${value.toFixed(decimals)}%`;
};

/**
 * Debounce function with TypeScript support
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @returns Debounced function
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Throttle function with TypeScript support
 * @param func - Function to throttle
 * @param limit - Limit time in milliseconds
 * @returns Throttled function
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/**
 * Check if localStorage is available
 * @returns boolean indicating if localStorage is available
 */
export const isLocalStorageAvailable = (): boolean => {
  try {
    const test = "__localStorage_test__";
    window.localStorage.setItem(test, test);
    window.localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Safe localStorage wrapper with quota handling
 */
export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      console.warn(`Failed to get localStorage key "${key}":`, error);
      return null;
    }
  },

  setItem: (key: string, value: string): boolean => {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === "QuotaExceededError") {
        console.error("localStorage quota exceeded. Clearing old data...");
        // Optionally clear old data or notify user
      }
      console.warn(`Failed to set localStorage key "${key}":`, error);
      return false;
    }
  },

  removeItem: (key: string): void => {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove localStorage key "${key}":`, error);
    }
  },
};
