import { GoogleGenAI, Type } from "@google/genai";
import type {
  LenderProfile,
  LenderTier,
  DealData,
  FilterData,
  CalculatedVehicle,
  Vehicle,
} from "../types";

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64Part = result.split(",")[1] ?? "";
      resolve(base64Part);
    };
    reader.onerror = (error) => reject(error);
  });
};

const LENDER_TIER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: {
      type: Type.STRING,
      description:
        "A descriptive name for the tier, e.g., 'New Vehicles - Tier 1 (720+ FICO)' or 'Used 2018-2020'.",
    },
    minFico: {
      type: Type.INTEGER,
      description:
        "Minimum FICO score for this tier. If a range is given, use lower bound. Omit if not specified.",
    },
    maxFico: {
      type: Type.INTEGER,
      description:
        "Maximum FICO score for this tier. If a range is given, use upper bound. Omit if not specified.",
    },
    maxLtv: {
      type: Type.NUMBER,
      description:
        "Maximum LTV percentage for this tier. Omit if not specified.",
    },
    maxTerm: {
      type: Type.INTEGER,
      description:
        "Maximum loan term in months for this tier. Omit if not specified.",
    },
    minYear: {
      type: Type.INTEGER,
      description:
        "Minimum vehicle model year for this tier. Omit if not specified.",
    },
    maxYear: {
      type: Type.INTEGER,
      description:
        "Maximum vehicle model year for this tier. Omit if not specified.",
    },
    minMileage: {
      type: Type.INTEGER,
      description:
        "Minimum vehicle mileage for this tier. Omit if not specified.",
    },
    maxMileage: {
      type: Type.INTEGER,
      description:
        "Maximum vehicle mileage for this tier. Omit if not specified.",
    },
    minTerm: {
      type: Type.INTEGER,
      description:
        "Minimum loan term in months for this tier. Omit if not specified.",
    },
    minAmountFinanced: {
      type: Type.NUMBER,
      description:
        "Minimum amount financed for this tier. Omit if not specified.",
    },
    maxAmountFinanced: {
      type: Type.NUMBER,
      description:
        "Maximum amount financed for this tier. Omit if not specified.",
    },
  },
  required: ["name"],
};

const LENDER_PROFILE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: {
      type: Type.STRING,
      description: "The name of the lender, bank, or credit union.",
    },
    minIncome: {
      type: Type.NUMBER,
      description:
        "The overall minimum monthly income required. Omit if not specified.",
    },
    maxPti: {
      type: Type.NUMBER,
      description:
        "The overall maximum Payment-To-Income (PTI) ratio. Omit if not specified.",
    },
    bookValueSource: {
      type: Type.STRING,
      description:
        "The primary book value source mentioned, e.g., 'Trade' or 'Retail'. Default 'Trade'.",
    },
    tiers: {
      type: Type.ARRAY,
      description: "An array of lending tiers or programs.",
      items: LENDER_TIER_SCHEMA,
    },
  },
  required: ["name", "tiers"],
};

// Schema for extracting MULTIPLE lenders from a single PDF
const MULTI_LENDER_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    lenders: {
      type: Type.ARRAY,
      description: "An array of ALL lender profiles found in the document. Each bank/credit union is a separate entry.",
      items: LENDER_PROFILE_SCHEMA,
    },
  },
  required: ["lenders"],
};

const DEAL_SUGGESTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    analysis: {
      type: Type.STRING,
      description: "A professional analysis of the deal structure.",
    },
    suggestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "Short title of the suggestion.",
          },
          reasoning: { type: Type.STRING, description: "Why this helps." },
          proposedChanges: {
            type: Type.OBJECT,
            properties: {
              downPayment: { type: Type.NUMBER },
              tradeInValue: { type: Type.NUMBER },
              backendProducts: { type: Type.NUMBER },
              interestRate: { type: Type.NUMBER },
              loanTerm: { type: Type.INTEGER },
            },
            description: "Key-value pairs of DealData to change.",
          },
          alternativeVehicleVin: {
            type: Type.STRING,
            description:
              "VIN of a better fitting vehicle from inventory. Omit if none.",
          },
        },
        required: ["title", "reasoning"],
      },
    },
  },
  required: ["analysis", "suggestions"],
};

