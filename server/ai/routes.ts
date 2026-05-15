import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  buildAiModelRegistryResponse,
  type AiSettings,
  type AiTask,
} from "../../lib/aiModelRegistry";
import {
  buildDealAnalysisPrompt,
  buildLenderEnrichmentPrompt,
  buildLenderExtractionPrompt,
  LENDER_ENRICH_SYSTEM_PROMPT,
  LENDER_EXTRACTION_SYSTEM_PROMPT,
} from "./prompts";
import { callAiJson, callGroundedAiJson } from "./providerClients";
import { getConfiguredProviders, getProviderKeys, resolveAiModel } from "./modelSelection";
import {
  dealSuggestionJsonSchema,
  lenderExtractJsonSchema,
  parseDealSuggestionResponse,
  parseLenderEnrichResponse,
  parseLenderExtractResponse,
} from "./schemas";
import { getDefaultModelForTask } from "../../lib/aiModelRegistry";

const FilePayloadSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  base64Data: z.string().min(1),
});

const AiSettingsPayloadSchema = z
  .object({
    provider: z.enum(["openai", "anthropic", "gemini"]).optional(),
    lenderExtractModel: z.string().optional(),
    dealAnalysisModel: z.string().optional(),
    quickModel: z.string().optional(),
  })
  .optional();

const LenderExtractPayloadSchema = z.object({
  file: FilePayloadSchema,
  aiSettings: AiSettingsPayloadSchema,
});

const LenderEnrichPayloadSchema = z.object({
  lenderName: z.string().min(1),
  missingFields: z.array(z.string()).min(1),
});

const DealAnalysisPayloadSchema = z.object({
  vehicle: z.record(z.string(), z.unknown()),
  dealData: z.record(z.string(), z.unknown()),
  filters: z.record(z.string(), z.unknown()),
  lenderProfiles: z.array(z.record(z.string(), z.unknown())).default([]),
  inventory: z.array(z.record(z.string(), z.unknown())).default([]),
  aiSettings: AiSettingsPayloadSchema,
});

type NextFunction = () => void;

const readRequestBody = async (request: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody) as unknown);
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });

const sendJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
};

const sendOk = (
  response: ServerResponse,
  data: unknown,
  resolved: { provider: string; model: string; warning?: string }
): void => {
  sendJson(response, 200, {
    ok: true,
    data,
    meta: {
      provider: resolved.provider,
      model: resolved.model,
      warning: resolved.warning,
    },
  });
};

const sendError = (
  response: ServerResponse,
  statusCode: number,
  error: unknown,
  meta?: { provider?: string; model?: string; warning?: string }
): void => {
  const message = error instanceof Error ? error.message : String(error);
  sendJson(response, statusCode, {
    ok: false,
    error: message,
    meta,
  });
};

const resolveAndCall = async (
  task: AiTask,
  aiSettings: Partial<AiSettings> | undefined,
  payload: {
    systemPrompt: string;
    userPrompt: string;
    jsonSchema: unknown;
    pdf?: { name: string; mimeType: string; base64Data: string };
    maxTokens?: number;
  }
): Promise<{
  raw: unknown;
  provider: string;
  model: string;
  warning?: string;
}> => {
  const resolved = resolveAiModel(task, aiSettings);
  const raw = await callAiJson({
    provider: resolved.provider,
    model: resolved.model,
    apiKey: resolved.apiKey,
    systemPrompt: payload.systemPrompt,
    userPrompt: payload.userPrompt,
    jsonSchema: payload.jsonSchema,
    pdf: payload.pdf,
    maxTokens: payload.maxTokens,
  });

  return {
    raw,
    provider: resolved.provider,
    model: resolved.model,
    warning: resolved.warning,
  };
};

const handleModels = (_request: IncomingMessage, response: ServerResponse): void => {
  const registry = buildAiModelRegistryResponse(getConfiguredProviders(getProviderKeys()));
  const hasConfiguredProvider = registry.providers.some((provider) => provider.configured);
  sendJson(response, 200, {
    ...registry,
    warnings: hasConfiguredProvider
      ? registry.warnings
      : [
          "No provider keys are configured. Add OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY to enable AI routes.",
        ],
  });
};

const handleLenderExtract = async (
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const body = LenderExtractPayloadSchema.parse(await readRequestBody(request));
  const resolved = await resolveAndCall("lenderExtract", body.aiSettings, {
    systemPrompt: LENDER_EXTRACTION_SYSTEM_PROMPT,
    userPrompt: buildLenderExtractionPrompt(),
    jsonSchema: lenderExtractJsonSchema,
    pdf: body.file,
    maxTokens: 9000,
  });
  const lenders = parseLenderExtractResponse(resolved.raw);
  sendOk(response, lenders, resolved);
};

const handleLenderEnrich = async (
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const body = LenderEnrichPayloadSchema.parse(await readRequestBody(request));
  const keys = getProviderKeys();
  if (!keys.gemini) {
    sendError(
      response,
      400,
      "Lender enrichment requires GEMINI_API_KEY to be configured (Google Search grounding).",
      { provider: "gemini" }
    );
    return;
  }

  const model = getDefaultModelForTask("gemini", "lenderExtract");
  const grounded = await callGroundedAiJson({
    apiKey: keys.gemini,
    model,
    systemPrompt: LENDER_ENRICH_SYSTEM_PROMPT,
    userPrompt: buildLenderEnrichmentPrompt(body.lenderName, body.missingFields),
    maxTokens: 2000,
  });

  const parsed = parseLenderEnrichResponse(grounded.json);
  const mergedSources = [
    ...parsed.sources,
    ...grounded.sources
      .filter((s) => !parsed.sources.some((ps) => ps.url === s.url))
      .map((s) => ({ url: s.url, title: s.title })),
  ];

  sendOk(
    response,
    { enrichment: parsed.enrichment, sources: mergedSources },
    { provider: "gemini", model }
  );
};

const handleDealAnalysis = async (
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const body = DealAnalysisPayloadSchema.parse(await readRequestBody(request));
  const resolved = await resolveAndCall("dealAnalysis", body.aiSettings, {
    systemPrompt:
      "You are an expert automotive finance manager. Return only valid JSON and do not include markdown.",
    userPrompt: buildDealAnalysisPrompt(
      body.vehicle as never,
      body.dealData as never,
      body.filters as never,
      body.lenderProfiles as never,
      body.inventory as never
    ),
    jsonSchema: dealSuggestionJsonSchema,
    maxTokens: 4000,
  });
  const suggestion = parseDealSuggestionResponse(resolved.raw);
  sendOk(response, suggestion, resolved);
};

export const handleAiRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  next?: NextFunction
): Promise<void> => {
  const method = request.method ?? "GET";
  const url = request.url ?? "";

  if (!url.startsWith("/api/ai")) {
    next?.();
    return;
  }

  try {
    if (method === "GET" && url.startsWith("/api/ai/models")) {
      handleModels(request, response);
      return;
    }

    if (method === "POST" && url.startsWith("/api/ai/lender-extract")) {
      await handleLenderExtract(request, response);
      return;
    }

    if (method === "POST" && url.startsWith("/api/ai/lender-enrich")) {
      await handleLenderEnrich(request, response);
      return;
    }

    if (method === "POST" && url.startsWith("/api/ai/deal-analysis")) {
      await handleDealAnalysis(request, response);
      return;
    }

    sendError(response, 404, "AI route not found.");
  } catch (error) {
    const statusCode = error instanceof z.ZodError ? 400 : 500;
    sendError(response, statusCode, error);
  }
};
