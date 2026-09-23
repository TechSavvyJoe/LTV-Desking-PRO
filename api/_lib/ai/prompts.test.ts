import { describe, expect, it } from "vitest";
import type {
  CalculatedVehicle,
  DealData,
  FilterData,
  LenderProfile,
  LenderTier,
} from "../../../types";
import { buildDealAnalysisPrompt } from "./prompts";

const vehicle = { vin: "VIN1", vehicle: "2021 Camry", amountToFinance: 20000 } as CalculatedVehicle;
const deal = { downPayment: 2000, loanTerm: 72, notes: "" } as unknown as DealData;
const filters = { creditScore: 700 } as unknown as FilterData;

/** The "Lender profiles:" JSON block exactly as the model receives it. */
const lenderSection = (prompt: string): Array<Record<string, unknown>> => {
  const start = prompt.indexOf("Lender profiles:\n") + "Lender profiles:\n".length;
  const end = prompt.indexOf("\n\nAvailable inventory");
  return JSON.parse(prompt.slice(start, end)) as Array<Record<string, unknown>>;
};

describe("buildDealAnalysisPrompt — held tiers are never an approval path [ai-range-guard]", () => {
  const clean: LenderTier = { name: "Prime", minFico: 700, maxLtv: 120, maxTerm: 72 };
  const held: LenderTier = {
    name: "Tier 2",
    maxTerm: 84,
    needsReview: true,
    rangeFlags: ["baseInterestRate=649 outside 0-40", "maxLtv=1500 outside 20-200"],
  };
  const legacyHeld: LenderTier = { name: "Legacy", rangeFlags: ["minFico=6600 outside 300-850"] };

  it("sends only clean tiers as programs and names held tiers as pending verification", () => {
    const profile = { id: "l1", name: "Bank A", tiers: [clean, held, legacyHeld] } as LenderProfile;
    const prompt = buildDealAnalysisPrompt(vehicle, deal, filters, [profile], []);
    const [lender] = lenderSection(prompt);

    expect(lender?.tiers).toEqual([clean]);
    expect(lender?.tiersPendingVerification).toEqual(["Tier 2", "Legacy"]);
    expect(prompt).toContain(
      'Tiers listed under a lender\'s "tiersPendingVerification" are pending verification — not an approval path.'
    );
    // The held tier's widened limits and its misread values never reach the model.
    expect(prompt).not.toMatch(/649|6600|1500|rangeFlags|needsReview/);
  });

  it("omits the pending list when every tier is clean", () => {
    const profile = { id: "l1", name: "Bank A", tiers: [clean] } as LenderProfile;
    const [lender] = lenderSection(buildDealAnalysisPrompt(vehicle, deal, filters, [profile], []));

    expect(lender?.tiers).toEqual([clean]);
    expect(lender).not.toHaveProperty("tiersPendingVerification");
  });

  it("tolerates a client payload whose tiers are not an array", () => {
    const profile = { id: "l1", name: "Bank A", tiers: "oops" } as unknown as LenderProfile;
    const [lender] = lenderSection(buildDealAnalysisPrompt(vehicle, deal, filters, [profile], []));

    expect(lender?.tiers).toEqual([]);
  });
});
