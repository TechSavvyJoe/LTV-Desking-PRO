import { describe, expect, it } from "vitest";
import {
  applyRangeChecks,
  parseDealSuggestionResponse,
  parseLenderExtractResponse,
} from "./schemas";

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

  describe("AI extraction plausibility ranges — a misread never becomes a verified program [takeover-P1]", () => {
    const extractTier = (tier: Record<string, unknown>) =>
      parseLenderExtractResponse({
        lenders: [{ name: "Lender", tiers: [{ name: "T1", ...tier }] }],
      })[0]?.tiers?.[0];

    it("drops an implausible LTV (150% misread as 1500), flags it, and caps confidence", () => {
      const tier = extractTier({ maxLtv: 1500, minFico: 660, confidence: 0.95 });
      expect(tier).not.toHaveProperty("maxLtv");
      expect(tier?.minFico).toBe(660);
      expect(tier?.rangeFlags).toEqual(["maxLtv=1500 outside 20-200"]);
      expect(tier?.confidence).toBeLessThanOrEqual(0.4);
    });

    it("drops an implausible FICO (660 misread as 6600) and a 720-month term", () => {
      const tier = extractTier({ minFico: 6600, maxTerm: 720, maxLtv: 130 });
      expect(tier).not.toHaveProperty("minFico");
      expect(tier).not.toHaveProperty("maxTerm");
      expect(tier?.maxLtv).toBe(130);
      expect(tier?.rangeFlags).toHaveLength(2);
    });

    it("drops an implausible buy rate (65%) so the desk cannot quote it", () => {
      const tier = extractTier({ baseInterestRate: 65, minFico: 600 });
      expect(tier).not.toHaveProperty("baseInterestRate");
      expect(tier?.rangeFlags?.[0]).toMatch(/baseInterestRate=65/);
    });

    it("drops an implausible vehicle age together with the year it would have derived", () => {
      const tier = extractTier({ maxAge: 300, minFico: 640 });
      expect(tier).not.toHaveProperty("maxAge");
      expect(tier).not.toHaveProperty("minYear");
    });

    it("leaves plausible values untouched with no flags and preserved confidence", () => {
      const tier = extractTier({
        minFico: 640,
        maxFico: 850,
        maxLtv: 135,
        maxTerm: 84,
        maxMileage: 120000,
        baseInterestRate: 7.49,
        maxPti: 18,
        confidence: 0.9,
      });
      expect(tier).toMatchObject({
        minFico: 640,
        maxFico: 850,
        maxLtv: 135,
        maxTerm: 84,
        maxMileage: 120000,
        baseInterestRate: 7.49,
        maxPti: 18,
        confidence: 0.9,
      });
      expect(tier).not.toHaveProperty("rangeFlags");
    });

    it("normalizes a confidence emitted as a percentage (85 → 0.85)", () => {
      const tier = extractTier({ minFico: 700, confidence: 85 });
      expect(tier?.confidence).toBeCloseTo(0.85, 5);
      expect(tier).not.toHaveProperty("rangeFlags");
    });

    it("applyRangeChecks is usable directly on a tier", () => {
      const checked = applyRangeChecks({ name: "T", maxLtv: 999, otdLtv: 120 });
      expect(checked).not.toHaveProperty("maxLtv");
      expect(checked.otdLtv).toBe(120);
      expect(checked.confidence).toBe(0.4);
    });
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
