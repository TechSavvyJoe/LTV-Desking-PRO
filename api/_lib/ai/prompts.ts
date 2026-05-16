import type { CalculatedVehicle, DealData, FilterData, LenderProfile, Vehicle } from "../../../types.js";

export const LENDER_EXTRACTION_SYSTEM_PROMPT =
  "You are an expert automotive finance data extraction system. Return only valid JSON. Never invent lender program numbers, rates, or LTV values. If a field is not explicit or clearly inferable from the document, omit it. When confidence is low, lower the confidence score rather than guess.";

export const buildLenderExtractionPrompt =
  (): string => `Extract every lender profile from this PDF rate sheet.

Process the full document, including scanned pages, footnotes, headers, page breaks, and continuation tables. Dealer sheets often contain multiple lenders, so create one lender object per distinct bank, credit union, captive lender, or finance company.

For each lender, return:
- name (the bank/lender name as printed; strip 'Bank of' prefixes only when redundant)
- bookValueSource when stated: Trade or Retail
- minIncome, maxPti, maxDti, maxBackend, amount financed limits, stipulations, effectiveDate
- contactName, contactPhone, contactEmail when shown on the sheet (often in headers/footers or contact panels)
- website (lender's primary URL) and portalUrl (dealer submission portal) when shown
- generalNotes summarizing important program-wide notes that are not tier-specific
- tiers with all available FICO ranges, vehicle year or age limits, mileage limits, term limits, LTV/advance limits, front-end LTV, OTD LTV, rates, backend caps, make restrictions, vehicle type, confidence, and extractionSource

Rules:
- Use numbers without symbols: 125% becomes 125, $2,500 becomes 2500, 100K becomes 100000.
- Separate new, used, and certified programs when terms differ.
- Treat a changed logo, heading, or lender name as a new lender.
- Preserve front-end advance and OTD/total advance as separate fields.
- Use maxAge and minYear when both are clear; if only maxAge is shown, include maxAge.
- Use confidence 1 for direct table values, 0.8-0.9 for clear context, 0.7 for calculated values.
- Do not include low-confidence guesses for rate-related fields. Omit instead.
- Phone numbers: normalize to digits-with-formatting like "(555) 123-4567"; keep extensions like "x123" when shown.
- Emails: extract verbatim. Websites: include the full URL with https:// when shown.
- Set extractionSource: "table" for grid cells, "text" for prose, "header" for header/footer, "inferred" for derived values.

Return exactly:
{
  "lenders": [
    {
      "name": "Lender Name",
      "bookValueSource": "Trade",
      "contactName": "...", "contactPhone": "...", "contactEmail": "...",
      "website": "https://...", "portalUrl": "https://...",
      "generalNotes": "Notes that apply across all tiers...",
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

export const LENDER_ENRICH_SYSTEM_PROMPT =
  "You are a research assistant filling in PUBLIC, NON-CONFIDENTIAL information about an automotive lender. Use the web search tool to find authoritative sources. NEVER invent values. If you cannot find a value with confidence, omit it. Return only valid JSON.";

export const buildLenderEnrichmentPrompt = (lenderName: string, missingFields: string[]): string =>
  `Find authoritative, publicly-available information about the automotive lender named "${lenderName}".

Only fill in fields from this missing list, and only when you can confirm them from a reputable source (the lender's official website, dealer portal homepage, or established financial-data sites). Do NOT invent values. Omit any field you cannot verify.

Missing fields you may fill in:
${missingFields.map((f) => `- ${f}`).join("\n")}

Field guidance:
- contactName: the lender's dealer-services contact name (often a department, e.g. "Dealer Services").
- contactPhone: the lender's dealer-services phone number, normalized like "(555) 123-4567".
- contactEmail: the lender's dealer-services email if listed publicly.
- website: the lender's primary marketing URL with https://.
- portalUrl: the dealer submission/portal URL with https://.
- mailingAddress: the lender's mailing address for dealer submissions if posted publicly.
- generalNotes: 1-3 sentences describing the lender's automotive financing programs in general terms (e.g. "Captive lender of XYZ Auto, primarily new-vehicle financing nationwide.").
- bookValueSource: "Trade" or "Retail" — only set when widely published as standard for this lender.

For every field you fill in, cite the source URL you used in the "sources" array. Return at least one entry per field filled.

Return exactly:
{
  "enrichment": {
    "contactName": "...",
    "contactPhone": "...",
    "contactEmail": "...",
    "website": "...",
    "portalUrl": "...",
    "mailingAddress": "...",
    "generalNotes": "...",
    "bookValueSource": "Trade"
  },
  "sources": [
    { "url": "https://...", "title": "Source title", "fieldsCited": ["website", "portalUrl"] }
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
