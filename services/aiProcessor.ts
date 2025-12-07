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

// Perplexity Sonar API for deep internet research when Google grounding isn't enough
// API key should be set via environment variable VITE_PERPLEXITY_API_KEY
const PERPLEXITY_API_KEY = import.meta.env.VITE_PERPLEXITY_API_KEY || "";
const PERPLEXITY_MODEL = "sonar-pro"; // Best reasoning + real-time internet search

// Retry configuration for API resilience
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1 second base delay

/**
 * Retry a function with exponential backoff
 * Delays: 1s, 2s, 4s for retries 1, 2, 3
 */
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  context: string = "API call"
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on certain errors
      const errorMessage = lastError.message.toLowerCase();
      if (
        errorMessage.includes("invalid api key") ||
        errorMessage.includes("unauthorized") ||
        errorMessage.includes("quota exceeded") ||
        errorMessage.includes("rate limit")
      ) {
        console.error(`[${context}] Non-retryable error:`, lastError.message);
        throw lastError;
      }

      if (attempt < retries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[${context}] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
          lastError.message
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`[${context}] All ${retries + 1} attempts failed`);
  throw lastError;
};

// Progress callback type for UI updates
export type ProcessingProgress = {
  stage: "uploading" | "extracting" | "validating" | "enhancing" | "complete" | "error";
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
// Includes confidence scoring and source tracking for transparency
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
      description: "Minimum LTV percentage for this tier. Omit if not specified.",
    },
    maxTerm: {
      type: Type.INTEGER,
      description: "Maximum loan term in months for this tier. Omit if not specified.",
    },
    minYear: {
      type: Type.INTEGER,
      description: "Minimum vehicle model year for this tier. Omit if not specified.",
    },
    maxYear: {
      type: Type.INTEGER,
      description: "Maximum vehicle model year for this tier. Omit if not specified.",
    },
    maxAge: {
      type: Type.INTEGER,
      description:
        "Maximum vehicle age in years (e.g., 'within 7 years' = 7). Use this to calculate minYear.",
    },
    minMileage: {
      type: Type.INTEGER,
      description: "Minimum vehicle mileage for this tier. Omit if not specified.",
    },
    maxMileage: {
      type: Type.INTEGER,
      description: "Maximum vehicle mileage for this tier. Omit if not specified.",
    },
    minTerm: {
      type: Type.INTEGER,
      description: "Minimum loan term in months for this tier. Omit if not specified.",
    },
    minAmountFinanced: {
      type: Type.NUMBER,
      description: "Minimum amount financed for this tier. Omit if not specified.",
    },
    maxAmountFinanced: {
      type: Type.NUMBER,
      description: "Maximum amount financed for this tier. Omit if not specified.",
    },
    baseInterestRate: {
      type: Type.NUMBER,
      description:
        "Base interest rate or buy rate for this tier (as percentage, e.g., 5.99). Omit if not specified.",
    },
    rateAdder: {
      type: Type.NUMBER,
      description:
        "Additional rate adjustment added to base rate (as percentage points, e.g., 1.5 for +1.5%). Omit if not specified.",
    },
    maxAdvance: {
      type: Type.NUMBER,
      description:
        "Maximum advance amount in dollars (different from LTV - this is a hard dollar cap). Omit if not specified.",
    },
    // CRITICAL: Front-End vs OTD LTV distinction
    frontEndLtv: {
      type: Type.NUMBER,
      description:
        "Maximum FRONT-END LTV - the advance percentage BEFORE backend products (GAP, warranty) are added. Look for 'Front-end', 'Base LTV', 'Invoice LTV'. This is typically lower than OTD LTV.",
    },
    otdLtv: {
      type: Type.NUMBER,
      description:
        "Maximum OUT-THE-DOOR (OTD) LTV - the total advance percentage INCLUDING all backend products, fees, and taxes. Look for 'OTD', 'Out the Door', 'Total LTV', 'All-in LTV'. This is typically the higher number.",
    },
    maxRate: {
      type: Type.NUMBER,
      description:
        "Maximum interest rate cap for this tier (as percentage, e.g., 24.99). Omit if not specified.",
    },
    maxBackend: {
      type: Type.NUMBER,
      description:
        "Maximum dollar amount for backend products (GAP, warranty, paint protection, etc.) allowed in this tier. Look for 'Max Backend', 'Product Cap', 'Max add-ons'.",
    },
    maxBackendPercent: {
      type: Type.NUMBER,
      description:
        "Maximum backend products as a PERCENTAGE of amount financed (e.g., 15 for 15%). Some lenders cap backend as a % rather than dollar amount.",
    },
    minIncome: {
      type: Type.NUMBER,
      description:
        "Minimum monthly income required for THIS TIER specifically (if different from lender-level). Look for tier-specific income requirements.",
    },
    maxPti: {
      type: Type.NUMBER,
      description:
        "Maximum Payment-to-Income ratio for THIS TIER specifically (as percentage). Look for PTI limits in tier footnotes.",
    },
    maxDti: {
      type: Type.NUMBER,
      description:
        "Maximum Debt-to-Income ratio for THIS TIER specifically (as percentage). Look for DTI limits in tier sections.",
    },
    excludedMakes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "List of vehicle makes NOT eligible for this tier/program. Look for 'Excluded:', 'Not accepted:', 'Luxury makes excluded'. E.g., ['Maserati', 'Lotus', 'McLaren']",
    },
    includedMakes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "For captive lenders: ONLY these makes are eligible. E.g., Toyota Financial only finances ['Toyota', 'Lexus'].",
    },
    vehicleType: {
      type: Type.STRING,
      description:
        "Vehicle type restriction: 'new', 'used', 'certified', or 'all'. Omit if not specified.",
    },
    // Confidence scoring for extraction quality
    confidence: {
      type: Type.NUMBER,
      description:
        "Confidence score 0.0-1.0 for this tier's data. 1.0 = directly read from table, 0.7 = inferred from context, 0.5 = estimated from document structure.",
    },
    extractionSource: {
      type: Type.STRING,
      description:
        "Where this tier data came from: 'table', 'text', 'header', 'inferred'. Helps track accuracy.",
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
      description: "The overall minimum monthly income required. Omit if not specified.",
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
      description: "Any special stipulations, requirements, or notes about this lender's policies.",
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
      description:
        "An array of ALL lender profiles found in the document. Each bank/credit union is a separate entry.",
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
            description: "VIN of a better fitting vehicle from inventory. Omit if none.",
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
  const maxAge = normalizeNumber(tier.maxAge);
  if (!minYear && maxAge) {
    minYear = calculateMinYearFromAge(maxAge);
  }

  // Build the tier object with ALL fields from the schema
  // This ensures no extracted data is lost during normalization
  const normalized: LenderTier = {
    // Core identification
    name: typeof tier.name === "string" ? tier.name : "Unnamed Tier",

    // Credit score range
    minFico: normalizeNumber(tier.minFico),
    maxFico: normalizeNumber(tier.maxFico),

    // Vehicle year restrictions
    minYear,
    maxYear: normalizeNumber(tier.maxYear),
    maxAge, // Preserve original maxAge value

    // Mileage restrictions
    minMileage: normalizeNumber(tier.minMileage),
    maxMileage: normalizeNumber(tier.maxMileage),

    // Term restrictions
    minTerm: normalizeNumber(tier.minTerm),
    maxTerm: normalizeNumber(tier.maxTerm),

    // LTV/Advance - CRITICAL fields that were being lost!
    maxLtv: normalizeNumber(tier.maxLtv),
    minLtv: normalizeNumber(tier.minLtv),
    frontEndLtv: normalizeNumber(tier.frontEndLtv), // Front-end LTV (before backend)
    otdLtv: normalizeNumber(tier.otdLtv), // OTD LTV (after backend products)
    maxAdvance: normalizeNumber(tier.maxAdvance), // Dollar cap

    // Amount financed restrictions
    minAmountFinanced: normalizeNumber(tier.minAmountFinanced),
    maxAmountFinanced: normalizeNumber(tier.maxAmountFinanced),

    // Interest rate info
    baseInterestRate: normalizeNumber(tier.baseInterestRate),
    rateAdder: normalizeNumber(tier.rateAdder),
    maxRate: normalizeNumber(tier.maxRate),

    // Backend product limits - CRITICAL for dealer profitability!
    maxBackend: normalizeNumber(tier.maxBackend),
    maxBackendPercent: normalizeNumber(tier.maxBackendPercent),

    // Vehicle type - CRITICAL for New/Used/CPO filtering!
    vehicleType: typeof tier.vehicleType === "string" ? tier.vehicleType : undefined,

    // Make restrictions (for captive lenders)
    excludedMakes: Array.isArray(tier.excludedMakes) ? tier.excludedMakes : undefined,
    includedMakes: Array.isArray(tier.includedMakes) ? tier.includedMakes : undefined,

    // Tier-level income/DTI requirements (some lenders have per-tier)
    minIncome: normalizeNumber(tier.minIncome),
    maxPti: normalizeNumber(tier.maxPti),
    maxDti: normalizeNumber(tier.maxDti),

    // Extraction metadata - helps track data quality
    confidence: normalizeNumber(tier.confidence),
    extractionSource: typeof tier.extractionSource === "string" ? tier.extractionSource : undefined,
  };

  return normalized;
};

