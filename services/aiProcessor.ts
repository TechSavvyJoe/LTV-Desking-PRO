import { GoogleGenAI, Type } from "@google/genai";
import type {
  LenderProfile,
  LenderTier,
  DealData,
  FilterData,
  CalculatedVehicle,
  Vehicle,
} from "../types";

// Model configuration for paid API access
// Available models (newest to oldest):
// - "gemini-3-pro-preview"    - Most intelligent, best reasoning (paid only, no free tier)
// - "gemini-2.5-flash"        - Best balance of speed & capability for document processing
// - "gemini-2.5-pro"          - Advanced reasoning and analysis
// - "gemini-2.0-flash"        - Fast, reliable workhorse

// Using Gemini 3 Pro for maximum intelligence and best extraction accuracy
// Has same 1M token context as 2.5, but with superior reasoning for complex rate sheets
const PRIMARY_MODEL = "gemini-3-pro-preview";
const FALLBACK_MODEL = "gemini-2.5-flash";

// Progress callback type for UI updates
export type ProcessingProgress = {
  stage: 'uploading' | 'extracting' | 'validating' | 'enhancing' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  currentFile?: string;
  currentFileIndex?: number;
  totalFiles?: number;
};

export type ProgressCallback = (progress: ProcessingProgress) => void;

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

