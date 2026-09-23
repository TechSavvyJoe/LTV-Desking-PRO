import { describe, expect, it } from "vitest";
import { checkBankEligibility } from "../../../services/lenderMatcher";
import type { CalculatedVehicle, DealData, FilterData, LenderProfile } from "../../../types";
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
      expect(tier?.needsReview).toBe(true);
    });

    it("drops an implausible FICO (660 misread as 6600) and a 720-month term", () => {
      const tier = extractTier({ minFico: 6600, maxTerm: 720, maxLtv: 130 });
      expect(tier).not.toHaveProperty("minFico");
      expect(tier).not.toHaveProperty("maxTerm");
      expect(tier?.maxLtv).toBe(130);
      expect(tier?.rangeFlags).toHaveLength(2);
      expect(tier?.needsReview).toBe(true);
    });

    it("drops an implausible buy rate (65%) so the desk cannot quote it", () => {
      const tier = extractTier({ baseInterestRate: 65, minFico: 600 });
      expect(tier).not.toHaveProperty("baseInterestRate");
      expect(tier?.rangeFlags?.[0]).toMatch(/baseInterestRate=65/);
      expect(tier?.needsReview).toBe(true);
    });

    it("drops an implausible vehicle age together with the year it would have derived", () => {
      const tier = extractTier({ maxAge: 300, minFico: 640 });
      expect(tier).not.toHaveProperty("maxAge");
      expect(tier).not.toHaveProperty("minYear");
      expect(tier?.needsReview).toBe(true);
    });

    it("keeps a tier whose gating minimum was implausible but marks it needsReview with the sheet value [ai-range-guard]", () => {
      const tier = extractTier({ minFico: 6600, maxTerm: 84, maxLtv: 130, confidence: 0.95 });
      expect(tier).toMatchObject({
        name: "T1",
        maxTerm: 84,
        maxLtv: 130,
        needsReview: true,
        rangeFlags: ["minFico=6600 outside 300-850"],
      });
      expect(tier).not.toHaveProperty("minFico");
    });

    it("derives the review verdict from the values alone — AI-supplied flags are ignored", () => {
      const forgedClear = extractTier({
        minFico: 6600,
        needsReview: false,
        rangeFlags: [],
      });
      expect(forgedClear?.needsReview).toBe(true);
      expect(forgedClear?.rangeFlags).toEqual(["minFico=6600 outside 300-850"]);

      const clean = extractTier({ minFico: 660, needsReview: true, rangeFlags: ["x"] });
      expect(clean).not.toHaveProperty("needsReview");
      expect(clean).not.toHaveProperty("rangeFlags");
    });

    it("a misread minimum never turns into an approval path downstream (fail closed) [ai-range-guard]", () => {
      // The reviewer's probe: "Tier A: 660+ FICO" misread as 6600, desked for a
      // 520-FICO buyer. Dropping minFico alone made this tier match everyone.
      const tier = extractTier({ minFico: 6600, maxTerm: 84, maxLtv: 130, confidence: 0.95 });
      const lender: LenderProfile = { id: "ai", name: "AI Lender", tiers: tier ? [tier] : [] };
      const vehicle = {
        vehicle: "2021 Test",
        stock: "S1",
        vin: "VIN1",
        modelYear: 2021,
        mileage: 30000,
        price: 21000,
        jdPower: 21000,
        jdPowerRetail: 23000,
        unitCost: 18000,
        baseOutTheDoorPrice: 22000,
        salesTax: 1200,
        frontEndLtv: 100,
        frontEndGross: 3000,
        amountToFinance: 20000,
        otdLtv: 95,
        monthlyPayment: 400,
      } as CalculatedVehicle;
      const deal = {
        creditScore: 520,
        loanTerm: 72,
        monthlyIncome: 4000,
        backendProducts: 0,
        interestRate: 12,
      } as unknown as DealData & FilterData;

      const result = checkBankEligibility(vehicle, deal, lender);
      expect(result.eligible).toBe(false);
      expect(result.status).toBe("pending");
      expect(result.reasons[0]).toMatch(/needs review.*minFico=6600 outside 300-850/);
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
      expect(tier).not.toHaveProperty("needsReview");
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
      expect(checked.needsReview).toBe(true);
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