// Check if a tier has critical missing data
const tierHasMissingCriticalData = (tier: LenderTier): boolean => {
  // For calculations, we really need maxLtv AND maxTerm at minimum
  // Also check for FICO which is essential for matching
  const missingLtv = tier.maxLtv === undefined;
  const missingTerm = tier.maxTerm === undefined;
  const missingFico = tier.minFico === undefined && tier.maxFico === undefined;

  // If missing any 2 of these 3 critical fields, needs enhancement
  const missingCount = [missingLtv, missingTerm, missingFico].filter(Boolean).length;
  return missingCount >= 2;
};

// More aggressive check - does this tier have good enough data?
const tierNeedsMoreData = (tier: LenderTier): boolean => {
  // Check all important fields
  const hasLtv = tier.maxLtv !== undefined;
  const hasTerm = tier.maxTerm !== undefined;
  const hasFico = tier.minFico !== undefined || tier.maxFico !== undefined;
  const hasYear = tier.minYear !== undefined || tier.maxYear !== undefined;
  const hasMileage = tier.maxMileage !== undefined;

  // If missing more than 2 of these 5 fields, needs more data
  const hasCount = [hasLtv, hasTerm, hasFico, hasYear, hasMileage].filter(Boolean).length;
  return hasCount < 3;
};

// Check if a profile needs enhancement
const profileNeedsEnhancement = (profile: Partial<LenderProfile>): boolean => {
  if (!profile.tiers || profile.tiers.length === 0) return true;
  // Check if any tier is missing critical data
  return profile.tiers.some(tierHasMissingCriticalData);
};

// More aggressive check for profiles that need internet research
const profileNeedsDeepResearch = (profile: Partial<LenderProfile>): boolean => {
  if (!profile.tiers || profile.tiers.length === 0) return true;
  // If more than half of tiers need more data, do deep research
  const tiersNeedingData = profile.tiers.filter(tierNeedsMoreData).length;
  return tiersNeedingData > profile.tiers.length / 2;
};

// ═══════════════════════════════════════════════════════════════════════════════
// PERPLEXITY SONAR API - Deep Internet Research
// ═══════════════════════════════════════════════════════════════════════════════

interface PerplexityMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface PerplexityResponse {
  id: string;
  model: string;
  choices: {
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
  }[];
  citations?: string[];
}

/**
 * Search the internet using Perplexity Sonar for accurate lender data
 * This is our most powerful research tool - uses real-time web search
 */