export type DealSuggestion = {
  analysis: string;
  suggestions: {
    title: string;
    reasoning: string;
    proposedChanges: Partial<DealData>;
    alternativeVehicleVin?: string;
  }[];
};

const normalizeNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const normalizeTier = (tier: any): LenderTier | null => {
  if (!tier || typeof tier !== "object") return null;
  return {
    name: typeof tier.name === "string" ? tier.name : "Unnamed Tier",
    minFico: normalizeNumber(tier.minFico),
    maxFico: normalizeNumber(tier.maxFico),
    minYear: normalizeNumber(tier.minYear),
    maxYear: normalizeNumber(tier.maxYear),
    minMileage: normalizeNumber(tier.minMileage),
    maxMileage: normalizeNumber(tier.maxMileage),
    minTerm: normalizeNumber(tier.minTerm),
    maxTerm: normalizeNumber(tier.maxTerm),
    maxLtv: normalizeNumber(tier.maxLtv),
    minAmountFinanced: normalizeNumber(tier.minAmountFinanced),
    maxAmountFinanced: normalizeNumber(tier.maxAmountFinanced),
  };
};

const normalizeProfile = (profile: any): Partial<LenderProfile> => {
  if (!profile || typeof profile !== "object") return {};
  const tiers = Array.isArray(profile.tiers)
    ? (profile.tiers.map(normalizeTier).filter(Boolean) as LenderTier[])
    : [];
  return {
    id: profile.id || `ai_${Date.now()}`,
    name: typeof profile.name === "string" ? profile.name : "Unnamed Lender",
    minIncome: normalizeNumber(profile.minIncome),
    maxPti: normalizeNumber(profile.maxPti),
    bookValueSource: profile.bookValueSource === "Retail" ? "Retail" : "Trade",
    tiers,
  };
};

