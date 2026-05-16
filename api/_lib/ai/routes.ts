import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  buildAiModelRegistryResponse,
  type AiSettings,
  type AiTask,
} from "../../../lib/aiModelRegistry";
import {
  buildDealAnalysisPrompt,
  buildLenderEnrichmentPrompt,
  buildLenderExtractionPrompt,
  LENDER_ENRICH_SYSTEM_PROMPT,
  LENDER_EXTRACTION_SYSTEM_PROMPT,
} from "./prompts";
import { callAiJson, callGroundedAiJson } from "./providerClients";
import { getConfiguredProviders, resolveAiModel } from "./modelSelection";
import { resolveProviderKeys, updateProviderKeyTestStatus } from "./keyResolver";
import { AuthError, requireAuth, requireSuperadmin, type AuthContext } from "./auth";
import {
  dealSuggestionJsonSchema,
  lenderExtractJsonSchema,
  parseDealSuggestionResponse,
  parseLenderEnrichResponse,
  parseLenderExtractResponse,
} from "./schemas";
import { getDefaultModelForTask } from "../../../lib/aiModelRegistry";

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
  const keys = await resolveProviderKeys();
  const resolved = resolveAiModel(task, aiSettings, keys);
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

const handleModels = async (
  _request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const keys = await resolveProviderKeys();
  const registry = buildAiModelRegistryResponse(getConfiguredProviders(keys));
  const hasConfiguredProvider = registry.providers.some((provider) => provider.configured);
  sendJson(response, 200, {
    ...registry,
    warnings: hasConfiguredProvider
      ? registry.warnings
      : [
          "No provider keys are configured. Open the Owner Console → Settings → AI Providers to add a key.",
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
  const keys = await resolveProviderKeys();
  if (!keys.gemini) {
    sendError(
      response,
      400,
      "Lender enrichment requires a Gemini key (Google Search grounding). Add one in Owner Console → Settings → AI Providers.",
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

const TestKeyPayloadSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini"]),
});

const testProviderKey = async (
  provider: "openai" | "anthropic" | "gemini",
  apiKey: string
): Promise<void> => {
  if (provider === "openai") {
    const resp = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) {
      const body = (await resp.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(body.error?.message ?? `OpenAI returned HTTP ${resp.status}`);
    }
    return;
  }
  if (provider === "anthropic") {
    // Anthropic doesn't expose a free model-list; use a minimal /v1/messages call.
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    // 400 with model_not_found still proves the key is valid auth-wise.
    if (resp.status === 401 || resp.status === 403) {
      const body = (await resp.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(body.error?.message ?? `Anthropic auth failed (HTTP ${resp.status})`);
    }
    return;
  }
  // gemini
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
  );
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Gemini returned HTTP ${resp.status}`);
  }
};

const handleTestKey = async (
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const body = TestKeyPayloadSchema.parse(await readRequestBody(request));
  const keys = await resolveProviderKeys();
  const apiKey = keys[body.provider];
  if (!apiKey) {
    sendJson(response, 200, {
      ok: false,
      at: new Date().toISOString(),
      error: `No ${body.provider} key configured.`,
    });
    return;
  }

  try {
    await testProviderKey(body.provider, apiKey);
    await updateProviderKeyTestStatus(body.provider, { ok: true });
    sendJson(response, 200, { ok: true, at: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateProviderKeyTestStatus(body.provider, { ok: false, error: message });
    sendJson(response, 200, { ok: false, at: new Date().toISOString(), error: message });
  }
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
    // GET /api/ai/models is the only route that doesn't need auth — the
    // frontend hits it pre-auth to render the AI Defaults dropdown. It
    // returns no secret data (just model IDs + which providers have a key
    // configured).
    if (method === "GET" && url.startsWith("/api/ai/models")) {
      await handleModels(request, response);
      return;
    }

    // Routes that consume metered keys require an authenticated PB user.
    // /api/ai/test-key additionally requires superadmin since it triggers
    // a paid provider call and reads the masked key status.
    let auth: AuthContext;
    try {
      auth = url.startsWith("/api/ai/test-key")
        ? await requireSuperadmin(request)
        : await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) {
        sendError(response, e.statusCode, e.message);
        return;
      }
      throw e;
    }
    void auth; // reserved for per-dealer rate limiting / audit context

    if (method === "POST" && url.startsWith("/api/ai/test-key")) {
      await handleTestKey(request, response);
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