const searchWithPerplexity = async (
  lenderName: string,
  existingData: Partial<LenderProfile>
): Promise<Partial<LenderProfile> | null> => {
  console.log(`[Perplexity Sonar] Searching for: ${lenderName}`);

  const systemPrompt = `You are an expert automotive finance researcher specializing in indirect auto lending programs. Your job is to find accurate, current lending program details for auto lenders.

CRITICAL INSTRUCTIONS:
1. Search for the EXACT lender name provided - look for their dealer/indirect auto lending programs
2. Look for official rate sheets, lending matrices, dealer guides, and program announcements
3. Find specific numbers: Max LTV percentages, Max terms, FICO requirements, vehicle restrictions, rate buy-down options
4. Only report data you find from reliable sources - do NOT make up numbers
5. If you can't find specific data, say so - don't guess
6. Look for effective dates on rate sheets to determine currency of information

Return your findings as a JSON object with this EXACT structure:
{
  "name": "Lender Name",
  "effectiveDate": "2024-01-15",
  "minIncome": 2000,
  "maxPti": 18,
  "bookValueSource": "Trade",
  "tiers": [
    {
      "name": "Tier A / Prime (720-850)",
      "minFico": 720,
      "maxFico": 850,
      "minYear": 2019,
      "maxYear": 2025,
      "maxAge": 7,
      "minMileage": 0,
      "maxMileage": 100000,
      "minTerm": 12,
      "maxTerm": 84,
      "maxLtv": 125,
      "frontEndLtv": 110,
      "otdLtv": 125,
      "minAmountFinanced": 7500,
      "maxAmountFinanced": 100000,
      "maxAdvance": 150,
      "baseInterestRate": 5.99,
      "rateAdder": 0,
      "maxBackend": 2500,
      "maxBackendPercent": 15
    }
  ],
  "sources": ["URL or source name"]
}

FIELD DEFINITIONS:
- effectiveDate: When the rate sheet became effective (YYYY-MM-DD format)
- maxLtv: Generic LTV limit if type is unspecified
- frontEndLtv: Max Advance BEFORE backend products (hard metal/invoice advance)
- otdLtv: Max "Out The Door" LTV including taxes, fees, and products
- maxBackend: Max dollar amount for GAP/Warranty/etc.
- maxBackendPercent: Max backend as % of amount financed
- maxAge: Maximum vehicle age in years (e.g., 7 means up to 7 years old)
- maxAdvance: Maximum advance over invoice/book value (percentage or flat amount)
- minAmountFinanced/maxAmountFinanced: Loan amount limits
- baseInterestRate: The buy rate or base APR for dealers
- rateAdder: Additional rate markup allowed

Only include fields where you found actual data. Omit fields you couldn't verify.`;

  const userPrompt = `Research the INDIRECT/DEALER auto lending programs for: "${lenderName}"

I already have this partial data extracted from their rate sheet:
${JSON.stringify(existingData, null, 2)}

Please search for their current auto loan programs and find these SPECIFIC details:
1. Rate sheet effective date (when was this program published?)
2. Maximum LTV (Loan-to-Value) percentages by credit tier - Look for BOTH "Front-End/Advance" and "OTD/Total LTV" limits
3. Maximum and minimum loan terms in months
4. FICO/credit score requirements and tier breakdowns
5. Vehicle age restrictions (min/max model year OR max age in years)
6. Maximum mileage limits
7. Minimum and maximum financed amount limits
8. Maximum advance over book/invoice value
9. Buy rates or base interest rates by tier
10. Any income or PTI (payment-to-income) requirements
11. Backend product limits (Max GAP, Warranty, or total backend amounts/percentages)

Focus on finding the specific numbers that are MISSING from my existing data.
Return ONLY a valid JSON object with the lender data - no explanatory text.`;

  try {
    const response = await retryWithBackoff(
      async () => {
        const res = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: PERPLEXITY_MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.1, // Low temperature for factual accuracy
            max_tokens: 4000,
            return_citations: true,
            search_recency_filter: "year", // Focus on recent data
          }),
        });

        if (!res.ok) {
          // Throw error to trigger retry for server errors
          if (res.status >= 500 || res.status === 429) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          // For client errors, don't retry
          console.error(`[Perplexity Sonar] API error: ${res.status} ${res.statusText}`);
          return null;
        }
        return res;
      },
      MAX_RETRIES,
      "Perplexity Sonar"
    );

    if (!response) {
      return null;
    }

    const data: PerplexityResponse = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error("[Perplexity Sonar] No content in response");
      return null;
    }

    console.log(`[Perplexity Sonar] Got response with ${data.citations?.length || 0} citations`);
    if (data.citations && data.citations.length > 0) {
      console.log("[Perplexity Sonar] Sources:", data.citations.slice(0, 3));
    }

    // Extract JSON from the response (it might be wrapped in markdown)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonStr = jsonMatch[1].trim();
    } else {
      // Try to find JSON object directly
      const objMatch = content.match(/\{[\s\S]*\}/);
      if (objMatch) {
        jsonStr = objMatch[0];
      }
    }

    try {
      const parsed = JSON.parse(jsonStr);
      console.log(
        `[Perplexity Sonar] Successfully parsed lender data for: ${parsed.name || lenderName}`
      );
      return parsed;
    } catch (parseError) {
      console.error("[Perplexity Sonar] Failed to parse JSON:", parseError);
      console.log("[Perplexity Sonar] Raw content:", content.substring(0, 500));
      return null;
    }
  } catch (error) {
    console.error("[Perplexity Sonar] Request failed:", error);
    return null;
  }
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