export const processLenderSheet = async (
  file: File
): Promise<Partial<LenderProfile>[]> => {
  if (typeof window === "undefined") {
    throw new Error("AI processing is only available in the browser.");
  }
  const apiKey = process.env.API_KEY;
  if (!apiKey)
    throw new Error(
      "AI is disabled. Call this via a server-side proxy with an API key."
    );

  const ai = new GoogleGenAI({ apiKey });
  const base64Data = await fileToBase64(file);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "application/pdf", data: base64Data } },
          {
            text: `You are an expert AI data extraction specialist for automotive dealer finance departments.

**YOUR MISSION**: Extract ALL lender/bank rate sheet data from EVERY PAGE of this PDF into structured JSON. This PDF may contain rate sheets from MULTIPLE different banks, credit unions, or lending institutions. You MUST extract data for EVERY SINGLE lender found.

**CRITICAL REQUIREMENTS**:

1. **SCAN ALL PAGES**: Go through EVERY page of this PDF document. Different lenders may appear on different pages.

2. **IDENTIFY ALL LENDERS**: Look for bank names, credit union names, lender logos, or headers that indicate different financial institutions. Common patterns include:
   - Bank/Credit Union name at the top of a page
   - "Rate Sheet" or "Program Guide" headers with lender branding
   - Footer or header text identifying the lender
   - Separate sections or pages for different banks

3. **FOR EACH LENDER, EXTRACT**:
   
   **Lender Name** (REQUIRED):
   - The exact name of the bank, credit union, or lending institution
   - Examples: "Capital One", "Ally Financial", "Chase Auto", "Navy Federal Credit Union"
   
   **Credit Tiers** (REQUIRED - extract ALL tiers):
   For each tier/program, capture:
   - **name**: Tier identifier (e.g., "Tier 1", "A+", "Super Prime", "New Vehicle Program", "Used 2020-2024")
   - **minFico/maxFico**: Credit score range (e.g., "720+" means minFico=720, no maxFico; "680-719" means minFico=680, maxFico=719)
   - **maxLtv**: Maximum Loan-to-Value percentage (look for "LTV", "Advance", "Max LTV" columns)
   - **minTerm/maxTerm**: Loan term range in months (e.g., "Up to 72 months" = maxTerm=72)
   - **minYear/maxYear**: Vehicle model year restrictions (e.g., "2019+" = minYear=2019; "Within 5 years" = calculate from current year)
   - **minMileage/maxMileage**: Mileage restrictions (e.g., "Under 100,000 miles" = maxMileage=100000)
   - **minAmountFinanced/maxAmountFinanced**: Loan amount limits

   **Global Policies** (if specified):
   - **minIncome**: Minimum monthly gross income required
   - **maxPti**: Maximum Payment-To-Income ratio (as percentage, e.g., 20 for 20%)
   - **bookValueSource**: Book value basis - look for "Trade", "Retail", "Wholesale", "Clean Trade", "Average Trade". Default to "Trade" if unclear.

4. **DATA ACCURACY RULES**:
   - NEVER hallucinate or make up data
   - If a field is not explicitly stated, OMIT it (don't guess)
   - If a range says "600+", set minFico=600, omit maxFico
   - If max mileage is "150K", set maxMileage=150000
   - Convert all percentages to numbers (e.g., "125%" LTV = maxLtv: 125)
   - Model year ranges like "2018-2024" = minYear=2018, maxYear=2024
   - If it says "No vehicles older than 7 years", calculate minYear based on current year

5. **COMMON RATE SHEET FORMATS**:
   - Look for tables with columns like: Credit Tier | FICO | LTV | Term | Rate
   - Look for sections labeled: New Vehicles, Used Vehicles, Certified Pre-Owned
   - Look for footnotes that specify income requirements or PTI limits
   - Pay attention to "Stipulations" or "Conditions" sections

6. **WHAT TO LOOK FOR ON EACH PAGE**:
   - Page headers/footers with lender branding
   - Logo images that indicate the lender
   - "Effective Date" with lender name
   - Contact information for different lenders
   - Separate rate tables for each lender

**OUTPUT FORMAT**:
Return a JSON object with a "lenders" array containing ALL extracted lender profiles.
Each lender profile must have at minimum: name and tiers array.
If only ONE lender is in the document, still return it in the lenders array.

**EXAMPLE STRUCTURE**:
{
  "lenders": [
    {
      "name": "First Bank Auto",
      "minIncome": 2000,
      "maxPti": 18,
      "bookValueSource": "Trade",
      "tiers": [
        { "name": "Tier 1 - New", "minFico": 720, "maxLtv": 130, "maxTerm": 84, "minYear": 2024 },
        { "name": "Tier 1 - Used", "minFico": 720, "maxLtv": 120, "maxTerm": 72, "minYear": 2019, "maxMileage": 80000 }
      ]
    },
    {
      "name": "Credit Union Two",
      "minIncome": 1800,
      "bookValueSource": "Retail",
      "tiers": [
        { "name": "A+ Credit", "minFico": 750, "maxLtv": 115, "maxTerm": 84 },
        { "name": "A Credit", "minFico": 700, "maxFico": 749, "maxLtv": 110, "maxTerm": 72 }
      ]
    }
  ]
}

NOW EXTRACT ALL LENDERS FROM ALL PAGES OF THIS DOCUMENT:`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: MULTI_LENDER_RESPONSE_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No data returned from AI.");

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error("Failed to parse AI response as JSON.");
    }

    if (!parsed || !parsed.lenders || !Array.isArray(parsed.lenders)) {
      // Fallback: if response is a single lender object, wrap it
      if (parsed && parsed.name) {
        return [normalizeProfile(parsed)];
      }
      return [];
    }

    // Normalize all lender profiles
    const normalizedLenders = parsed.lenders
      .map((lender: any) => normalizeProfile(lender))
      .filter((lender: Partial<LenderProfile>) => lender.name && lender.name !== "Unnamed Lender");

    if (normalizedLenders.length === 0) {
      throw new Error("No valid lender data could be extracted from the document.");
    }

    return normalizedLenders;
  } catch (error: any) {
    console.error("AI Processing Error:", error);
    const msg = error?.message || String(error);
    throw new Error(`Failed to extract lender data: ${msg}`);
  }
};

