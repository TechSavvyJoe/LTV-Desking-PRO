import { z } from "zod";
import type { DealData, LenderProfile, LenderTier } from "../../../types.js";

export const lenderTierJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    tierName: { type: "string" },
    minFico: { type: "number" },
    maxFico: { type: "number" },
    minYear: { type: "number" },
    maxYear: { type: "number" },
    maxAge: { type: "number" },
    minMileage: { type: "number" },
    maxMileage: { type: "number" },
    minTerm: { type: "number" },
    maxTerm: { type: "number" },
    maxLtv: { type: "number" },
    minLtv: { type: "number" },
    frontEndLtv: { type: "number" },
    otdLtv: { type: "number" },
    maxAdvance: { type: "number" },
    minAmountFinanced: { type: "number" },
    maxAmountFinanced: { type: "number" },
    baseInterestRate: { type: "number" },
    rateAdder: { type: "number" },
    maxRate: { type: "number" },
    vehicleType: { type: "string", enum: ["new", "used", "certified", "all"] },
    excludedMakes: { type: "array", items: { type: "string" } },
    includedMakes: { type: "array", items: { type: "string" } },
    minIncome: { type: "number" },
    maxPti: { type: "number" },
    maxDti: { type: "number" },
    maxBackend: { type: "number" },
    maxBackendPercent: { type: "number" },
    confidence: { type: "number" },
    extractionSource: { type: "string", enum: ["table", "text", "header", "inferred"] },
  },
  required: ["name"],
} as const;

export const lenderExtractJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    lenders: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          active: { type: "boolean" },
          bookValueSource: { type: "string", enum: ["Trade", "Retail"] },
          minIncome: { type: "number" },
          maxPti: { type: "number" },
          maxDti: { type: "number" },
          maxBackend: { type: "number" },
          minAmountFinanced: { type: "number" },
          maxAmountFinanced: { type: "number" },
          stipulations: { type: "string" },
          effectiveDate: { type: "string" },
          contactName: { type: "string" },
          contactPhone: { type: "string" },
          contactEmail: { type: "string" },
          website: { type: "string" },
          portalUrl: { type: "string" },
          generalNotes: { type: "string" },
          tiers: { type: "array", items: lenderTierJsonSchema },
        },
        required: ["name", "tiers"],
      },
    },
  },
  required: ["lenders"],
} as const;

export const lenderEnrichJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    enrichment: {
      type: "object",
      additionalProperties: false,
      properties: {
        contactName: { type: "string" },
        contactPhone: { type: "string" },
        contactEmail: { type: "string" },
        website: { type: "string" },
        portalUrl: { type: "string" },
        mailingAddress: { type: "string" },
        generalNotes: { type: "string" },
        bookValueSource: { type: "string", enum: ["Trade", "Retail"] },
      },
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: { type: "string" },
          title: { type: "string" },
          fieldsCited: { type: "array", items: { type: "string" } },
        },
        required: ["url"],
      },
    },
  },
  required: ["enrichment"],
} as const;

export const dealSuggestionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    analysis: { type: "string" },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          reasoning: { type: "string" },
          proposedChanges: {
            type: "object",
            additionalProperties: false,
            properties: {
              downPayment: { type: "number" },
              tradeInValue: { type: "number" },
              tradeInPayoff: { type: "number" },
              backendProducts: { type: "number" },
              loanTerm: { type: "number" },
              interestRate: { type: "number" },
              stateFees: { type: "number" },
              // `notes` intentionally omitted: AI free text must not flow into
              // the deal (it prints on customer paper). Structural enforcement
              // of the prompt rule + the applySuggestion drop. [G32]
            },
          },
          alternativeVehicleVin: { type: "string" },
        },
        required: ["title", "reasoning", "proposedChanges"],
      },
    },
  },
  required: ["analysis", "suggestions"],
} as const;

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().finite().optional()
);

