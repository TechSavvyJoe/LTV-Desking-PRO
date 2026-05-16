import type { CalculatedVehicle, DealData, FilterData, LenderProfile, Vehicle } from "../types";
import { DEFAULT_AI_SETTINGS, normalizeAiSettings, type AiSettings } from "../lib/aiModelRegistry";
import { pb } from "../lib/pocketbase";

const ENRICHABLE_FIELDS = [
  "contactName",
  "contactPhone",
  "contactEmail",
  "website",
  "portalUrl",
  "generalNotes",
  "bookValueSource",
] as const;

type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];

export interface LenderEnrichmentResult {
  enrichment: Partial<Record<EnrichableField, string>>;
  sources: { url: string; title?: string; fieldsCited?: string[] }[];
}

export type ProcessingProgress = {
  stage: "uploading" | "extracting" | "validating" | "enhancing" | "complete" | "error";
  progress: number;
  message: string;
  currentFile?: string;
  currentFileIndex?: number;
  totalFiles?: number;
};

export type ProgressCallback = (progress: ProcessingProgress) => void;

export type DealSuggestion = {
  analysis: string;
  suggestions: {
    title: string;
    reasoning: string;
    proposedChanges: Partial<DealData>;
    alternativeVehicleVin?: string;
  }[];
  modelWarning?: string;
};

type AiRouteResponse<T> =
  | {
      ok: true;
      data: T;
      meta: {
        provider: string;
        model: string;
        warning?: string;
      };
    }
  | {
      ok: false;
      error: string;
      meta?: {
        provider?: string;
        model?: string;
        warning?: string;
      };
    };

const API_TIMEOUT_MS = 120_000;

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Could not read the selected file."));
  });

const getStoredAiSettings = (): AiSettings => {
  if (typeof window === "undefined") return DEFAULT_AI_SETTINGS;

  try {
    const stored = window.localStorage.getItem("ltvSettings_v2");
    if (!stored) return DEFAULT_AI_SETTINGS;
    const parsed = JSON.parse(stored) as { ai?: Partial<AiSettings> };
    return normalizeAiSettings(parsed.ai);
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
};

const postAiRoute = async <T>(
  url: string,
  payload: Record<string, unknown>
): Promise<AiRouteResponse<T>> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (pb.authStore.token) {
      headers.Authorization = `Bearer ${pb.authStore.token}`;
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => null)) as AiRouteResponse<T> | null;

    if (!response.ok) {
      return {
        ok: false,
        error: body && !body.ok ? body.error : `AI request failed with HTTP ${response.status}.`,
        meta: body?.meta,
      };
    }

    if (!body) {
      return { ok: false, error: "AI route returned an empty response." };
    }

    return body;
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? "AI request timed out. Try a faster model or a smaller file."
        : error instanceof Error
          ? error.message
          : "AI request failed.";
    return { ok: false, error: message };
  } finally {
    window.clearTimeout(timeout);
  }
};

const findMissingEnrichableFields = (lender: Partial<LenderProfile>): EnrichableField[] =>
  ENRICHABLE_FIELDS.filter((field) => {
    const value = (lender as Record<string, unknown>)[field];
    return value === undefined || value === null || value === "";
  });

export const enrichLenderProfile = async (
  lenderName: string,
  missingFields: EnrichableField[]
): Promise<LenderEnrichmentResult | null> => {
  if (missingFields.length === 0) return null;

  const response = await postAiRoute<LenderEnrichmentResult>("/api/ai/lender-enrich", {
    lenderName,
    missingFields,
  });

  if (!response.ok) {
    console.warn("[enrichLenderProfile] Enrichment failed:", response.error);
    return null;
  }

  return response.data;
};

