// Real SDK serialization with a mocked transport: never contacts a provider.
import { afterEach, describe, expect, it, vi } from "vitest";
import { callAiJson, callGroundedAiJson } from "./providerClients";

afterEach(() => vi.restoreAllMocks());

describe("Gemini wire privacy controls", () => {
  it.each([false, true])(
    "sends a top-level logging opt-out through the real SDK (grounded=%s)",
    async (grounded) => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"analysis":"ok","suggestions":[]}' }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
      const base = {
        apiKey: "test-private-key",
        model: "gemini-3.1-pro-preview",
        systemPrompt: "Return JSON.",
        userPrompt: "Analyze financial inputs.",
      };
      if (grounded) await callGroundedAiJson(base);
      else
        await callAiJson({
          ...base,
          provider: "gemini",
          jsonSchema: { type: "object" },
          pdf: { name: "rates.pdf", mimeType: "application/pdf", base64Data: "ZmFrZQ==" },
        });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).not.toContain(base.apiKey);
      const body = JSON.parse(String(init?.body));
      expect(body.store).toBe(false);
      expect(body.generationConfig.store).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(base.apiKey);
      expect(body.systemInstruction.parts[0].text).toBe(base.systemPrompt);
      expect(body.contents[0].parts).toEqual(expect.arrayContaining([{ text: base.userPrompt }]));
      if (grounded) expect(body.tools).toEqual([{ googleSearch: {} }]);
      else expect(body.contents[0].parts[0].inlineData.mimeType).toBe("application/pdf");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  );
});