// Helper function to merge lender data from search results into existing profile
const mergeLenderData = (
  original: LenderProfile,
  enhanced: Partial<LenderProfile>
): LenderProfile => {
  const merged = { ...original };

  // Only update fields that are missing or empty in original
  if (
    enhanced.minIncome &&
    enhanced.minIncome > 0 &&
    (!original.minIncome || original.minIncome === 0)
  ) {
    merged.minIncome = enhanced.minIncome;
  }

  if (enhanced.maxPti && enhanced.maxPti > 0 && (!original.maxPti || original.maxPti === 0)) {
    merged.maxPti = enhanced.maxPti;
  }

  if (
    enhanced.bookValueSource &&
    (!original.bookValueSource || original.bookValueSource === "Trade")
  ) {
    merged.bookValueSource = enhanced.bookValueSource;
  }

  // Merge effectiveDate if available
  if (enhanced.effectiveDate && !original.effectiveDate) {
    merged.effectiveDate = enhanced.effectiveDate;
  }

  // Merge tiers - update existing tiers and add new ones from enhancement
  if (enhanced.tiers && enhanced.tiers.length > 0) {
    const originalTiers = original.tiers || [];
    const mergedTiers: typeof originalTiers = [];
    const matchedEnhancedIndices = new Set<number>();

    // First, merge existing original tiers with matching enhanced tiers
    for (const originalTier of originalTiers) {
      const enhancedIndex = enhanced.tiers.findIndex(
        (et, idx) =>
          !matchedEnhancedIndices.has(idx) &&
          (et.name?.toLowerCase() === originalTier.name?.toLowerCase() ||
            (et.minFico === originalTier.minFico && et.maxFico === originalTier.maxFico))
      );

      if (enhancedIndex !== -1) {
        matchedEnhancedIndices.add(enhancedIndex);
        const matchingEnhanced = enhanced.tiers[enhancedIndex];
        if (matchingEnhanced) {
          mergedTiers.push({
            ...originalTier,
            // Fill in missing values from enhanced data using correct property names
            maxLtv: originalTier.maxLtv || matchingEnhanced.maxLtv,
            maxTerm: originalTier.maxTerm || matchingEnhanced.maxTerm,
            minTerm: originalTier.minTerm || matchingEnhanced.minTerm,
            maxMileage: originalTier.maxMileage || matchingEnhanced.maxMileage,
            minMileage: originalTier.minMileage || matchingEnhanced.minMileage,
            maxAge: originalTier.maxAge || matchingEnhanced.maxAge,
            minAmountFinanced: originalTier.minAmountFinanced || matchingEnhanced.minAmountFinanced,
            maxAmountFinanced: originalTier.maxAmountFinanced || matchingEnhanced.maxAmountFinanced,
            maxAdvance: originalTier.maxAdvance || matchingEnhanced.maxAdvance,
            baseInterestRate: originalTier.baseInterestRate || matchingEnhanced.baseInterestRate,
            rateAdder: originalTier.rateAdder || matchingEnhanced.rateAdder,
            minYear: originalTier.minYear || matchingEnhanced.minYear,
            maxYear: originalTier.maxYear || matchingEnhanced.maxYear,
          });
        } else {
          mergedTiers.push(originalTier);
        }
      } else {
        mergedTiers.push(originalTier);
      }
    }

    // Then, add any new tiers from enhanced that weren't matched
    for (let i = 0; i < enhanced.tiers.length; i++) {
      if (!matchedEnhancedIndices.has(i)) {
        const newTier = enhanced.tiers[i];
        // Only add if it exists and has meaningful data (at least a name or FICO range)
        if (newTier && (newTier.name || (newTier.minFico && newTier.maxFico))) {
          mergedTiers.push(newTier);
        }
      }
    }

    merged.tiers = mergedTiers;
  }

  return merged;
};