const applyEnrichment = (
  lender: Partial<LenderProfile>,
  enrichment: LenderEnrichmentResult
): Partial<LenderProfile> => {
  const merged: Partial<LenderProfile> = { ...lender };
  for (const field of ENRICHABLE_FIELDS) {
    const current = (merged as Record<string, unknown>)[field];
    if (current !== undefined && current !== "" && current !== null) continue;

    const incoming = enrichment.enrichment[field];
    if (typeof incoming === "string" && incoming.trim()) {
      (merged as Record<string, unknown>)[field] = incoming.trim();
    }
  }
  if (enrichment.sources.length > 0) {
    merged.enrichmentSources = enrichment.sources;
  }
  return merged;
};

export const processLenderSheet = async (
  file: File,
  onProgress?: ProgressCallback,
  aiSettings?: AiSettings,
  options: { enrich?: boolean } = {}
): Promise<Partial<LenderProfile>[]> => {
  const enrich = options.enrich !== false;

  onProgress?.({
    stage: "uploading",
    progress: 5,
    message: "Reading PDF file...",
    currentFile: file.name,
  });

  if (file.type && file.type !== "application/pdf") {
    throw new Error("AI lender upload only supports PDF rate sheets.");
  }

  const base64Data = await fileToBase64(file);
  const selectedSettings = normalizeAiSettings(aiSettings ?? getStoredAiSettings());

  onProgress?.({
    stage: "extracting",
    progress: 25,
    message: "Server AI is extracting lender tiers...",
    currentFile: file.name,
  });

  const response = await postAiRoute<Partial<LenderProfile>[]>("/api/ai/lender-extract", {
    file: {
      name: file.name,
      mimeType: file.type || "application/pdf",
      base64Data,
    },
    aiSettings: selectedSettings,
  });

  if (!response.ok) {
    onProgress?.({
      stage: "error",
      progress: 0,
      message: response.error,
      currentFile: file.name,
    });
    throw new Error(response.error);
  }

  onProgress?.({
    stage: "validating",
    progress: 55,
    message:
      response.meta.warning ?? `Extracted with ${response.meta.provider} ${response.meta.model}.`,
    currentFile: file.name,
  });

  let lenders = response.data;

  if (enrich && lenders.length > 0) {
    onProgress?.({
      stage: "enhancing",
      progress: 65,
      message: "Searching the web for missing bank info...",
      currentFile: file.name,
    });

    const enriched: Partial<LenderProfile>[] = [];
    for (let i = 0; i < lenders.length; i++) {
      const lender = lenders[i];
      if (!lender || !lender.name) {
        if (lender) enriched.push(lender);
        continue;
      }

      const missing = findMissingEnrichableFields(lender);
      if (missing.length === 0) {
        enriched.push(lender);
        continue;
      }

      onProgress?.({
        stage: "enhancing",
        progress: 65 + Math.round((i / lenders.length) * 25),
        message: `Enriching ${lender.name} (${missing.length} missing field${missing.length === 1 ? "" : "s"})...`,
        currentFile: file.name,
      });

      try {
        const result = await enrichLenderProfile(lender.name, missing);
        enriched.push(result ? applyEnrichment(lender, result) : lender);
      } catch (error) {
        console.warn(`[processLenderSheet] Enrichment failed for ${lender.name}:`, error);
        enriched.push(lender);
      }
    }
    lenders = enriched;
  }

  onProgress?.({
    stage: "complete",
    progress: 100,
    message: `Extracted ${lenders.length} lender profile(s).`,
    currentFile: file.name,
  });

  return lenders;
};

export const analyzeDealWithAi = async (
  vehicle: CalculatedVehicle,
  dealData: DealData,
  filters: FilterData,
  lenderProfiles: LenderProfile[],
  inventory: Vehicle[],
  aiSettings?: AiSettings
): Promise<DealSuggestion> => {
  const selectedSettings = normalizeAiSettings(aiSettings ?? getStoredAiSettings());
  const response = await postAiRoute<DealSuggestion>("/api/ai/deal-analysis", {
    vehicle,
    dealData,
    filters,
    lenderProfiles,
    inventory,
    aiSettings: selectedSettings,
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  return {
    ...response.data,
    modelWarning: response.meta.warning,
  };
};