export const analyzeDealWithAi = async (
  vehicle: CalculatedVehicle,
  dealData: DealData,
  filters: FilterData,
  lenderProfiles: LenderProfile[],
  inventory: Vehicle[]
): Promise<DealSuggestion> => {
  if (typeof window === "undefined") {
    throw new Error("AI analysis is only available in the browser.");
  }
  const apiKey = process.env.API_KEY;
  if (!apiKey)
    throw new Error(
      "AI is disabled. Call this via a server-side proxy with an API key."
    );

  const ai = new GoogleGenAI({ apiKey });

  const safeVehicle = (vehicle || {}) as Partial<CalculatedVehicle>;
  const safeDealData = (dealData || {}) as Partial<DealData>;
  const safeFilters = (filters || {}) as Partial<FilterData>;
  const safeLenders = Array.isArray(lenderProfiles) ? lenderProfiles : [];
  const safeInventory = Array.isArray(inventory) ? inventory : [];

  const dealContext = JSON.stringify({
    vehicle: {
      year: safeVehicle.modelYear,
      mileage: safeVehicle.mileage,
      price: safeVehicle.price,
      bookValue: safeVehicle.jdPower,
      retailBook: safeVehicle.jdPowerRetail,
      frontEndLtv: safeVehicle.frontEndLtv,
      otdLtv: safeVehicle.otdLtv,
      amountToFinance: safeVehicle.amountToFinance,
      monthlyPayment: safeVehicle.monthlyPayment,
    },
    dealStructure: safeDealData,
    customer: {
      creditScore: safeFilters.creditScore,
      monthlyIncome: safeFilters.monthlyIncome,
      budget: safeFilters.maxPayment,
    },
  });

  const lenderContext = JSON.stringify(
    safeLenders.map((p) => ({
      name: p.name,
      tiers: Array.isArray(p.tiers) ? p.tiers : [],
    }))
  );

  const inventorySnapshot = JSON.stringify(
    safeInventory.slice(0, 10).map((v) => ({
      vin: v.vin,
      vehicle: v.vehicle,
      price: v.price,
      mileage: v.mileage,
      book: v.jdPower,
    }))
  );

  const prompt = `
        You are an expert Automotive Finance Manager.
        Analyze this deal structure against the provided lender profiles.
        
        Current Deal Context: ${dealContext}
        Available Lenders: ${lenderContext}
        Available Inventory (for switching): ${inventorySnapshot}

        Tasks:
        1. Determine if the deal is likely to be approved. If not, why?
        2. Suggest actionable changes to the deal structure (e.g., more cash down, lower price, cut backend) to get it approved or improve profitability.
        3. If this vehicle is impossible for the customer, suggest a specific alternative vehicle from the inventory list that fits better.
        
        Return a JSON object with a professional analysis and a list of suggestions.
    `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: DEAL_SUGGESTION_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No analysis returned.");

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error("Failed to parse AI response.");
    }

    if (!parsed)
      return { analysis: "Error parsing AI response.", suggestions: [] };

    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
      parsed.suggestions = [];
    }

    return parsed as DealSuggestion;
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    const msg = error?.message || String(error);
    throw new Error(`Failed to analyze the deal: ${msg}`);
  }
};