// Enhanced extraction prompt with chain-of-thought reasoning for maximum accuracy
const getExtractionPrompt =
  () => `You are an expert AI data extraction specialist for automotive dealer finance departments.

═══════════════════════════════════════════════════════════════════════════════
CRITICAL: OCR & DOCUMENT PROCESSING INSTRUCTIONS
═══════════════════════════════════════════════════════════════════════════════

**HANDLE ALL PDF TYPES:**
1. **Scanned/Image PDFs**: Use OCR to read text from images. Look carefully at:
   - Faded or low-contrast text
   - Handwritten annotations
   - Watermarks that may contain version/date info
   - Stamps or seals with lender names

2. **Low Quality Documents**: 
   - If text is blurry, use context to infer characters (e.g., "125%" vs "12S%")
   - Tables with broken lines - infer structure from alignment
   - OCR errors: "0" vs "O", "1" vs "l", "5" vs "S"

3. **Multi-Page Documents**:
   - SCAN EVERY SINGLE PAGE - don't stop at page 1
   - Different lenders may appear on different pages
   - Footer/header may have different lender branding per section
   - Continuation tables on subsequent pages belong to same lender

4. **Complex Layouts**:
   - Multi-column rate sheets: read left-to-right, then top-to-bottom
   - Rotated/landscape pages: orient text properly before reading
   - Nested tables: parent table defines context (e.g., "New Vehicles" section)
   - Merged cells: apply value to all cells in the merge

**CHAIN-OF-THOUGHT EXTRACTION PROCESS**

Follow these reasoning steps carefully to ensure 100% accurate data extraction:

═══════════════════════════════════════════════════════════════════════════════
STEP 1: DOCUMENT ANALYSIS (Think through this first)
═══════════════════════════════════════════════════════════════════════════════

Before extracting any data, analyze the document structure:

1. **Document Type**: What type of document is this?
   - Rate Sheet / Rate Matrix (structured tables with tiers)
   - Program Guide (narrative text with embedded values)
   - Quick Reference Card (condensed data)
   - Multi-lender compilation (multiple banks on one sheet) *** VERY COMMON ***

2. **Lender Identification**: Scan ALL pages for lender names
   - Look at headers, footers, logos, and branding
   - Note the page number(s) where each lender appears
   - List every unique lender/bank/credit union found

3. **Table Structure Analysis**: For each table found:
   - What are the column headers?
   - What do rows represent? (credit tiers, vehicle types, terms)
   - Are there nested tables or matrices?

═══════════════════════════════════════════════════════════════════════════════
⚠️ CRITICAL: MULTI-LENDER DETECTION - DO NOT SKIP ANY BANKS ⚠️
═══════════════════════════════════════════════════════════════════════════════

**DEALER RATE SHEETS COMMONLY CONTAIN MULTIPLE LENDERS!**

This is a compilation document from an automotive dealer. It likely contains 
programs from MANY different banks, credit unions, and finance companies.

**HOW TO IDENTIFY SEPARATE LENDERS:**

1. **Page Headers/Footers**: Each page may have a different bank name/logo
2. **Section Headers**: "Wells Fargo", "Capital One", "Ally Financial", etc.
3. **Table Titles**: Look above each rate table for the lender name
4. **Logo Changes**: Different logos = different lenders
5. **Color/Branding Changes**: Often each lender section has different styling
6. **Page Breaks**: New lender often starts on new page
7. **"Continued" Markers**: Same lender may span multiple pages

**COMMON LENDER NAMES TO LOOK FOR:**
- Banks: Chase, Wells Fargo, Bank of America, Capital One, Ally, Santander
- Credit Unions: Navy Federal, PenFed, Local CU names, State Employee CUs
- Captives: Toyota Financial, Honda Financial, Ford Credit, GM Financial
- Subprime: Westlake, DriveTime, Exeter, Credit Acceptance

**CRITICAL RULE**: If you see a new bank/credit union name ANYWHERE in the 
document, that's a SEPARATE lender object. Don't merge different banks together!

**OUTPUT MUST INCLUDE ALL LENDERS FOUND** - The "lenders" array should contain 
one object per unique financial institution found in the document.

═══════════════════════════════════════════════════════════════════════════════
STEP 2: DATA MAPPING (Map document content to our schema)
═══════════════════════════════════════════════════════════════════════════════

Create a mental map of how document headers relate to our fields:

**LTV/Advance Fields:**
- "LTV", "Max LTV", "Advance", "Advance %" → maxLtv
- "Min Advance", "Floor" → minLtv
- If expressed as percentage (e.g., "125%"), convert to number (125)

**Credit Score Fields:**
- "FICO", "Credit Score", "Beacon", "Credit Tier" → minFico/maxFico
- "720+" means minFico=720, no maxFico
- "680-719" means minFico=680, maxFico=719
- "Super Prime", "A+", "Tier 1" → typically 720+
- "Subprime", "Deep", "Tier 6" → typically 500-580

**Term Fields:**
- "Term", "Max Term", "Months", "Loan Term" → maxTerm
- "84", "72", "60" in months context → maxTerm value
- If range "60-72", minTerm=60, maxTerm=72

**Vehicle Fields:**
- "Model Year", "Year" → minYear/maxYear
- "2019+" means minYear=2019
- "Within 5 years" → calculate minYear from current year
- "Max Age 7" → maxAge=7 (we'll calculate minYear)
- "Mileage", "Max Miles", "Odometer" → maxMileage
- "100K", "100,000" → maxMileage=100000
- "New", "Used", "CPO" → vehicleType

**Income/DTI Fields:**
- "Min Income", "Gross Monthly" → minIncome
- "PTI", "Payment to Income" → maxPti
- "DTI", "Debt to Income" → maxDti

═══════════════════════════════════════════════════════════════════════════════
STEP 3: EXTRACTION WITH CONFIDENCE SCORING
═══════════════════════════════════════════════════════════════════════════════

For each data point extracted, assign a confidence score:

**Confidence Levels:**
- 1.0: Directly read from a clear table cell or explicit text
- 0.9: Read from table but required minor interpretation
- 0.8: Inferred from surrounding context with high confidence
- 0.7: Calculated from other values (e.g., minYear from maxAge)
- 0.6: Reasonable inference from document structure
- 0.5 or below: Do NOT include - too uncertain

**Extraction Source:**
- "table": Extracted from a structured table
- "text": Extracted from narrative text
- "header": Found in section/page headers
- "inferred": Calculated or reasoned from other data

═══════════════════════════════════════════════════════════════════════════════
STEP 4: VALIDATION & CROSS-CHECK
═══════════════════════════════════════════════════════════════════════════════

Before outputting, validate your extraction:

1. **Logical Consistency:**
   - Is minFico < maxFico for each tier?
   - Is minYear < maxYear?
   - Is minTerm < maxTerm?
   - Are LTV values realistic (typically 80-150%)?

2. **Tier Completeness:**
   - Does each tier have a descriptive name?
   - Are credit tiers properly differentiated?
   - Are new vs used vehicle programs separated if applicable?

3. **Lender-Level Data:**
   - Is the lender name correct and complete?
   - Are global requirements (minIncome, maxPti) at lender level?
   - Is bookValueSource noted if mentioned?

═══════════════════════════════════════════════════════════════════════════════
CRITICAL EXTRACTION RULES
═══════════════════════════════════════════════════════════════════════════════

- **NEVER HALLUCINATE**: Only extract what is explicitly stated or clearly inferable
- **OMIT UNCERTAIN DATA**: If you're not confident, leave the field out
- **PRESERVE PRECISION**: "125%" → 125, "$2,000" → 2000, "80K" → 80000
- **SEPARATE NEW/USED**: If a sheet has different terms for new vs used, create separate tiers
- **EXTRACT ALL LENDERS**: Multiple banks in one PDF = multiple lenders in output
- **READ EVERY PAGE**: Lender data often continues on page 2, 3, etc.
- **LOOK FOR FOOTNOTES**: Special conditions often appear at bottom of tables
- **CHECK HEADERS/FOOTERS**: Lender names, effective dates, version numbers often here

═══════════════════════════════════════════════════════════════════════════════
🔍 MANDATORY FIELD EXTRACTION CHECKLIST - SCAN FOR EVERY FIELD!
═══════════════════════════════════════════════════════════════════════════════

**FOR EACH LENDER, YOU MUST SEARCH FOR ALL OF THESE FIELDS:**

📋 **LENDER-LEVEL FIELDS (search headers, footers, intro sections):**
□ name - Bank/credit union name (REQUIRED - look at logo, header, page title)
□ minIncome - Monthly income requirement (look for "$X,XXX/month", "Min Income")
□ maxPti - Payment-to-income ratio (look for "PTI", "payment ratio", "18% max")
□ maxDti - Debt-to-income ratio (look for "DTI", "debt ratio")
□ bookValueSource - "Trade", "Retail", "NADA", "KBB" (often in fine print)
□ maxBackend - Backend product limits (GAP, warranty max amounts)
□ stipulations - Special requirements or exclusions

📊 **TIER-LEVEL FIELDS (for EACH credit tier or program row):**
□ name - Descriptive tier name (REQUIRED - combine info like "Tier 1 New 720+")
□ minFico - Credit score floor (look for "720+", "680-719", "FICO", "Beacon")
□ maxFico - Credit score ceiling (upper bound of ranges)
□ maxLtv - MAX LTV percentage (CRITICAL - "Advance", "LTV", "Max %", look in columns!)
□ minLtv - Min LTV if specified
□ maxTerm - Maximum loan term in months ("84 mo", "72 months", column headers)
□ minTerm - Minimum term if specified
□ minYear - Vehicle model year minimum ("2020+", "MY 2019-present")
□ maxYear - Vehicle model year maximum (for used vehicles)
□ maxAge - Vehicle age limit ("7 years", "within 5 years" - calculate minYear)
□ maxMileage - Odometer limit ("100K", "80,000 miles", "*75k max")
□ minMileage - If specified
□ baseInterestRate - Buy rate or base APR (percentage in columns)
□ rateAdder - Term adjustments ("+0.25% over 72mo", rate bumps)
□ vehicleType - "new", "used", "certified" (section headers, row labels)
□ minAmountFinanced - Min loan amount
□ maxAmountFinanced - Max loan amount or advance cap
□ maxAdvance - Dollar cap on advance

**COMMON FIELD LOCATIONS (check ALL of these for EVERY field):**
┌────────────────────────────────────────────────────────────────────┐
│ LOCATION          │ WHAT TO LOOK FOR                              │
├────────────────────────────────────────────────────────────────────│
│ Column Headers    │ LTV, Advance, Term, Rate, FICO, Score         │
│ Row Labels        │ Credit tier names, vehicle types              │
│ Table Cells       │ Numeric values: 125%, 84, 720, $2000          │
│ Footnotes (*)     │ Mileage caps, exceptions, rate adjusters      │
│ Fine Print         │ Income requirements, DTI/PTI limits          │
│ Section Headers   │ "New Vehicles", "Used Program", bank names    │
│ Page Headers      │ Lender logos, document titles, dates          │
│ Page Footers      │ Version numbers, effective dates              │
│ Bullet Lists      │ Eligibility requirements, exclusions          │
│ Separate Pages    │ Each page may have different lender/program   │
└────────────────────────────────────────────────────────────────────┘

**CRITICAL: DO NOT LEAVE FIELDS EMPTY IF DATA EXISTS!**
- If you see a number in a column, figure out what field it belongs to
- If there's a footnote with "*", find what restriction it defines
- If a section says "Requirements:", extract ALL listed requirements
- Look at ALL rows in tables, not just headers
- Process EVERY page of the document

═══════════════════════════════════════════════════════════════════════════════
🔬 MULTI-PASS VERIFICATION PROTOCOL (Apple/Google Quality Standard)
═══════════════════════════════════════════════════════════════════════════════

**PASS 1: INITIAL EXTRACTION**
Go through the entire document and extract all visible data. Don't try to be perfect - capture everything you see.

**PASS 2: TABLE CROSS-REFERENCE**
For each table you found:
1. Read column headers left-to-right: What does each column represent?
2. Read row headers top-to-bottom: What does each row represent?
3. For each CELL: What value is there? Which field does it map to?
4. Cross-reference: Does the value make sense for that field?
   - LTV should be 80-200%
   - FICO should be 300-850
   - Term should be 12-84 months
   - Year should be 4-digit (2015-2030)
   - Mileage should be reasonable (50,000-200,000)

**PASS 3: FOOTNOTE / FINE PRINT SWEEP**
Go back through the document looking ONLY at:
- Footnotes (*, **, †, ‡)
- Small print sections
- "Notes:" or "Requirements:" blocks
- Asterisks anywhere in tables
- "Subject to" clauses
ADD any restrictions found to the appropriate tier's data.

**PASS 4: EDGE CASE DETECTION**
Look for commonly missed data:
- Rate adjustments for term ("+0.25% for 80+ months")
- Rate adjustments for mileage ("+0.5% over 80K miles")
- Rate adjustments for age ("+0.5% for 7+ year old vehicles")
- Min finance amounts ($5,000+ to finance)
- Max finance amounts ($50,000 cap)
- Max advance over book ($2,000 max over trade)
- Backend product limits ($3,000 max GAP+Warranty)

**PASS 5: SELF-VALIDATION CHECK**
Before outputting, verify your extraction:
□ Did I capture EVERY lender name I saw in the document?
□ Does each tier have at least one of: minFico, maxLtv, or maxTerm?
□ Are my LTV values reasonable (typically 80-150%)?
□ Do credit score ranges overlap correctly between tiers?
□ Did I include BOTH front-end LTV AND OTD LTV if specified?
□ Did I capture mileage restrictions from footnotes?
□ Did I capture year/age restrictions?
□ Did I capture income requirements?
□ Did I capture PTI/DTI limits?

═══════════════════════════════════════════════════════════════════════════════
💡 EXPERT REASONING: COMMON PATTERNS IN AUTO RATE SHEETS
═══════════════════════════════════════════════════════════════════════════════

**UNDERSTANDING RATE SHEET STRUCTURE:**
Most auto lender rate sheets follow this pattern:
1. Higher credit = Higher LTV allowed = More advance
2. Newer vehicles = Better terms than older vehicles
3. New vehicles = Better than used vehicles
4. Shorter terms = Better rates than longer terms
5. Lower mileage = Better terms than high mileage

**LTV TERMINOLOGY (CRITICAL - GET THESE RIGHT!):**
- "Advance" or "Max Advance" = Usually means max LTV percentage
- "Front-End Advance" = LTV before backend products added
- "OTD Advance" or "Total Advance" = Including all products/fees
- "Invoice Advance" = % of MSRP/invoice rather than book value
- "Max % of Trade" = Max LTV based on trade value
- "Max % of Retail" = Max LTV based on retail book value

**INTERPRETING FICO RANGES:**
- "A+" or "Tier 1" = Typically 720-850+
- "A" or "Tier 2" = Typically 680-719
- "B" or "Tier 3" = Typically 620-679
- "C" or "Tier 4" = Typically 580-619
- "680+" means minFico=680, no maxFico
- "620-679" means minFico=620, maxFico=679

**INTERPRETING VEHICLE RESTRICTIONS:**
- "Current + 1" = Current year and next year (new models)
- "Current - 7" = Vehicles from past 7 years
- "MY 2018+" = Model year 2018 or newer
- "100K max" = Max 100,000 miles
- Often footnoted restrictions override table values

═══════════════════════════════════════════════════════════════════════════════
🎯 FINAL OUTPUT REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

Your output MUST include:
1. **ALL lenders** found in the document (may be 1 or many)
2. **ALL tiers** for each lender (separate new/used if different terms)
3. **ALL restrictions** (mileage, year, income, DTI, PTI)
4. **BOTH LTV types** if specified (front-end and OTD)
5. **Confidence score** for each tier (how sure are you?)
6. **Extraction source** for each tier (where did you find it?)

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════════════════

Return a JSON object with a "lenders" array. Include confidence and extractionSource for transparency.

**Example Output:**
{
  "lenders": [
    {
      "name": "First Community Credit Union",
      "minIncome": 2000,
      "maxPti": 18,
      "bookValueSource": "Trade",
      "tiers": [
        {
          "name": "Tier 1 - New Vehicles (720+)",
          "minFico": 720,
          "maxLtv": 130,
          "maxTerm": 84,
          "minYear": 2024,
          "vehicleType": "new",
          "confidence": 0.95,
          "extractionSource": "table"
        },
        {
          "name": "Tier 1 - Used (720+, 2019-2023)",
          "minFico": 720,
          "maxLtv": 120,
          "maxTerm": 72,
          "minYear": 2019,
          "maxYear": 2023,
          "maxMileage": 100000,
          "vehicleType": "used",
          "confidence": 0.90,
          "extractionSource": "table"
        }
      ]
    }
  ]
}

NOW: Apply this chain-of-thought process to extract ALL lenders from ALL pages of this document:`;

