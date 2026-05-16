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
});
