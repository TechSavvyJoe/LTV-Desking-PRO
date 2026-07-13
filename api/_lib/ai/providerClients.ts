import { GoogleGenAI } from "@google/genai";
import type { AiProvider } from "../../../lib/aiModelRegistry.js";
import { withAiTimeout } from "./timeout.js";

export interface AiPdfInput {
  name: string;
  mimeType: string;
  base64Data: string;
}

export interface AiJsonRequest {
  provider: AiProvider;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: unknown;
  pdf?: AiPdfInput;
  temperature?: number;
  maxTokens?: number;
}

export interface GroundedSource {
  url: string;
  title?: string;
}

export interface GroundedAiJsonRequest {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GroundedAiJsonResponse {
  json: unknown;
  sources: GroundedSource[];
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const extractJsonFromText = (text: string): unknown => {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("AI provider returned an empty response.");

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced?.[1]) return JSON.parse(fenced[1].trim());

    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) return JSON.parse(objectMatch[0]);

    throw new Error("AI provider did not return valid JSON.");
  }
};

const readOpenAiText = (responseBody: unknown): string => {
  const body = asRecord(responseBody);
  if (typeof body.output_text === "string") return body.output_text;

  const output = Array.isArray(body.output) ? body.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    const content = asRecord(item).content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      const record = asRecord(block);
      if (typeof record.text === "string") chunks.push(record.text);
      if (typeof record.output_text === "string") chunks.push(record.output_text);
    }
  }

  return chunks.join("\n");
};

const readAnthropicText = (responseBody: unknown): string => {
  const content = asRecord(responseBody).content;
  if (!Array.isArray(content)) return "";

  return content
    .map((block) => asRecord(block).text)
    .filter((text): text is string => typeof text === "string")
    .join("\n");
};

const assertFetchOk = async (response: Response, provider: AiProvider): Promise<unknown> => {
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return body;

  const error = asRecord(asRecord(body).error);
  const message =
    typeof error.message === "string"
      ? error.message
      : `${provider} API failed with HTTP ${response.status}.`;
  throw new Error(message);
};

const callOpenAiJson = async (request: AiJsonRequest, signal: AbortSignal): Promise<unknown> => {
  const content: Record<string, unknown>[] = [];
  if (request.pdf) {
    content.push({
      type: "input_file",
      filename: request.pdf.name,
      file_data: `data:${request.pdf.mimeType};base64,${request.pdf.base64Data}`,
    });
  }
  content.push({ type: "input_text", text: request.userPrompt });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      instructions: request.systemPrompt,
      input: [{ role: "user", content }],
      // GLBA/Safeguards: deal payloads include consumer financial data
      // (credit estimate, income). `store` defaults to TRUE on the Responses
      // API, persisting prompts in the OpenAI dashboard ~30 days. Always off. [G8]
      store: false,
      temperature: request.temperature ?? 0.1,
      max_output_tokens: request.maxTokens ?? 6000,
      text: {
        format: {
          type: "json_schema",
          name: "ltv_desking_response",
          schema: request.jsonSchema,
          strict: false,
        },
      },
    }),
  });

  const body = await assertFetchOk(response, "openai");
  return extractJsonFromText(readOpenAiText(body));
};

const callAnthropicJson = async (request: AiJsonRequest, signal: AbortSignal): Promise<unknown> => {
  const content: Record<string, unknown>[] = [];
  if (request.pdf) {
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: request.pdf.mimeType,
        data: request.pdf.base64Data,
      },
    });
  }
  content.push({
    type: "text",
    text: `${request.userPrompt}\n\nReturn only valid JSON that matches this JSON schema:\n${JSON.stringify(
      request.jsonSchema
    )}`,
  });

  // GLBA/Safeguards (SEC-002): Anthropic has no per-request `store:false`
  // equivalent. Zero Data Retention is an organization-level arrangement
  // enabled by Anthropic sales — not an API flag. We intentionally omit
  // `cache_control` so prompt caching (ephemeral retention) is not opted in.
  // Production Anthropic keys must be on a ZDR-eligible commercial org; see
  // docs/runbooks/ai-data-retention.md and backend/DEPLOYMENT.md.
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "x-api-key": request.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      system: request.systemPrompt,
      messages: [{ role: "user", content }],
      temperature: request.temperature ?? 0.1,
      max_tokens: request.maxTokens ?? 6000,
    }),
  });

  const body = await assertFetchOk(response, "anthropic");
  return extractJsonFromText(readAnthropicText(body));
};

const callGeminiJson = async (request: AiJsonRequest, signal: AbortSignal): Promise<unknown> => {
  const ai = new GoogleGenAI({ apiKey: request.apiKey });
  const parts: Record<string, unknown>[] = [];
  if (request.pdf) {
    parts.push({
      inlineData: {
        mimeType: request.pdf.mimeType,
        data: request.pdf.base64Data,
      },
    });
  }
  parts.push({ text: request.userPrompt });

  // GLBA/Safeguards (SEC-002): generateContent defaults to store=false, but
  // set it explicitly so project-level AI Studio logging cannot silently
  // retain deal payloads. Paid Gemini keys + ZDR guidance: see
  // docs/runbooks/ai-data-retention.md.
  // `store` is documented by Google; @google/genai types lag the API.
  const response = await ai.models.generateContent({
    model: request.model,
    contents: { role: "user", parts },
    config: {
      abortSignal: signal,
      systemInstruction: request.systemPrompt,
      temperature: request.temperature ?? 0.1,
      responseMimeType: "application/json",
      responseJsonSchema: request.jsonSchema,
      store: false,
    } as import("@google/genai").GenerateContentConfig,
  });

  return extractJsonFromText(response.text ?? "");
};

export const callAiJson = async (request: AiJsonRequest): Promise<unknown> =>
  withAiTimeout((signal) => {
    switch (request.provider) {
      case "openai":
        return callOpenAiJson(request, signal);
      case "anthropic":
        return callAnthropicJson(request, signal);
      case "gemini":
        return callGeminiJson(request, signal);
    }
  });

const callGeminiGroundedJson = async (
  request: GroundedAiJsonRequest,
  signal: AbortSignal
): Promise<GroundedAiJsonResponse> => {
  const ai = new GoogleGenAI({ apiKey: request.apiKey });
  // SEC-002: explicit store:false — see callGeminiJson comment above.
  // `store` is documented by Google; @google/genai types lag the API.
  const response = await ai.models.generateContent({
    model: request.model,
    contents: { role: "user", parts: [{ text: request.userPrompt }] },
    config: {
      abortSignal: signal,
      systemInstruction: request.systemPrompt,
      temperature: request.temperature ?? 0.2,
      tools: [{ googleSearch: {} }],
      store: false,
    } as import("@google/genai").GenerateContentConfig,
  });

  const text = response.text ?? "";
  const json = extractJsonFromText(text);

  const sources: GroundedSource[] = [];
  const candidates = asRecord(response).candidates;
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      const meta = asRecord(asRecord(candidate).groundingMetadata);
      const chunks = Array.isArray(meta.groundingChunks) ? meta.groundingChunks : [];
      for (const chunk of chunks) {
        const web = asRecord(asRecord(chunk).web);
        if (typeof web.uri === "string") {
          sources.push({
            url: web.uri,
            title: typeof web.title === "string" ? web.title : undefined,
          });
        }
      }
    }
  }

  return { json, sources };
};

export const callGroundedAiJson = async (
  request: GroundedAiJsonRequest
): Promise<GroundedAiJsonResponse> =>
  withAiTimeout((signal) => callGeminiGroundedJson(request, signal));