// Grounding enhancement prompt for filling in missing data with reasoning
const getGroundingPrompt = (
  lenderName: string,
  existingData: Partial<LenderProfile>
) => `You are an automotive finance expert with deep knowledge of lender programs and industry standards.

**LENDER DATA TO ENHANCE: "${lenderName}"**

**EXISTING EXTRACTED DATA:**
${JSON.stringify(existingData, null, 2)}

═══════════════════════════════════════════════════════════════════════════════
CHAIN-OF-THOUGHT ENHANCEMENT PROCESS
═══════════════════════════════════════════════════════════════════════════════

**STEP 1: LENDER ANALYSIS**
Think about this lender:
- Is this a bank, credit union, or captive finance company?
- Credit unions typically offer more favorable terms to members
- Banks often have stricter requirements but wider vehicle eligibility
- Captive lenders (Toyota Financial, Ford Credit) focus on their brands

**STEP 2: TIER ANALYSIS**
For each tier with missing data, reason about:
- What credit score range is this tier serving? (Prime, Near-Prime, Subprime)
- Is it for new or used vehicles?
- What's a reasonable max LTV given the risk profile?
- What term limits make sense for the vehicle age/type?

**STEP 3: INDUSTRY STANDARD DEFAULTS**
Apply these well-established industry standards where data is missing:

**Max LTV by Credit Tier:**
| Credit Profile | Typical Max LTV |
|----------------|-----------------|
| Super Prime (780+) | 125-140% |
| Prime (720-779) | 115-130% |
| Near-Prime (660-719) | 100-120% |
| Subprime (580-659) | 90-105% |
| Deep Subprime (<580) | 80-95% |

**Max Term by Vehicle Type:**
| Vehicle Type | Typical Max Term |
|--------------|------------------|
| New Current Year | 72-84 months |
| New Prior Year | 72-84 months |
| Used 1-3 years | 72-75 months |
| Used 4-5 years | 60-72 months |
| Used 6-7 years | 48-60 months |
| Older than 7 years | 36-48 months |

**Max Mileage Standards:**
- Most prime lenders: 100,000-120,000 miles
- Subprime lenders: 120,000-150,000 miles
- Deep subprime: 150,000-175,000 miles

**Min Year Calculation:**
- Current year is ${new Date().getFullYear()}
- Most lenders: 7-10 year vehicle age limit
- Credit unions often more lenient: 10-12 years
- Subprime may accept older: 12-15 years

**STEP 4: APPLY ENHANCEMENTS**
For each missing field:
1. State your reasoning for the value you're suggesting
2. Set confidence to 0.5-0.7 (never >0.7 for enhanced data)
3. Set extractionSource to "inferred"

**OUTPUT REQUIREMENTS:**
Return the COMPLETE enhanced lender profile with:
- Original extracted values preserved (confidence unchanged)
- Missing critical fields filled with reasonable defaults
- Each filled field marked with confidence 0.5-0.7 and extractionSource "inferred"

Focus on filling: maxLtv, frontEndLtv, otdLtv, maxTerm, maxMileage, minYear, maxBackend (the most important for calculations).`;

