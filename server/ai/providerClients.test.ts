import { afterEach, describe, expect, it, vi } from "vitest";
import { callAiJson } from "./providerClients";
import { dealSuggestionJsonSchema, lenderExtractJsonSchema } from "./schemas";
import { withAiTimeout } from "./timeout";

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return {
      models: {
        generateContent: mockGenerateContent,
      },
    };
  }),
}));

const requestBase = {
  apiKey: "test-key",
  systemPrompt: "Return JSON.",
  userPrompt: "Analyze this.",
  jsonSchema: dealSuggestionJsonSchema,
};

describe("AI provider clients", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockGenerateContent.mockReset();
  });

  it("calls OpenAI Responses with JSON schema and parses output_text", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({ analysis: "Looks workable.", suggestions: [] }),
        }),
        { status: 200 }
      )
    );

    const result = await callAiJson({
      ...requestBase,
      provider: "openai",
      model: "gpt-5.5",
    });

    expect(result).toEqual({ analysis: "Looks workable.", suggestions: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      })
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("gpt-5.5");
    expect(body.text.format.type).toBe("json_schema");
  });

  it("calls Anthropic Messages with PDF blocks and rejects invalid JSON", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: "not json" }] }), {
        status: 200,
      })
    );

    await expect(
      callAiJson({
        ...requestBase,
        provider: "anthropic",
        model: "claude-opus-4-7",
        pdf: {
          name: "rates.pdf",
          mimeType: "application/pdf",
          base64Data: "ZmFrZQ==",
        },
      })
    ).rejects.toThrow("valid JSON");

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.messages[0].content[0].type).toBe("document");
  });

  it("calls Gemini with response JSON schema and parses lender data", async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        lenders: [{ name: "Test Bank", tiers: [{ name: "Prime", maxLtv: 120 }] }],
      }),
    });

    const result = await callAiJson({
      apiKey: "gemini-key",
      systemPrompt: "Extract lenders.",
      userPrompt: "Extract this PDF.",
      jsonSchema: lenderExtractJsonSchema,
      provider: "gemini",
      model: "gemini-3.1-pro-preview",
      pdf: {
        name: "rates.pdf",
        mimeType: "application/pdf",
        base64Data: "ZmFrZQ==",
      },
    });

    expect(result).toEqual({
      lenders: [{ name: "Test Bank", tiers: [{ name: "Prime", maxLtv: 120 }] }],
    });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3.1-pro-preview",
        config: expect.objectContaining({
          responseMimeType: "application/json",
          responseJsonSchema: lenderExtractJsonSchema,
        }),
      })
    );
  });

  it("rejects operations that exceed the AI timeout", async () => {
    vi.useFakeTimers();
    const pending = withAiTimeout(new Promise(() => undefined), 50);
    const expectation = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(50);
    await expectation;
    vi.useRealTimers();
  });
});
