import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { enforceAiRateLimit } from "./rateLimit.js";
import {
  buildAiModelRegistryResponse,
  type AiSettings,
  type AiTask,
} from "../../../lib/aiModelRegistry.js";
import {
  buildDealAnalysisPrompt,
  buildLenderEnrichmentPrompt,
  buildLenderExtractionPrompt,
  LENDER_ENRICH_SYSTEM_PROMPT,
  LENDER_EXTRACTION_SYSTEM_PROMPT,
} from "./prompts.js";
import type {
  CalculatedVehicle,
  DealData,
  FilterData,
  LenderProfile,
  Vehicle,
} from "../../../types.js";
import { callAiJson, callGroundedAiJson } from "./providerClients.js";
import { getConfiguredProviders, resolveAiModel } from "./modelSelection.js";
import { resolveProviderKeys, updateProviderKeyTestStatus } from "./keyResolver.js";
import { AuthError, requireAuth, requireSuperadmin, type AuthContext } from "./auth.js";
import {
  dealSuggestionJsonSchema,
  lenderExtractJsonSchema,
  parseDealSuggestionResponse,
  parseLenderEnrichResponse,
  parseLenderExtractResponse,
} from "./schemas.js";
import { getDefaultModelForTask } from "../../../lib/aiModelRegistry.js";
import { createLogger } from "../../../lib/logger.js";

// Safe logger creation for serverless (node) context where import.meta may be absent.
const aiProxyLogger = (() => {
  try {
    return createLogger("ai-proxy");
  } catch {
    return {
      error: (msg: string, err?: unknown) => console.error(`[ai-proxy] ${msg}`, err),
      warn: (msg: string, ctx?: unknown) => console.warn(`[ai-proxy] ${msg}`, ctx),
      debug: () => {},
      info: () => {},
    };
  }
})();

// Upload caps. base64 inflates binary by ~33%, so ~4 MB of base64 ≈ 3 MB PDF —
// comfortably under Vercel's ~4.5 MB request cap once the JSON envelope is
// accounted for, and the body reader enforces the hard ceiling regardless. [B4]
const MAX_BASE64_LENGTH = 4 * 1024 * 1024;

const FilePayloadSchema = z.object({
  name: z.string().min(1).max(255),
  // Server is the trust boundary: only accept PDFs, regardless of what the
  // client claims. [B4]
  mimeType: z.enum(["application/pdf"]),
  base64Data: z
    .string()
    .min(1)
    .max(MAX_BASE64_LENGTH)
    .regex(/^[A-Za-z0-9+/=\r\n]+$/, "base64Data must be valid base64"),
});

/** An error with an explicit HTTP status the top-level handler should honor. */
class RequestError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "RequestError";
  }
}

// Hard cap on buffered request bytes — prevents unbounded memory growth from a
// large or malicious body when Vercel's body parser is disabled. [B4]
const MAX_BODY_BYTES = 4 * 1024 * 1024;

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
  // lenderName is interpolated into a Google-Search-grounded prompt, so
  // constrain it to a single line of reasonable length to limit
  // prompt-injection / search-abuse surface. [ai-proxy]
  lenderName: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[^\n\r\t]+$/, "lenderName must be a single line"),
  missingFields: z.array(z.string().min(1).max(60)).min(1).max(20),
});

const DealAnalysisPayloadSchema = z.object({
  vehicle: z.record(z.string(), z.unknown()),
  dealData: z.record(z.string(), z.unknown()),
  filters: z.record(z.string(), z.unknown()),
  // Cap array sizes so a caller can't inflate the prompt (and provider token
  // bill) with arbitrarily large payloads. [B4]
  lenderProfiles: z.array(z.record(z.string(), z.unknown())).max(100).default([]),
  inventory: z.array(z.record(z.string(), z.unknown())).max(500).default([]),
  aiSettings: AiSettingsPayloadSchema,
});

type NextFunction = () => void;

const readRequestBody = async (request: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;
    request.on("data", (chunk: Buffer) => {
      if (aborted) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        aborted = true;
        reject(new RequestError("Request body too large.", 413));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (aborted) return;
      const rawBody = Buffer.concat(chunks).toString("utf8");
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody) as unknown);
      } catch {
        reject(new RequestError("Request body must be valid JSON.", 400));
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
  meta?: { provider?: string; model?: string; warning?: string },
  correlationId?: string
): void => {
  // Never leak internal/provider error detail to the client on a 5xx — it aids
  // reconnaissance. Return a generic message + a correlation id that ties back
  // to the server log. Specific text is preserved only for validated 4xx. [B9]
  const message =
    statusCode >= 500
      ? "AI request failed. Please try again or contact support if the problem persists."
      : error instanceof Error
        ? error.message
        : String(error);
  sendJson(response, statusCode, {
    ok: false,
    error: message,
    ...(correlationId ? { correlationId } : {}),
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

const handleModels = async (_request: IncomingMessage, response: ServerResponse): Promise<void> => {
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
  // gemini — pass the key via header, not the URL query string, so it never
  // lands in intermediary/proxy access logs. [ai-proxy]
  const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    headers: { "x-goog-api-key": apiKey },
  });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Gemini returned HTTP ${resp.status}`);
  }
};

const handleTestKey = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
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
      // Casts are safe here: Zod schema accepts loose records from wire (for flexibility with
      // varying client payloads and AI roundtrips); callers of buildDealAnalysisPrompt require
      // the domain shapes. Unknown-as guards against accidental any leakage.
      body.vehicle as unknown as CalculatedVehicle,
      body.dealData as unknown as DealData,
      body.filters as unknown as FilterData,
      body.lenderProfiles as unknown as LenderProfile[],
      body.inventory as unknown as Vehicle[]
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

    // Entitlement: metered routes must be attributable to a dealership.
    // Superadmins (who may have no dealer) are exempt. [ai-proxy authz]
    if (auth.role !== "superadmin" && !auth.dealerId) {
      sendError(response, 403, "Your account is not associated with a dealership.");
      return;
    }

    // Rate limit per user (and per dealer) before spending the owner's keys. [B3]
    const limit = enforceAiRateLimit(auth);
    if (!limit.ok) {
      response.setHeader("Retry-After", String(limit.retryAfterSec));
      sendError(response, 429, `Rate limit exceeded. Try again in ${limit.retryAfterSec}s.`);
      return;
    }

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
    if (error instanceof z.ZodError) {
      sendError(response, 400, "Request validation failed.");
      return;
    }
    if (error instanceof RequestError) {
      sendError(response, error.statusCode, error);
      return;
    }
    // Unexpected 5xx: log the real error with a correlation id server-side, but
    // return only the generic masked message + id to the client. [B9]
    const correlationId = randomUUID();
    aiProxyLogger.error(`error ${correlationId}`, error);
    sendError(response, 500, error, undefined, correlationId);
  }
};