export const processLenderSheet = async (
  file: File,
  onProgress?: ProgressCallback
): Promise<Partial<LenderProfile>[]> => {
  if (typeof window === "undefined") {
    throw new Error("AI processing is only available in the browser.");
  }
  const apiKey = process.env.API_KEY;
  if (!apiKey)
    throw new Error("AI is disabled. Call this via a server-side proxy with an API key.");

  const ai = new GoogleGenAI({ apiKey });

  // Stage 1: Upload file
  onProgress?.({
    stage: "uploading",
    progress: 10,
    message: "Reading and encoding PDF file...",
    currentFile: file.name,
  });

  const base64Data = await fileToBase64(file);

  onProgress?.({
    stage: "uploading",
    progress: 20,
    message: "File encoded successfully. Starting AI extraction...",
    currentFile: file.name,
  });

  try {
    // Stage 2: Initial extraction
    onProgress?.({
      stage: "extracting",
      progress: 30,
      message: `AI (${PRIMARY_MODEL}) is scanning all pages for lender data...`,
      currentFile: file.name,
    });

    console.log(`[AI Lender Upload] Starting extraction with model: ${PRIMARY_MODEL}`);
    console.log(`[AI Lender Upload] File: ${file.name}, Size: ${(file.size / 1024).toFixed(1)}KB`);

    const response = await retryWithBackoff(
      async () =>
        ai.models.generateContent({
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
        }),
      MAX_RETRIES,
      "Gemini extraction"
    );

    onProgress?.({
      stage: "extracting",
      progress: 50,
      message: "AI extraction complete. Parsing results...",
      currentFile: file.name,
    });

    const text = response.text;
    if (!text) throw new Error("No data returned from AI.");

    let parsed: any;
    try {
      // Try direct parse first (for clean JSON responses)
      parsed = JSON.parse(text);
    } catch (e) {
      // Fallback: extract JSON from markdown code blocks or surrounding text
      console.log("[AI] Direct parse failed, attempting extraction...");

      // Try to extract JSON from markdown code blocks
      const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonBlockMatch?.[1]) {
        try {
          parsed = JSON.parse(jsonBlockMatch[1].trim());
          console.log("[AI] Successfully extracted JSON from code block");
        } catch (e2) {
          // Continue to next fallback
        }
      }

      // Try to find JSON object directly (starts with { and ends with })
      if (!parsed) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch?.[0]) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
            console.log("[AI] Successfully extracted JSON object");
          } catch (e3) {
            // Continue to next fallback
          }
        }
      }

      // Try to find JSON array (starts with [ and ends with ])
      if (!parsed) {
        const arrayMatch = text.match(/\[[\s\S]*\]/);
        if (arrayMatch?.[0]) {
          try {
            const arr = JSON.parse(arrayMatch[0]);
            parsed = { lenders: arr };
            console.log("[AI] Successfully extracted JSON array as lenders");
          } catch (e4) {
            // All fallbacks failed
          }
        }
      }

      if (!parsed) {
        console.error("[AI] Raw response:", text.substring(0, 500));
        throw new Error(
          "Failed to parse AI response as JSON. The AI may have returned malformed data."
        );
      }
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
      stage: "validating",
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
        stage: "enhancing",
        progress: 70,
        message: `Enhancing ${lendersNeedingEnhancement.length} lender(s) with Perplexity Sonar internet research...`,
        currentFile: file.name,
      });

      // Enhanced lender research function - Perplexity first, then Google fallback
      const enhanceLenderWithResearch = async (
        lender: Partial<LenderProfile>,
        index: number
      ): Promise<Partial<LenderProfile>> => {
        if (!profileNeedsEnhancement(lender)) {
          return lender;
        }

        const lenderName = lender.name || "Unknown";
        console.log(`[AI Lender Upload] Enhancing lender: ${lenderName}`);

        // STEP 1: Try Perplexity Sonar first (faster, dedicated search)
        onProgress?.({
          stage: "enhancing",
          progress: 70 + Math.floor((index / normalizedLenders.length) * 15),
          message: `Searching Perplexity Sonar for "${lenderName}" lending programs...`,
          currentFile: file.name,
        });

        let enhancedData: Partial<LenderProfile> | null = null;

        try {
          enhancedData = await searchWithPerplexity(lenderName, lender);

          if (enhancedData && enhancedData.tiers && enhancedData.tiers.length > 0) {
            console.log(`[AI Lender Upload] Perplexity found data for: ${lenderName}`);

            // Merge Perplexity data with original - cast to full LenderProfile since lender comes from normalized list
            const mergedLender = mergeLenderData(lender as LenderProfile, enhancedData);

            // Check if we got enough data from Perplexity
            if (!profileNeedsEnhancement(mergedLender)) {
              console.log(
                `[AI Lender Upload] Perplexity provided sufficient data for: ${lenderName}`
              );
              return mergedLender;
            }

            // Perplexity helped but we still need more - continue with partial data
            lender = mergedLender;
          }
        } catch (perplexityError) {
          console.warn(
            `[AI Lender Upload] Perplexity search failed for ${lenderName}:`,
            perplexityError
          );
        }

        // STEP 2: Fall back to Google Search grounding if Perplexity didn't get everything
        if (profileNeedsEnhancement(lender)) {
          onProgress?.({
            stage: "enhancing",
            progress: 70 + Math.floor((index / normalizedLenders.length) * 20),
            message: `Searching Google for "${lenderName}" rate sheet data...`,
            currentFile: file.name,
          });

          try {
            console.log(
              `[AI Lender Upload] Falling back to Google Search grounding for: ${lenderName}`
            );

            const groundingTool = { googleSearch: {} };

            const enhanceResponse = await retryWithBackoff(
              async () =>
                ai.models.generateContent({
                  model: PRIMARY_MODEL,
                  contents: getGroundingPrompt(lenderName, lender),
                  config: {
                    tools: [groundingTool],
                    responseMimeType: "application/json",
                    responseSchema: LENDER_PROFILE_SCHEMA,
                  },
                }),
              MAX_RETRIES,
              "Google grounding"
            );

            const enhanceText = enhanceResponse.text;
            if (enhanceText) {
              try {
                const googleData = JSON.parse(enhanceText);
                console.log(`[AI Lender Upload] Google found data for: ${lenderName}`);
                return mergeLenderData(lender as LenderProfile, googleData);
              } catch {
                console.warn(
                  `[AI Lender Upload] Failed to parse Google response for: ${lenderName}`
                );
              }
            }
          } catch (googleError) {
            console.warn(`[AI Lender Upload] Google search failed for ${lenderName}:`, googleError);
          }
        }

        return lender;
      };

      // Run all enhancements in parallel for speed (max 3 concurrent)
      const enhanceWithConcurrencyLimit = async (
        lenders: Partial<LenderProfile>[],
        maxConcurrent: number = 3
      ): Promise<Partial<LenderProfile>[]> => {
        const results: Partial<LenderProfile>[] = [];

        for (let i = 0; i < lenders.length; i += maxConcurrent) {
          const batch = lenders.slice(i, i + maxConcurrent);
          const batchResults = await Promise.all(
            batch.map((lender, batchIndex) => enhanceLenderWithResearch(lender, i + batchIndex))
          );
          results.push(...batchResults);
        }

        return results;
      };

      normalizedLenders = await enhanceWithConcurrencyLimit(normalizedLenders);
    }

    // Stage 5: Final validation
    onProgress?.({
      stage: "complete",
      progress: 95,
      message: `Successfully extracted ${
        normalizedLenders.length
      } lender(s) with ${normalizedLenders.reduce(
        (acc: number, l: Partial<LenderProfile>) => acc + (l.tiers?.length || 0),
        0
      )} total tiers.`,
      currentFile: file.name,
    });

    // Add data quality summary
    const qualitySummary = normalizedLenders.map((lender: Partial<LenderProfile>) => {
      const tiersWithLtv =
        lender.tiers?.filter((t: LenderTier) => t.maxLtv !== undefined).length || 0;
      const tiersWithTerm =
        lender.tiers?.filter((t: LenderTier) => t.maxTerm !== undefined).length || 0;
      const totalTiers = lender.tiers?.length || 0;
      return {
        name: lender.name,
        totalTiers,
        tiersWithLtv,
        tiersWithTerm,
        dataQuality:
          totalTiers > 0
            ? Math.round(((tiersWithLtv + tiersWithTerm) / (totalTiers * 2)) * 100)
            : 0,
      };
    });

    console.log("Extraction quality summary:", qualitySummary);

    onProgress?.({
      stage: "complete",
      progress: 100,
      message: "Extraction complete!",
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
      stage: "error",
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
    throw new Error("AI is disabled. Call this via a server-side proxy with an API key.");

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
    const response = await retryWithBackoff(
      async () =>
        ai.models.generateContent({
          model: PRIMARY_MODEL,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: DEAL_SUGGESTION_SCHEMA,
          },
        }),
      MAX_RETRIES,
      "AI Deal Assistant"
    );

    const text = response.text;
    if (!text) throw new Error("No analysis returned.");

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error("Failed to parse AI response.");
    }

    if (!parsed) return { analysis: "Error parsing AI response.", suggestions: [] };

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
