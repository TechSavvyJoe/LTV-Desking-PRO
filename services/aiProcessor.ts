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
): Promise<Partial<LenderProfile>> => {
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
            text: `You are an expert AI data extraction specialist for automotive lending. 
Extract all lender guidelines from this rate sheet into a structured JSON format.

CRITICAL INSTRUCTIONS:
1. **Lender Name**: Extract the exact name of the bank or credit union.
2. **Tiers**: Extract ALL credit tiers/programs. For each tier, capture:
   - Name (e.g., "Tier 1", "A+", "Super Prime")
   - FICO Range (minFico, maxFico)
   - LTV Caps (maxLtv) - look for "Max LTV", "Advance", or "LTV" columns.
   - Term Limits (minTerm, maxTerm)
   - Year/Model Restrictions (minYear, maxYear) - e.g., "2018-2024" or "Up to 7 years old".
   - Mileage Limits (minMileage, maxMileage)
   - Amount Financed Limits (minAmountFinanced, maxAmountFinanced)
3. **Global Policies**: Extract bank-level rules:
   - minIncome (Minimum monthly income)
   - maxPti (Maximum Payment-to-Income ratio)
   - bookValueSource (Look for "Trade", "Retail", "Wholesale", "Clean", "Average". Default to "Trade" if ambiguous, but prefer "Retail" if explicitly stated for used cars).
4. **Accuracy**: Do not hallucinate. If a field is not present, omit it. If a range is "600+", set minFico to 600 and omit maxFico.

Return ONLY the JSON object matching the schema.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: LENDER_PROFILE_SCHEMA,
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

    if (!parsed) return {};

    const normalized = normalizeProfile(parsed);
    return normalized;
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
