import type { CalculatedVehicle, DealData, FilterData, LenderProfile, Vehicle } from "../../types";

export const LENDER_EXTRACTION_SYSTEM_PROMPT =
  "You are an expert automotive finance data extraction system. Return only valid JSON. Never invent lender program numbers. If a field is not explicit or clearly inferable from the document, omit it.";

export const buildLenderExtractionPrompt =
  (): string => `Extract every lender profile from this PDF rate sheet.

Process the full document, including scanned pages, footnotes, headers, page breaks, and continuation tables. Dealer sheets often contain multiple lenders, so create one lender object per distinct bank, credit union, captive lender, or finance company.

For each lender, return:
- name
- bookValueSource when stated: Trade or Retail
- minIncome, maxPti, maxDti, maxBackend, amount financed limits, stipulations, effectiveDate
- tiers with all available FICO ranges, vehicle year or age limits, mileage limits, term limits, LTV/advance limits, front-end LTV, OTD LTV, rates, backend caps, make restrictions, vehicle type, confidence, and extractionSource

Rules:
- Use numbers without symbols: 125% becomes 125, $2,500 becomes 2500, 100K becomes 100000.
- Separate new, used, and certified programs when terms differ.
- Treat a changed logo, heading, or lender name as a new lender.
- Preserve front-end advance and OTD/total advance as separate fields.
- Use maxAge and minYear when both are clear; if only maxAge is shown, include maxAge.
- Use confidence 1 for direct table values, 0.8-0.9 for clear context, 0.7 for calculated values.
- Do not include low-confidence guesses.

Return exactly:
{
  "lenders": [
    {
      "name": "Lender Name",
      "bookValueSource": "Trade",
      "tiers": [
        {
          "name": "Tier 1 Used 720+",
          "minFico": 720,
          "maxTerm": 84,
          "maxLtv": 125,
          "frontEndLtv": 110,
          "otdLtv": 125,
          "confidence": 1,
          "extractionSource": "table"
        }
      ]
    }
  ]
}`;

export const buildDealAnalysisPrompt = (
  vehicle: CalculatedVehicle,
  dealData: DealData,
  filters: FilterData,
  lenderProfiles: LenderProfile[],
  inventory: Vehicle[]
): string => {
  const inventorySnapshot = inventory.slice(0, 20).map((item) => ({
    vin: item.vin,
    vehicle: item.vehicle,
    stock: item.stock,
    modelYear: item.modelYear,
    mileage: item.mileage,
    price: item.price,
    jdPower: item.jdPower,
    jdPowerRetail: item.jdPowerRetail,
  }));

  const lenderSnapshot = lenderProfiles.map((profile) => ({
    name: profile.name,
    bookValueSource: profile.bookValueSource,
    minIncome: profile.minIncome,
    maxPti: profile.maxPti,
    maxDti: profile.maxDti,
    tiers: profile.tiers,
  }));

  return `You are an expert automotive finance manager. Analyze this deal against the lender guidelines and inventory below.

Current vehicle:
${JSON.stringify(vehicle, null, 2)}

Deal structure:
${JSON.stringify(dealData, null, 2)}

Customer filters:
${JSON.stringify(filters, null, 2)}

Lender profiles:
${JSON.stringify(lenderSnapshot, null, 2)}

Available inventory for possible vehicle switches:
${JSON.stringify(inventorySnapshot, null, 2)}

Tasks:
1. Explain approval risk in plain dealership language.
2. Suggest concrete deal changes that improve approval odds or gross.
3. If the current unit is a poor fit, suggest one alternative inventory VIN from the provided list.
4. Keep proposedChanges limited to fields in DealData: downPayment, tradeInValue, tradeInPayoff, backendProducts, loanTerm, interestRate, stateFees, notes.

Return exactly:
{
  "analysis": "Short professional analysis.",
  "suggestions": [
    {
      "title": "Increase cash down",
      "reasoning": "Why this helps.",
      "proposedChanges": { "downPayment": 2500 }
    }
  ]
}`;
};