export const AiLenderTierSchema = z
  .object({
    name: z.string().min(1),
    tierName: z.string().optional(),
    minFico: optionalNumber,
    maxFico: optionalNumber,
    minYear: optionalNumber,
    maxYear: optionalNumber,
    maxAge: optionalNumber,
    minMileage: optionalNumber,
    maxMileage: optionalNumber,
    minTerm: optionalNumber,
    maxTerm: optionalNumber,
    maxLtv: optionalNumber,
    minLtv: optionalNumber,
    frontEndLtv: optionalNumber,
    otdLtv: optionalNumber,
    maxAdvance: optionalNumber,
    minAmountFinanced: optionalNumber,
    maxAmountFinanced: optionalNumber,
    baseInterestRate: optionalNumber,
    rateAdder: optionalNumber,
    maxRate: optionalNumber,
    vehicleType: z.enum(["new", "used", "certified", "all"]).optional(),
    excludedMakes: z.array(z.string()).optional(),
    includedMakes: z.array(z.string()).optional(),
    minIncome: optionalNumber,
    maxPti: optionalNumber,
    maxDti: optionalNumber,
    maxBackend: optionalNumber,
    maxBackendPercent: optionalNumber,
    confidence: optionalNumber,
    extractionSource: z.enum(["table", "text", "header", "inferred"]).optional(),
  })
  .passthrough();

export const AiLenderProfileSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    active: z.boolean().optional(),
    bookValueSource: z.enum(["Trade", "Retail"]).optional().default("Trade"),
    minIncome: optionalNumber,
    maxPti: optionalNumber,
    maxDti: optionalNumber,
    maxBackend: optionalNumber,
    minAmountFinanced: optionalNumber,
    maxAmountFinanced: optionalNumber,
    stipulations: z.string().optional(),
    effectiveDate: z.string().optional(),
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    contactEmail: z.string().optional(),
    website: z.string().optional(),
    portalUrl: z.string().optional(),
    generalNotes: z.string().optional(),
    tiers: z.array(AiLenderTierSchema).default([]),
  })
  .passthrough();

export const AiLenderEnrichmentSchema = z.object({
  enrichment: z
    .object({
      contactName: z.string().optional(),
      contactPhone: z.string().optional(),
      contactEmail: z.string().optional(),
      website: z.string().optional(),
      portalUrl: z.string().optional(),
      mailingAddress: z.string().optional(),
      generalNotes: z.string().optional(),
      bookValueSource: z.enum(["Trade", "Retail"]).optional(),
    })
    .default({}),
  sources: z
    .array(
      z.object({
        url: z.string(),
        title: z.string().optional(),
        fieldsCited: z.array(z.string()).optional(),
      })
    )
    .default([]),
});

export type AiLenderEnrichment = z.infer<typeof AiLenderEnrichmentSchema>;

export const AiLenderExtractResponseSchema = z.object({
  lenders: z.array(AiLenderProfileSchema).min(1),
});

export const AiDealSuggestionSchema = z.object({
  analysis: z.string().min(1),
  suggestions: z.array(
    z.object({
      title: z.string().min(1),
      reasoning: z.string().min(1),
      proposedChanges: z
        .object({
          downPayment: optionalNumber,
          tradeInValue: optionalNumber,
          tradeInPayoff: optionalNumber,
          backendProducts: optionalNumber,
          loanTerm: optionalNumber,
          interestRate: optionalNumber,
          stateFees: optionalNumber,
          // `notes` intentionally omitted — see jsonSchema above. [G32]
        })
        .partial()
        .default({}),
      alternativeVehicleVin: z.string().optional(),
    })
  ),
});

const normalizeNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const calculateMinYearFromAge = (maxAge: number | undefined): number | undefined => {
  if (!maxAge) return undefined;
  return new Date().getFullYear() - maxAge;
};

const stripUndefined = <T extends Record<string, unknown>>(value: T): T => {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) delete value[key];
  }
  return value;
};