// Enhanced tier schema with ALL possible fields for accurate extraction
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
        "Maximum LTV percentage for this tier (e.g., 125 for 125%). CRITICAL for calculations. Omit if not specified.",
    },
    minLtv: {
      type: Type.NUMBER,
      description:
        "Minimum LTV percentage for this tier. Omit if not specified.",
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
    maxAge: {
      type: Type.INTEGER,
      description:
        "Maximum vehicle age in years (e.g., 'within 7 years' = 7). Use this to calculate minYear.",
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
    baseRate: {
      type: Type.NUMBER,
      description:
        "Base interest rate or buy rate for this tier (as percentage, e.g., 5.99). Omit if not specified.",
    },
    maxRate: {
      type: Type.NUMBER,
      description:
        "Maximum interest rate allowed for this tier. Omit if not specified.",
    },
    maxAdvance: {
      type: Type.NUMBER,
      description:
        "Maximum advance amount in dollars (different from LTV - this is a hard dollar cap). Omit if not specified.",
    },
    vehicleType: {
      type: Type.STRING,
      description:
        "Vehicle type restriction: 'new', 'used', 'certified', or 'all'. Omit if not specified.",
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
        "The overall maximum Payment-To-Income (PTI) ratio as percentage (e.g., 20 for 20%). Omit if not specified.",
    },
    maxDti: {
      type: Type.NUMBER,
      description:
        "The overall maximum Debt-To-Income (DTI) ratio as percentage. Omit if not specified.",
    },
    bookValueSource: {
      type: Type.STRING,
      description:
        "The primary book value source mentioned, e.g., 'Trade' or 'Retail'. Default 'Trade'.",
    },
    maxBackend: {
      type: Type.NUMBER,
      description:
        "Maximum backend products allowed (GAP, warranty, etc.) as dollar amount or percentage of loan. Omit if not specified.",
    },
    stipulations: {
      type: Type.STRING,
      description:
        "Any special stipulations, requirements, or notes about this lender's policies.",
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

// Calculate minYear from maxAge if provided
const calculateMinYearFromAge = (maxAge: number | undefined): number | undefined => {
  if (maxAge === undefined) return undefined;
  const currentYear = new Date().getFullYear();
  return currentYear - maxAge;
};

const normalizeTier = (tier: any): LenderTier | null => {
  if (!tier || typeof tier !== "object") return null;
  
  // Calculate minYear from maxAge if minYear isn't directly provided
  let minYear = normalizeNumber(tier.minYear);
  if (!minYear && tier.maxAge) {
    minYear = calculateMinYearFromAge(normalizeNumber(tier.maxAge));
  }
  
  return {
    name: typeof tier.name === "string" ? tier.name : "Unnamed Tier",
    minFico: normalizeNumber(tier.minFico),
    maxFico: normalizeNumber(tier.maxFico),
    minYear,
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

// Check if a tier has critical missing data
const tierHasMissingCriticalData = (tier: LenderTier): boolean => {
  // For calculations, we really need maxLtv or maxTerm at minimum
  return tier.maxLtv === undefined && tier.maxTerm === undefined;
};

// Check if a profile needs enhancement
const profileNeedsEnhancement = (profile: Partial<LenderProfile>): boolean => {
  if (!profile.tiers || profile.tiers.length === 0) return true;
  // Check if any tier is missing critical data
  return profile.tiers.some(tierHasMissingCriticalData);
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

// Enhanced extraction prompt with even more detailed instructions
const getExtractionPrompt = () => `You are an expert AI data extraction specialist for automotive dealer finance departments.

**YOUR MISSION**: Extract ALL lender/bank rate sheet data from EVERY PAGE of this PDF into structured JSON. This PDF may contain rate sheets from MULTIPLE different banks, credit unions, or lending institutions. You MUST extract data for EVERY SINGLE lender found.

**CRITICAL DATA EXTRACTION PRIORITY** (in order of importance for deal calculations):

1. **MAX LTV (Loan-to-Value)** - MOST CRITICAL
   - Look for columns labeled: "LTV", "Max LTV", "Advance", "Max Advance %", "Loan to Value"
   - Common values: 100%, 110%, 115%, 120%, 125%, 130%, 140%, 150%
   - If you see "up to 125% of book", maxLtv = 125
   - If you see "retail book value", also note bookValueSource = "Retail"

2. **CREDIT SCORE RANGES (FICO)**
   - Look for: Credit Tier, FICO Score, Credit Score, Beacon Score
   - "720+" means minFico=720, omit maxFico
   - "680-719" means minFico=680, maxFico=719
   - "Sub-prime" or "Deep" usually means minFico around 500-580

3. **LOAN TERMS (months)**
   - Look for: Term, Max Term, Loan Term, Months
   - "Up to 84 months" = maxTerm=84
   - "60-72 months" = minTerm=60, maxTerm=72

4. **VEHICLE RESTRICTIONS**
   - Model Year: "2019+", "Within 5 years", "2020-2024"
   - Mileage: "Under 100K", "Max 80,000 miles"
   - Age: "Vehicles 7 years or newer" = maxAge=7

5. **INCOME/PTI REQUIREMENTS**
   - "Minimum $2,000/month gross income" = minIncome=2000
   - "Max PTI 18%" = maxPti=18

6. **BOOK VALUE SOURCE**
   - "Trade value", "Clean Trade", "Average Trade" = bookValueSource: "Trade"
   - "Retail value", "Retail Book" = bookValueSource: "Retail"
   - If no mention, default to "Trade"

**SCAN ALL PAGES**: Go through EVERY page of this PDF document. Different lenders may appear on different pages.

**IDENTIFY ALL LENDERS**: Look for bank names, credit union names, lender logos, or headers that indicate different financial institutions. Common patterns include:
- Bank/Credit Union name at the top of a page
- "Rate Sheet" or "Program Guide" headers with lender branding
- Footer or header text identifying the lender
- Separate sections or pages for different banks

**DATA ACCURACY RULES**:
- NEVER hallucinate or make up data
- If a field is not explicitly stated, OMIT it (don't guess)
- If a range says "600+", set minFico=600, omit maxFico
- If max mileage is "150K", set maxMileage=150000
- Convert all percentages to numbers (e.g., "125%" LTV = maxLtv: 125)
- Model year ranges like "2018-2024" = minYear=2018, maxYear=2024
- If it says "No vehicles older than 7 years", set maxAge=7

**COMMON RATE SHEET TABLE FORMATS**:
| Credit Tier | FICO | Max LTV | Max Term | Rate |
Look for these column headers and extract each row as a tier.

**OUTPUT REQUIREMENTS**:
Return a JSON object with a "lenders" array containing ALL extracted lender profiles.
Each lender profile must have at minimum: name and tiers array.
For EACH tier, try to capture: name, minFico/maxFico, maxLtv, maxTerm, minYear/maxYear, maxMileage

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
    }
  ]
}

NOW EXTRACT ALL LENDERS FROM ALL PAGES OF THIS DOCUMENT:`;

// Grounding enhancement prompt for filling in missing data
const getGroundingPrompt = (lenderName: string, existingData: Partial<LenderProfile>) => `You are an automotive finance expert. I have partial data for the lender "${lenderName}" that is missing critical information needed for deal calculations.

**EXISTING EXTRACTED DATA**:
${JSON.stringify(existingData, null, 2)}

**YOUR TASK**: Using your knowledge of standard automotive lending practices and this specific lender (if you know about them), suggest reasonable default values for any missing critical fields. Focus especially on:

1. **maxLtv** - If missing, what is a typical max LTV for this type of lender/tier?
   - Prime lenders (720+): typically 110-130%
   - Near-prime (660-719): typically 100-120%
   - Subprime (<660): typically 90-110%

2. **maxTerm** - If missing, what's typical for this vehicle age/tier?
   - New vehicles: 72-84 months typical
   - Used (2-5 years): 60-72 months typical
   - Older used (6+ years): 48-60 months typical

3. **maxMileage** - If missing, suggest reasonable limits
   - Most lenders: 100,000-150,000 mile cap

4. **minYear** - If missing, calculate from typical age limits
   - Most lenders finance vehicles 7-10 years old max

**IMPORTANT**: 
- Only fill in values you are reasonably confident about based on industry standards
- Mark clearly which values are your suggestions vs extracted
- If you truly don't know, leave undefined

Return the enhanced lender profile with suggested values filled in where appropriate.`;

export const processLenderSheet = async (
  file: File,
  onProgress?: ProgressCallback
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
  
  // Stage 1: Upload file
  onProgress?.({
    stage: 'uploading',
    progress: 10,
    message: 'Reading and encoding PDF file...',
    currentFile: file.name,
  });
  
  const base64Data = await fileToBase64(file);
  
  onProgress?.({
    stage: 'uploading',
    progress: 20,
    message: 'File encoded successfully. Starting AI extraction...',
    currentFile: file.name,
  });

  try {
    // Stage 2: Initial extraction
    onProgress?.({
      stage: 'extracting',
      progress: 30,
      message: `AI (${PRIMARY_MODEL}) is scanning all pages for lender data...`,
      currentFile: file.name,
    });
    
    console.log(`[AI Lender Upload] Starting extraction with model: ${PRIMARY_MODEL}`);
    console.log(`[AI Lender Upload] File: ${file.name}, Size: ${(file.size / 1024).toFixed(1)}KB`);
    
    const response = await ai.models.generateContent({
      model: PRIMARY_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: "application/pdf", data: base64Data } },
          { text: getExtractionPrompt() },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: MULTI_LENDER_RESPONSE_SCHEMA,
      },
    });

    onProgress?.({
      stage: 'extracting',
      progress: 50,
      message: 'AI extraction complete. Parsing results...',
      currentFile: file.name,
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
        parsed = { lenders: [parsed] };
      } else {
        throw new Error("No lender data found in the document.");
      }
    }

    // Stage 3: Validate and normalize
    onProgress?.({
      stage: 'validating',
      progress: 60,
      message: `Found ${parsed.lenders.length} lender(s). Validating data...`,
      currentFile: file.name,
    });

    // Normalize all lender profiles
    let normalizedLenders = parsed.lenders
      .map((lender: any) => normalizeProfile(lender))
      .filter((lender: Partial<LenderProfile>) => lender.name && lender.name !== "Unnamed Lender");

    if (normalizedLenders.length === 0) {
      throw new Error("No valid lender data could be extracted from the document.");
    }

    // Stage 4: Check for missing critical data and enhance if needed
    const lendersNeedingEnhancement = normalizedLenders.filter(profileNeedsEnhancement);
    
    if (lendersNeedingEnhancement.length > 0) {
      onProgress?.({
        stage: 'enhancing',
        progress: 70,
        message: `Enhancing ${lendersNeedingEnhancement.length} lender(s) with missing data using industry knowledge...`,
        currentFile: file.name,
      });

      // Enhance lenders with missing critical data
      const enhancedLenders = await Promise.all(
        normalizedLenders.map(async (lender, index) => {
          if (!profileNeedsEnhancement(lender)) {
            return lender;
          }

          onProgress?.({
            stage: 'enhancing',
            progress: 70 + Math.floor((index / normalizedLenders.length) * 20),
            message: `Enhancing "${lender.name}" with industry-standard values...`,
            currentFile: file.name,
          });

          try {
            // Use grounding to fill in missing data
            console.log(`[AI Lender Upload] Enhancing lender: ${lender.name}`);
            const enhanceResponse = await ai.models.generateContent({
              model: PRIMARY_MODEL,
              contents: getGroundingPrompt(lender.name || 'Unknown', lender),
              config: {
                responseMimeType: "application/json",
                responseSchema: LENDER_PROFILE_SCHEMA,
              },
            });

            const enhanceText = enhanceResponse.text;
            if (enhanceText) {
              try {
                const enhanced = JSON.parse(enhanceText);
                // Merge enhanced data with original, preferring original non-undefined values
                const mergedTiers = (lender.tiers || []).map((tier, tierIndex) => {
                  const enhancedTier = enhanced.tiers?.[tierIndex] || {};
                  return {
                    ...enhancedTier,
                    ...Object.fromEntries(
                      Object.entries(tier).filter(([_, v]) => v !== undefined)
                    ),
                  };
                });

                return {
                  ...lender,
                  ...Object.fromEntries(
                    Object.entries(enhanced).filter(([key, v]) => 
                      v !== undefined && (lender as any)[key] === undefined && key !== 'tiers'
                    )
                  ),
                  tiers: mergedTiers,
                };
              } catch {
                return lender; // Keep original if enhancement fails
              }
            }
            return lender;
          } catch {
            return lender; // Keep original if enhancement fails
          }
        })
      );

      normalizedLenders = enhancedLenders;
    }

    // Stage 5: Final validation
    onProgress?.({
      stage: 'complete',
      progress: 95,
      message: `Successfully extracted ${normalizedLenders.length} lender(s) with ${normalizedLenders.reduce((acc, l) => acc + (l.tiers?.length || 0), 0)} total tiers.`,
      currentFile: file.name,
    });

    // Add data quality summary
    const qualitySummary = normalizedLenders.map(lender => {
      const tiersWithLtv = lender.tiers?.filter(t => t.maxLtv !== undefined).length || 0;
      const tiersWithTerm = lender.tiers?.filter(t => t.maxTerm !== undefined).length || 0;
      const totalTiers = lender.tiers?.length || 0;
      return {
        name: lender.name,
        totalTiers,
        tiersWithLtv,
        tiersWithTerm,
        dataQuality: totalTiers > 0 ? Math.round(((tiersWithLtv + tiersWithTerm) / (totalTiers * 2)) * 100) : 0,
      };
    });
    
    console.log('Extraction quality summary:', qualitySummary);

    onProgress?.({
      stage: 'complete',
      progress: 100,
      message: 'Extraction complete!',
      currentFile: file.name,
    });

    return normalizedLenders;
  } catch (error: any) {
    console.error("[AI Lender Upload] Processing Error:", error);
    console.error("[AI Lender Upload] Error details:", {
      name: error?.name,
      message: error?.message,
      status: error?.status,
      statusText: error?.statusText,
    });
    
    let userMessage = error?.message || String(error);
    
    // Provide more helpful error messages
    if (userMessage.includes("404") || userMessage.includes("not found")) {
      userMessage = `Model "${PRIMARY_MODEL}" not available. Please check API access.`;
    } else if (userMessage.includes("403") || userMessage.includes("permission")) {
      userMessage = "API access denied. Please check your API key permissions.";
    } else if (userMessage.includes("429") || userMessage.includes("quota")) {
      userMessage = "API rate limit exceeded. Please try again in a few moments.";
    } else if (userMessage.includes("500") || userMessage.includes("internal")) {
      userMessage = "AI service temporarily unavailable. Please try again.";
    }
    
    onProgress?.({
      stage: 'error',
      progress: 0,
      message: `Error: ${userMessage}`,
      currentFile: file.name,
    });
    throw new Error(`Failed to extract lender data: ${userMessage}`);
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
    console.log(`[AI Deal Assistant] Analyzing deal with model: ${PRIMARY_MODEL}`);
    const response = await ai.models.generateContent({
      model: PRIMARY_MODEL,
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
