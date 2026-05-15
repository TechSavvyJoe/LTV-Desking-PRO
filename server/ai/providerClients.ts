import { GoogleGenAI } from "@google/genai";
import type { AiProvider } from "../../lib/aiModelRegistry";
import { withAiTimeout } from "./timeout";

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
  const body = (await response.json().catch(() => null)) as unknown;
  if (response.ok) return body;

  const error = asRecord(asRecord(body).error);
  const message =
    typeof error.message === "string"
      ? error.message
      : `${provider} API failed with HTTP ${response.status}.`;
  throw new Error(message);
};

const callOpenAiJson = async (request: AiJsonRequest): Promise<unknown> => {
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
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      instructions: request.systemPrompt,
      input: [{ role: "user", content }],
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

const callAnthropicJson = async (request: AiJsonRequest): Promise<unknown> => {
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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
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

const callGeminiJson = async (request: AiJsonRequest): Promise<unknown> => {
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

  const response = await ai.models.generateContent({
    model: request.model,
    contents: { role: "user", parts },
    config: {
      systemInstruction: request.systemPrompt,
      temperature: request.temperature ?? 0.1,
      responseMimeType: "application/json",
      responseJsonSchema: request.jsonSchema,
    },
  });

  return extractJsonFromText(response.text ?? "");
};

export const callAiJson = async (request: AiJsonRequest): Promise<unknown> => {
  const operation = (() => {
    switch (request.provider) {
      case "openai":
        return callOpenAiJson(request);
      case "anthropic":
        return callAnthropicJson(request);
      case "gemini":
        return callGeminiJson(request);
    }
  })();

  return withAiTimeout(operation);
};

const callGeminiGroundedJson = async (
  request: GroundedAiJsonRequest
): Promise<GroundedAiJsonResponse> => {
  const ai = new GoogleGenAI({ apiKey: request.apiKey });
  const response = await ai.models.generateContent({
    model: request.model,
    contents: { role: "user", parts: [{ text: request.userPrompt }] },
    config: {
      systemInstruction: request.systemPrompt,
      temperature: request.temperature ?? 0.2,
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text ?? "";
  const json = extractJsonFromText(text);

  const sources: GroundedSource[] = [];
  const candidates = (response as unknown as { candidates?: unknown }).candidates;
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
): Promise<GroundedAiJsonResponse> => withAiTimeout(callGeminiGroundedJson(request));