export const normalizeTier = (tier: z.infer<typeof AiLenderTierSchema>): LenderTier => {
  const maxAge = normalizeNumber(tier.maxAge);
  const minYear = normalizeNumber(tier.minYear) ?? calculateMinYearFromAge(maxAge);

  return stripUndefined({
    name: tier.name,
    tierName: tier.tierName,
    minFico: normalizeNumber(tier.minFico),
    maxFico: normalizeNumber(tier.maxFico),
    minYear,
    maxYear: normalizeNumber(tier.maxYear),
    maxAge,
    minMileage: normalizeNumber(tier.minMileage),
    maxMileage: normalizeNumber(tier.maxMileage),
    minTerm: normalizeNumber(tier.minTerm),
    maxTerm: normalizeNumber(tier.maxTerm),
    maxLtv: normalizeNumber(tier.maxLtv),
    minLtv: normalizeNumber(tier.minLtv),
    frontEndLtv: normalizeNumber(tier.frontEndLtv),
    otdLtv: normalizeNumber(tier.otdLtv),
    maxAdvance: normalizeNumber(tier.maxAdvance),
    minAmountFinanced: normalizeNumber(tier.minAmountFinanced),
    maxAmountFinanced: normalizeNumber(tier.maxAmountFinanced),
    baseInterestRate: normalizeNumber(tier.baseInterestRate),
    rateAdder: normalizeNumber(tier.rateAdder),
    maxRate: normalizeNumber(tier.maxRate),
    vehicleType: tier.vehicleType,
    excludedMakes: tier.excludedMakes,
    includedMakes: tier.includedMakes,
    minIncome: normalizeNumber(tier.minIncome),
    maxPti: normalizeNumber(tier.maxPti),
    maxDti: normalizeNumber(tier.maxDti),
    maxBackend: normalizeNumber(tier.maxBackend),
    maxBackendPercent: normalizeNumber(tier.maxBackendPercent),
    confidence: normalizeNumber(tier.confidence),
    extractionSource: tier.extractionSource === "header" ? "text" : tier.extractionSource,
  });
};

export const normalizeLender = (
  profile: z.infer<typeof AiLenderProfileSchema>
): Partial<LenderProfile> & {
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  website?: string;
  portalUrl?: string;
  generalNotes?: string;
} =>
  stripUndefined({
    id: profile.id ?? `ai_${Date.now()}_${profile.name.replace(/\W+/g, "_").toLowerCase()}`,
    name: profile.name,
    active: profile.active ?? true,
    bookValueSource: profile.bookValueSource ?? "Trade",
    minIncome: normalizeNumber(profile.minIncome),
    maxPti: normalizeNumber(profile.maxPti),
    maxDti: normalizeNumber(profile.maxDti),
    maxBackend: normalizeNumber(profile.maxBackend),
    minAmountFinanced: normalizeNumber(profile.minAmountFinanced),
    maxAmountFinanced: normalizeNumber(profile.maxAmountFinanced),
    stipulations: profile.stipulations,
    effectiveDate: profile.effectiveDate,
    contactName: profile.contactName,
    contactPhone: profile.contactPhone,
    contactEmail: profile.contactEmail,
    website: profile.website,
    portalUrl: profile.portalUrl,
    generalNotes: profile.generalNotes,
    tiers: profile.tiers.map(normalizeTier),
  });

export const parseLenderEnrichResponse = (value: unknown): AiLenderEnrichment => {
  const parsed = AiLenderEnrichmentSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`AI returned invalid enrichment data: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
};

export const parseLenderExtractResponse = (value: unknown): Partial<LenderProfile>[] => {
  const parsed = AiLenderExtractResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`AI returned invalid lender data: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data.lenders.map(normalizeLender);
};

export const parseDealSuggestionResponse = (
  value: unknown
): {
  analysis: string;
  suggestions: {
    title: string;
    reasoning: string;
    proposedChanges: Partial<DealData>;
    alternativeVehicleVin?: string;
  }[];
} => {
  const parsed = AiDealSuggestionSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`AI returned invalid deal analysis: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
};
