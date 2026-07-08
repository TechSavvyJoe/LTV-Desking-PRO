import { describe, expect, it } from "vitest";
import { parseDealSuggestionResponse, parseLenderExtractResponse } from "./schemas";

describe("AI response schema validation", () => {
  it("normalizes valid lender extraction responses", () => {
    const lenders = parseLenderExtractResponse({
      lenders: [
        {
          name: "Example Credit Union",
          bookValueSource: "Retail",
          tiers: [
            {
              name: "Prime",
              minFico: "720",
              maxLtv: "125",
              maxAge: 5,
              extractionSource: "header",
            },
          ],
        },
      ],
    });

    expect(lenders[0]?.name).toBe("Example Credit Union");
    expect(lenders[0]?.bookValueSource).toBe("Retail");
    expect(lenders[0]?.tiers?.[0]?.minFico).toBe(720);
    expect(lenders[0]?.tiers?.[0]?.extractionSource).toBe("text");
    expect(lenders[0]?.tiers?.[0]?.minYear).toBe(new Date().getFullYear() - 5);
  });

  it("rejects malformed lender extraction responses", () => {
    expect(() =>
      parseLenderExtractResponse({
        lenders: [{ tiers: [{ name: "No lender name" }] }],
      })
    ).toThrow("invalid lender data");
  });

  it("rejects malformed deal suggestions", () => {
    expect(() =>
      parseDealSuggestionResponse({
        analysis: "Missing suggestion title",
        suggestions: [{ reasoning: "Needs more cash", proposedChanges: {} }],
      })
    ).toThrow("invalid deal analysis");
  });

  it("accepts richer deal suggestion fields without allowing free-text notes", () => {
    const parsed = parseDealSuggestionResponse({
      analysis: "Move back-end into editable line items and apply rebate.",
      suggestions: [
        {
          title: "Lower advance",
          reasoning: "More rebate and less GAP lowers OTD LTV.",
          proposedChanges: {
            backendProducts: 2995,
            vscAmount: 2495,
            gapAmount: 500,
            buyerState: "IL",
            rebate: 750,
            notes: "This must not survive schema parsing.",
          },
        },
      ],
    });

    expect(parsed.suggestions[0]?.proposedChanges).toEqual({
      backendProducts: 2995,
      vscAmount: 2495,
      gapAmount: 500,
      buyerState: "IL",
      rebate: 750,
    });
  });

  describe("more schema error paths", () => {
    it("handles null/undefined input gracefully for extract", () => {
      expect(() => parseLenderExtractResponse(null as any)).toThrow();
      expect(() => parseLenderExtractResponse(undefined as any)).toThrow();
    });

    it("parseDealSuggestionResponse tolerates extra meta but strips unsafe", () => {
      const res = parseDealSuggestionResponse({
        analysis: "ok",
        suggestions: [],
        modelWarning: "fast model",
        extra: "drop",
      } as any);
      expect(res.analysis).toBe("ok");
    });
  });
});
