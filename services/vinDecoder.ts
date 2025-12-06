interface VinDetails {
  make: string;
  model: string;
  year: number;
  trim?: string;
}

export const decodeVin = async (vin: string): Promise<VinDetails> => {
  if (!vin || vin.length !== 17) {
    throw new Error("Invalid VIN. Must be 17 characters long.");
  }

  // The NHTSA vPIC API is a free service for decoding vehicle VINs.
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`;

  try {
    if (typeof fetch !== "function") {
      throw new Error("VIN lookup is unavailable in this environment.");
    }

    // Add a timeout to avoid hanging UI on bad networks.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`NHTSA API failed with status: ${response.status}`);
    }
    const data = await response.json();

    if (!data.Results || data.Results.length === 0) {
      throw new Error("VIN not found in the NHTSA database.");
    }

    const result = data.Results[0];

    // The API's `ErrorCode` "0" means a successful decode.
    // However, sometimes a valid VIN returns a non-zero code (e.g., "1" for a partial match) but still provides useful data.
    // As a fallback, we check if the 'Make' field exists. If it does, we proceed even with a non-zero ErrorCode.
    if (result.ErrorCode !== "0" && !result.Make) {
      throw new Error(
        `VIN lookup failed: ${result.ErrorText || "No data returned."}`
      );
    }

    const make = result.Make;
    const model = result.Model;
    const year = parseInt(result.ModelYear, 10);
    const trim = result.Trim || undefined;

    if (!make || !model || !year) {
      throw new Error("Could not extract complete vehicle details from VIN.");
    }

    return { make, model, year, trim };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "VIN lookup timed out. Please check your connection and try again."
      );
    }
    if (error instanceof Error) {
      // Re-throw known errors to be displayed in the UI.
      throw error;
    }
    // Catch fetch network errors or other unexpected issues.
    throw new Error("An unexpected network error occurred during VIN lookup.");
  }
};
