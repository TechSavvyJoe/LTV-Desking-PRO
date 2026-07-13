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
    expect(body.store).toBe(false);
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
    // Anthropic has no store:false flag; ensure we did not invent one.
    expect(body.store).toBeUndefined();
    expect(body.cache_control).toBeUndefined();
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
          store: false,
        }),
      })
    );
  });

  it("rejects operations that exceed the AI timeout", async () => {
    vi.useFakeTimers();
    const pending = withAiTimeout(() => new Promise(() => undefined), 50);
    const expectation = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(50);
    await expectation;
    vi.useRealTimers();
  });

  it("aborts the underlying provider request when the timeout fires", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const pending = withAiTimeout((signal) => {
      observedSignal = signal;
      return new Promise(() => undefined);
    }, 50);
    const expectation = expect(pending).rejects.toThrow("timed out");

    expect(observedSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    await expectation;
    expect(observedSignal?.aborted).toBe(true);
    vi.useRealTimers();
  });

  it("passes an abort signal through to provider fetch calls", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: '{"analysis":"ok","suggestions":[]}' }), {
        status: 200,
      })
    );

    await callAiJson({ ...requestBase, provider: "openai", model: "gpt-5.5" });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("propagates fetch network errors for OpenAI", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      callAiJson({ ...requestBase, provider: "openai", model: "gpt-5.5" })
    ).rejects.toThrow("ECONNRESET");
  });

  it("throws on non-ok HTTP from OpenAI using error body message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 })
    );
    await expect(
      callAiJson({ ...requestBase, provider: "openai", model: "gpt-5.5" })
    ).rejects.toThrow("quota exceeded");
  });

  it("throws on non-ok from Anthropic", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "rate limit" } }), { status: 429 })
    );
    await expect(
      callAiJson({ ...requestBase, provider: "anthropic", model: "claude-opus-4-7" })
    ).rejects.toThrow("rate limit");
  });

  it("handles Gemini generateContent throwing", async () => {
    mockGenerateContent.mockRejectedValue(new Error("Gemini internal"));
    await expect(
      callAiJson({
        ...requestBase,
        provider: "gemini",
        model: "gemini-3.1-flash-lite",
        apiKey: "g-key",
      })
    ).rejects.toThrow("Gemini internal");
  });

  it("extracts JSON from fenced blocks and object matches on bad direct parse", async () => {
    // Force path through extract by simulating a provider response with fenced json
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: '```json\n{"analysis":"fenced ok"}\n```' }), {
        status: 200,
      })
    );
    const res = await callAiJson({ ...requestBase, provider: "openai", model: "gpt-5.5" });
    expect(res).toEqual({ analysis: "fenced ok" });
  });

  it("rejects empty response text from provider", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: "" }), { status: 200 })
    );
    await expect(
      callAiJson({ ...requestBase, provider: "openai", model: "gpt-5.5" })
    ).rejects.toThrow("empty response");
  });

  it("rejects non-matching text with no recoverable JSON object", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: "plain text no json here at all" }), {
        status: 200,
      })
    );
    await expect(
      callAiJson({ ...requestBase, provider: "openai", model: "gpt-5.5" })
    ).rejects.toThrow("valid JSON");
  });

  it("callGroundedAiJson can be exercised (gemini grounded path)", async () => {
    vi.restoreAllMocks();
    mockGenerateContent.mockReset();
    // Re-mock generate to return grounded structure for this case
    mockGenerateContent.mockResolvedValue({
      text: '{"ok":true}',
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [{ web: { uri: "https://example.com", title: "Ex" } }],
          },
        },
      ],
    });
    const { callGroundedAiJson } = await import("./providerClients");
    const res = await callGroundedAiJson({
      apiKey: "g",
      model: "gemini-3.1-pro-preview",
      systemPrompt: "sys",
      userPrompt: "user",
    });
    expect(res.json).toEqual({ ok: true });
    expect(res.sources.length).toBeGreaterThan(0);
  });

  it("recovers JSON via object regex extraction on malformed provider text [AI-error-recovery]", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ output_text: 'prefix junk { "recovered": true, "note": "ok" } suffix' }),
        { status: 200 }
      )
    );
    const res = await callAiJson({ ...requestBase, provider: "openai", model: "gpt-5.5" });
    expect(res).toEqual({ recovered: true, note: "ok" });
  });

  it("propagates network errors for Anthropic call (error recovery path) [AI-error-recovery]", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ENOTFOUND anthropic"));
    await expect(
      callAiJson({ ...requestBase, provider: "anthropic", model: "claude-opus-4-7" })
    ).rejects.toThrow("ENOTFOUND anthropic");
  });

  it("rejects when provider returns ok but body parse yields no usable text for extract [AI-error-recovery]", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: "   " }), { status: 200 })
    );
    await expect(
      callAiJson({ ...requestBase, provider: "openai", model: "gpt-5.5" })
    ).rejects.toThrow("empty response");
  });
});
