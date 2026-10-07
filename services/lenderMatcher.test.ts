import { describe, it, expect } from "vitest";
import {
  checkBankEligibility,
  flaggedFieldName,
  markTierVerified,
  resolveRangeFlag,
  reviewFieldLabel,
  reviewFieldLabels,
  reviewableFieldsIn,
  tierNeedsReview,
  unverifiedReviewFields,
} from "./lenderMatcher";
import type { CalculatedVehicle, LenderProfile, DealData, FilterData } from "../types";

// Helper to create a mock vehicle
const mockVehicle = (overrides: Partial<CalculatedVehicle> = {}): CalculatedVehicle => ({
  vehicle: "2021 Toyota Camry",
  stock: "123",
  vin: "TEST123",
  modelYear: 2021,
  mileage: 25000,
  price: 25000,
  jdPower: 22000,
  jdPowerRetail: 24000,
  unitCost: 20000,
  baseOutTheDoorPrice: 27000,
  salesTax: 1500,
  frontEndLtv: 100,
  frontEndGross: 5000,
  amountToFinance: 25000,
  otdLtv: 113,
  monthlyPayment: 450,
  ...overrides,
});

// Helper to create mock deal+filter data
const mockDeal = (overrides: Partial<DealData & FilterData> = {}): DealData & FilterData => ({
  downPayment: 2000,
  tradeInValue: 0,
  tradeInPayoff: 0,
  backendProducts: 0,
  loanTerm: 60,
  interestRate: 6.99,
  stateFees: 200,
  notes: "",
  creditScore: 720,
  monthlyIncome: 5000,
  vehicle: "",
  maxPrice: null,
  maxPayment: null,
  maxMiles: null,
  maxOtdLtv: null,
  vin: "",
  ...overrides,
});

// Helper to create mock lender profile
const mockLender = (overrides: Partial<LenderProfile> = {}): LenderProfile => ({
  id: "test-lender",
  name: "Test Bank",
  bookValueSource: "Trade",
  tiers: [
    {
      name: "Prime",
      minFico: 700,
      maxFico: 850,
      maxLtv: 125,
      maxTerm: 72,
      minYear: 2018,
      maxMileage: 100000,
    },
    {
      name: "Near Prime",
      minFico: 600,
      maxFico: 699,
      maxLtv: 110,
      maxTerm: 60,
      minYear: 2019,
      maxMileage: 80000,
    },
  ],
  ...overrides,
});

describe("checkBankEligibility", () => {
  describe("successful matching", () => {
    it("matches a prime customer with prime tier", () => {
      const result = checkBankEligibility(
        mockVehicle({ otdLtv: 110, amountToFinance: 22000 }),
        mockDeal({ creditScore: 720 }),
        mockLender()
      );

      expect(result.eligible).toBe(true);
      expect(result.matchedTier?.name).toBe("Prime");
      expect(result.reasons).toHaveLength(0);
    });

    it("matches near-prime customer with near-prime tier", () => {
      const result = checkBankEligibility(
        mockVehicle({
          modelYear: 2020,
          mileage: 50000,
          amountToFinance: 20000,
          jdPower: 22000,
        }),
        mockDeal({ creditScore: 650, loanTerm: 48 }),
        mockLender()
      );

      expect(result.eligible).toBe(true);
      expect(result.matchedTier?.name).toBe("Near Prime");
    });
  });

  describe("credit score rejections", () => {
    it("rejects when credit score is below all tiers", () => {
      const result = checkBankEligibility(
        mockVehicle(),
        mockDeal({ creditScore: 550 }),
        mockLender()
      );

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain(
        "No fitting lending tier found for this deal structure and vehicle."
      );
    });

    it("handles null credit score", () => {
      const result = checkBankEligibility(
        mockVehicle(),
        mockDeal({ creditScore: null }),
        mockLender()
      );

      expect(result.eligible).toBe(false);
    });
  });

  describe("vehicle year restrictions", () => {
    it("rejects vehicle too old for all tiers", () => {
      const result = checkBankEligibility(
        mockVehicle({ modelYear: 2015 }),
        mockDeal({ creditScore: 720 }),
        mockLender()
      );

      expect(result.eligible).toBe(false);
    });
  });

  describe("mileage restrictions", () => {
    it("rejects vehicle with too many miles", () => {
      const result = checkBankEligibility(
        mockVehicle({ mileage: 150000 }),
        mockDeal({ creditScore: 720 }),
        mockLender()
      );

      expect(result.eligible).toBe(false);
    });
  });

  describe("LTV restrictions", () => {
    it("rejects when LTV exceeds tier maximum", () => {
      const result = checkBankEligibility(
        mockVehicle({ amountToFinance: 30000, jdPower: 20000 }), // 150% LTV
        mockDeal({ creditScore: 720 }),
        mockLender()
      );

      expect(result.eligible).toBe(false);
    });
  });

  describe("income/PTI checks", () => {
    it("rejects when income is below minimum", () => {
      const result = checkBankEligibility(
        mockVehicle(),
        mockDeal({ creditScore: 720, monthlyIncome: 1500 }),
        mockLender({ minIncome: 2000 })
      );

      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes("Income too low"))).toBe(true);
    });

    it("rejects when PTI exceeds maximum", () => {
      const result = checkBankEligibility(
        mockVehicle({ monthlyPayment: 800 }),
        mockDeal({ creditScore: 720, monthlyIncome: 2000 }),
        mockLender({ maxPti: 25 }) // PTI would be 40%
      );

      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes("PTI too high"))).toBe(true);
    });
  });

  describe("defensive programming", () => {
    it("handles null bank profile", () => {
      const result = checkBankEligibility(
        mockVehicle(),
        mockDeal(),
        null as unknown as LenderProfile
      );

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("Invalid bank profile data.");
    });

    it("handles null deal data", () => {
      const result = checkBankEligibility(
        mockVehicle(),
        null as unknown as DealData & FilterData,
        mockLender()
      );

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("Invalid deal data.");
    });

    it("handles empty tiers array", () => {
      const result = checkBankEligibility(mockVehicle(), mockDeal(), mockLender({ tiers: [] }));

      expect(result.eligible).toBe(false);
    });

    it("handles undefined tiers", () => {
      const result = checkBankEligibility(mockVehicle(), mockDeal(), {
        id: "test",
        name: "Bad Bank",
      } as unknown as LenderProfile);

      expect(result.eligible).toBe(false);
    });
  });

  describe("book value source", () => {
    it("uses trade book by default", () => {
      const result = checkBankEligibility(
        mockVehicle({
          jdPower: 20000,
          jdPowerRetail: 25000,
          amountToFinance: 24000,
        }),
        mockDeal({ creditScore: 720 }),
        mockLender({ bookValueSource: "Trade" }) // 120% Trade LTV - too high for 125% cap
      );

      // With trade book of 20000 and 24000 financed, LTV = 120% (within 125%)
      expect(result.eligible).toBe(true);
    });

    it("uses retail book when specified", () => {
      const result = checkBankEligibility(
        mockVehicle({
          jdPower: 20000,
          jdPowerRetail: 25000,
          amountToFinance: 28000,
        }),
        mockDeal({ creditScore: 720 }),
        mockLender({ bookValueSource: "Retail" }) // 112% Retail LTV
      );

      // With retail book of 25000 and 28000 financed, LTV = 112% (within 125%)
      expect(result.eligible).toBe(true);
    });

    it("does not substitute trade book when a required retail book is missing", () => {
      const lender = mockLender({
        bookValueSource: "Retail",
        tiers: [{ name: "Retail book", maxLtv: 120 }],
      });
      const result = checkBankEligibility(
        mockVehicle({ jdPower: 25000, jdPowerRetail: "N/A" }),
        mockDeal(),
        lender
      );

      expect(result.eligible).toBe(false);
      expect(result.status).toBe("pending");
      expect(result.uncheckedConstraints).toContain("book value for LTV");
    });
  });
});

describe("tier otdLtv cap enforcement [review/P2]", () => {
  it("rejects when the deal exceeds a tier that only carries otdLtv", () => {
    // amt 25000 / trade book 22000 ≈ 113.6% — above the 110% otdLtv cap.
    const lender = mockLender({
      tiers: [{ name: "AI-extracted", minFico: 600, otdLtv: 110 }],
    });
    const result = checkBankEligibility(mockVehicle(), mockDeal(), lender);
    expect(result.eligible).toBe(false);
  });

  it("passes when the deal is under the otdLtv-only cap", () => {
    const lender = mockLender({
      tiers: [{ name: "AI-extracted", minFico: 600, otdLtv: 120 }],
    });
    const result = checkBankEligibility(mockVehicle(), mockDeal(), lender);
    expect(result.eligible).toBe(true);
  });

  it("enforces the STRICTER of maxLtv and otdLtv when both exist", () => {
    const lender = mockLender({
      tiers: [{ name: "Dual-cap", minFico: 600, maxLtv: 130, otdLtv: 110 }],
    });
    const result = checkBankEligibility(mockVehicle(), mockDeal(), lender);
    expect(result.eligible).toBe(false);
  });
});

// --- coverage for pre-1980 years, float loanTerm, blank/negative edge cases ---
describe("edge coverage gaps (pre-1980, float term, blank, negative)", () => {
  it("rejects pre-1980 vehicle years when tier minYear is later (e.g. 2018)", () => {
    const result = checkBankEligibility(
      mockVehicle({ modelYear: 1978 }),
      mockDeal({ creditScore: 720 }),
      mockLender()
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain(
      "No fitting lending tier found for this deal structure and vehicle."
    );
  });

  it("coerces float loanTerm for tier checks without error", () => {
    const result = checkBankEligibility(
      mockVehicle(),
      mockDeal({ loanTerm: 59.9 }),
      mockLender({
        tiers: [{ name: "Flex", minFico: 700, maxTerm: 72 }],
      })
    );
    // 59.9 < 72, should still match if other ok (fico default 720)
    expect(result.eligible).toBe(true);
  });

  it("handles blank/zeroed inputs defensively (amountToFinance sentinel, year NaN)", () => {
    const badVehicle = mockVehicle({ amountToFinance: "N/A" as any, modelYear: "N/A" as any });
    const badDeal = mockDeal({ loanTerm: 0 as any, creditScore: null });
    const result = checkBankEligibility(badVehicle, badDeal, mockLender());
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toMatch(/financed amount unavailable/i);
  });

  it("treats negative amountToFinance as ineligible (LTV/amount checks)", () => {
    const negFinanced = mockVehicle({ amountToFinance: -1000, jdPower: 20000 });
    const result = checkBankEligibility(negFinanced, mockDeal(), mockLender());
    expect(result.eligible).toBe(false);
  });
});

describe("conservative lender-wide constraints and pending inputs", () => {
  it("requires a positive principal even when a tier has no LTV rule", () => {
    const lender = mockLender({ tiers: [{ name: "Open" }] });
    const result = checkBankEligibility(mockVehicle({ amountToFinance: 0 }), mockDeal(), lender);

    expect(result.eligible).toBe(false);
    expect(result.status).toBe("ineligible");
    expect(result.reasons[0]).toMatch(/greater than \$0/i);
  });

  it("enforces lender-wide financed minimum and maximum", () => {
    const lender = mockLender({
      minAmountFinanced: 20000,
      maxAmountFinanced: 24000,
      tiers: [{ name: "Open" }],
    });

    expect(
      checkBankEligibility(mockVehicle({ amountToFinance: 19000 }), mockDeal(), lender).eligible
    ).toBe(false);
    expect(
      checkBankEligibility(mockVehicle({ amountToFinance: 25000 }), mockDeal(), lender).eligible
    ).toBe(false);
    expect(
      checkBankEligibility(mockVehicle({ amountToFinance: 22000 }), mockDeal(), lender).eligible
    ).toBe(true);
  });

  it("enforces a zero lender-wide backend cap", () => {
    const lender = mockLender({ maxBackend: 0, tiers: [{ name: "No backend" }] });
    const result = checkBankEligibility(mockVehicle(), mockDeal({ backendProducts: 1 }), lender);

    expect(result.eligible).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("Backend too high"))).toBe(true);
  });

  it("enforces lender-wide DTI using existing debt plus the proposed payment", () => {
    const lender = mockLender({ maxDti: 25, tiers: [{ name: "DTI" }] });
    const result = checkBankEligibility(
      mockVehicle({ monthlyPayment: 500 }),
      mockDeal({ monthlyIncome: 5000, monthlyDebt: 1000 }),
      lender
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("DTI too high"))).toBe(true);
  });

  it("marks required DTI data pending instead of assuming zero debt", () => {
    const lender = mockLender({ maxDti: 40, tiers: [{ name: "DTI" }] });
    const result = checkBankEligibility(
      mockVehicle({ monthlyPayment: 500 }),
      mockDeal({ monthlyIncome: 5000, monthlyDebt: null }),
      lender
    );

    expect(result.eligible).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.uncheckedConstraints.join(" ")).toMatch(/monthly debt/i);
  });

  it("marks missing borrower and vehicle inputs pending", () => {
    const lender = mockLender({
      tiers: [
        {
          name: "Required data",
          minFico: 600,
          maxMileage: 100000,
          includedMakes: ["Toyota"],
          maxRate: 15,
        },
      ],
    });
    const result = checkBankEligibility(
      mockVehicle({ mileage: "N/A", make: undefined }),
      mockDeal({ creditScore: null, interestRate: "" }),
      lender
    );

    expect(result.eligible).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.uncheckedConstraints).toEqual(
      expect.arrayContaining(["credit score", "vehicle mileage", "vehicle make", "quoted APR"])
    );
  });

  it("uses amount financed as the max-backend-percent denominator", () => {
    const lender = mockLender({
      tiers: [{ name: "Backend percent", maxBackendPercent: 10 }],
    });
    const result = checkBankEligibility(
      mockVehicle({ amountToFinance: 25000, jdPower: 100000 }),
      mockDeal({ backendProducts: 3000 }),
      lender
    );

    expect(result.eligible).toBe(false);
  });

  it("chooses the lowest-rate passing tier instead of the first tier", () => {
    const lender = mockLender({
      tiers: [
        { name: "Expensive", minFico: 700, baseInterestRate: 9.5 },
        { name: "Better", minFico: 700, baseInterestRate: 6.5, rateAdder: 0.25 },
      ],
    });
    const result = checkBankEligibility(mockVehicle(), mockDeal(), lender);

    expect(result.matchedTier?.name).toBe("Better");
    expect(result.effectiveRate).toBe(6.75);
  });

  it("keeps an otherwise fitting sample program pending", () => {
    const result = checkBankEligibility(
      mockVehicle(),
      mockDeal(),
      mockLender({ isSample: true, tiers: [{ name: "Illustrative" }] })
    );

    expect(result.eligible).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.reasons[0]).toMatch(/illustrative only/i);
  });

  it("keeps a non-matching sample visible as pending with provenance", () => {
    const result = checkBankEligibility(
      mockVehicle(),
      mockDeal({ creditScore: 720 }),
      mockLender({
        isSample: true,
        tiers: [{ name: "Illustrative super-prime", minFico: 800 }],
      })
    );

    expect(result.eligible).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/illustrative only/i),
        expect.stringMatching(/criteria do not currently match/i),
      ])
    );
  });

  it("retains sample provenance when the principal itself is invalid", () => {
    const result = checkBankEligibility(
      mockVehicle({ amountToFinance: 0 }),
      mockDeal(),
      mockLender({ isSample: true, tiers: [{ name: "Illustrative" }] })
    );

    expect(result.eligible).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/illustrative only/i),
        expect.stringMatching(/greater than \$0/i),
      ])
    );
  });
});

describe("AI-flagged tiers are held for review, never an approval path [ai-range-guard]", () => {
  // Server output for "Tier A: 660+ FICO" misread as 6600: the implausible
  // minFico was dropped, so without the hold this tier would match everyone.
  const flaggedTier = {
    name: "Tier A",
    maxTerm: 84,
    maxLtv: 130,
    confidence: 0.4,
    rangeFlags: ["minFico=6600 outside 300-850"],
    needsReview: true,
  };

  it("resolves a flagged tier that passes its plausible rules to pending, naming the flagged field", () => {
    const result = checkBankEligibility(
      mockVehicle({ amountToFinance: 20000, jdPower: 21000 }),
      mockDeal({ creditScore: 520 }),
      mockLender({ tiers: [flaggedTier] })
    );

    expect(result.eligible).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.matchedTier?.name).toBe("Tier A");
    expect(result.reasons).toEqual([
      'Tier "Tier A" needs review - implausible min FICO read from the rate sheet. Verify it against the lender\'s official sheet and correct the tier before using it as an approval path.',
    ]);
    expect(result.uncheckedConstraints).toEqual([
      "AI-read tier needs review - verify against the lender's sheet",
    ]);
  });

  it("still rejects a flagged tier that fails a rule it does carry", () => {
    // 27000 / 20000 book = 135% LTV fails maxLtv 130 → restoring the dropped
    // minimum could only reject more, so this is an honest "ineligible".
    const result = checkBankEligibility(
      mockVehicle({ amountToFinance: 27000, jdPower: 20000 }),
      mockDeal({ creditScore: 720 }),
      mockLender({ tiers: [flaggedTier] })
    );

    expect(result.status).toBe("ineligible");
    expect(result.reasons).toContain(
      "No fitting lending tier found for this deal structure and vehicle."
    );
  });

  it("prefers a clean passing tier from the same lender over the held one", () => {
    const result = checkBankEligibility(
      mockVehicle({ amountToFinance: 20000, jdPower: 21000 }),
      mockDeal({ creditScore: 720 }),
      mockLender({ tiers: [flaggedTier, { name: "Clean", minFico: 700, maxLtv: 120 }] })
    );

    expect(result.eligible).toBe(true);
    expect(result.status).toBe("eligible");
    expect(result.matchedTier?.name).toBe("Clean");
  });

  it("lists missing deal inputs after the review reason", () => {
    const result = checkBankEligibility(
      mockVehicle(),
      mockDeal({ loanTerm: "" as unknown as number }),
      mockLender({ tiers: [flaggedTier] })
    );

    expect(result.status).toBe("pending");
    expect(result.reasons[0]).toMatch(/^Tier "Tier A" needs review/);
    expect(result.reasons[1]).toBe("Pending required information: loan term.");
  });

  it("keeps sample provenance first when a sample program is also flagged", () => {
    const result = checkBankEligibility(
      mockVehicle({ amountToFinance: 20000, jdPower: 21000 }),
      mockDeal(),
      mockLender({ isSample: true, tiers: [flaggedTier] })
    );

    expect(result.status).toBe("pending");
    expect(result.reasons[0]).toMatch(/illustrative only/i);
    expect(result.reasons[1]).toMatch(/needs review/);
    expect(result.reasons).toHaveLength(2);
  });

  it("holds legacy tiers that carry rangeFlags without needsReview, and needsReview without flags", () => {
    const { needsReview: _dropped, ...legacy } = flaggedTier;
    const legacyResult = checkBankEligibility(
      mockVehicle({ amountToFinance: 20000, jdPower: 21000 }),
      mockDeal(),
      mockLender({ tiers: [legacy] })
    );
    expect(legacyResult.status).toBe("pending");

    const bare = checkBankEligibility(
      mockVehicle({ amountToFinance: 20000, jdPower: 21000 }),
      mockDeal(),
      mockLender({ tiers: [{ name: "Bare", needsReview: true }] })
    );
    expect(bare.status).toBe("pending");
    expect(bare.reasons[0]).toBe(
      'Tier "Bare" needs review. Verify it against the lender\'s official sheet and correct the tier before using it as an approval path.'
    );
  });

  it("tierNeedsReview is false once a human clears both flags", () => {
    expect(tierNeedsReview(flaggedTier)).toBe(true);
    expect(tierNeedsReview({ ...flaggedTier, needsReview: false })).toBe(true);
    expect(tierNeedsReview({ ...flaggedTier, needsReview: false, rangeFlags: [] })).toBe(false);
    expect(tierNeedsReview({ name: "Clean", minFico: 660 })).toBe(false);

    const corrected = checkBankEligibility(
      mockVehicle({ amountToFinance: 20000, jdPower: 21000 }),
      mockDeal({ creditScore: 700 }),
      mockLender({ tiers: [{ name: "Tier A", minFico: 660, maxTerm: 84, maxLtv: 130 }] })
    );
    expect(corrected.status).toBe("eligible");
  });
});

describe("review reasons name fields only, never the flagged value [ai-range-guard]", () => {
  const passingDeal = () =>
    [
      mockVehicle({ amountToFinance: 20000, jdPower: 21000 }),
      mockDeal({ creditScore: 720 }),
    ] as const;

  it("keeps a misread buy rate and max LTV out of reasons[0] (printed on the customer PDF)", () => {
    const [vehicle, deal] = passingDeal();
    const result = checkBankEligibility(
      vehicle,
      deal,
      mockLender({
        tiers: [
          {
            name: "Tier A",
            maxTerm: 84,
            rangeFlags: ["baseInterestRate=649 outside 0-40", "maxLtv=1.3 outside 20-200"],
            needsReview: true,
          },
        ],
      })
    );

    expect(result.status).toBe("pending");
    const reason = result.reasons[0] ?? "";
    expect(reason).toBe(
      'Tier "Tier A" needs review - implausible buy rate and max LTV read from the rate sheet. Verify it against the lender\'s official sheet and correct the tier before using it as an approval path.'
    );
    // No digit from either flag (649, 0-40, 1.3, 20-200) and no raw key survives.
    expect(reason).not.toMatch(/\d/);
    expect(reason).not.toMatch(/baseInterestRate|maxLtv|=/);
  });

  it("never turns a malformed flag into a field name that carries a value", () => {
    const [vehicle, deal] = passingDeal();
    const result = checkBankEligibility(
      vehicle,
      deal,
      mockLender({
        tiers: [{ name: "Tier A", rangeFlags: ["649 outside 0-40"], needsReview: true }],
      })
    );

    expect(result.reasons[0]).toBe(
      'Tier "Tier A" needs review - implausible value read from the rate sheet. Verify it against the lender\'s official sheet and correct the tier before using it as an approval path.'
    );
  });

  it("parses field names from value-bearing and value-free flags alike", () => {
    expect(flaggedFieldName("maxLtv=1500 outside 20-200")).toBe("maxLtv");
    expect(flaggedFieldName("  rateAdder outside -10-10")).toBe("rateAdder");
    expect(flaggedFieldName("649 outside 0-40")).toBeNull();
    expect(flaggedFieldName(42)).toBeNull();
    expect(
      reviewFieldLabels({
        name: "T",
        rangeFlags: [
          "baseInterestRate=649 outside 0-40",
          "rateAdder=25 outside -10-10",
          "frontEndLtv=1.1 outside 20-200",
          "minFico=6600 outside 300-850",
          "minFico=7000 outside 300-850",
        ],
      })
    ).toEqual(["buy rate", "rate adder", "front-end LTV", "min FICO"]);
    // Object.prototype names are never "known" fields or labels.
    expect(reviewFieldLabel("constructor")).toBe("constructor");
    expect(reviewFieldLabel("toString")).toBe("to string");
    expect(reviewableFieldsIn(["constructor=1 outside 0-1", "valueOf=2 outside 0-1"])).toEqual([]);
  });
});

describe("resolveRangeFlag — one field fixed never lifts another field's hold [ai-range-guard]", () => {
  const twoFlags = {
    name: "Tier A",
    maxTerm: 72,
    rangeFlags: ["minFico=6600 outside 300-850", "maxLtv=1500 outside 20-200"],
    needsReview: true,
  };

  it("drops only the fixed field's flag and keeps the tier held while another remains", () => {
    const fixed = resolveRangeFlag({ ...twoFlags, minFico: 660 }, "minFico", 660);

    expect(fixed.rangeFlags).toEqual(["maxLtv=1500 outside 20-200"]);
    expect(fixed.needsReview).toBe(true);
    expect(tierNeedsReview(fixed)).toBe(true);

    // The regression the gate reproduced: a 200% LTV deal must stay pending.
    const held = checkBankEligibility(
      mockVehicle({ amountToFinance: 40000, jdPower: 20000 }),
      mockDeal({ creditScore: 700 }),
      mockLender({ tiers: [fixed] })
    );
    expect(held.status).toBe("pending");
  });

  it("lifts the hold only once every flagged field holds a number", () => {
    const first = resolveRangeFlag({ ...twoFlags, minFico: 660 }, "minFico", 660);
    const both = resolveRangeFlag({ ...first, maxLtv: 130 }, "maxLtv", 130);

    expect(both).not.toHaveProperty("rangeFlags");
    expect(both).not.toHaveProperty("needsReview");
    expect(tierNeedsReview(both)).toBe(false);
  });

  it("re-flags a field that was typed and then cleared (the bound is still missing)", () => {
    const baseline = twoFlags.rangeFlags;
    const typed = resolveRangeFlag({ ...twoFlags, maxLtv: 1 }, "maxLtv", 1, baseline);
    expect(typed.rangeFlags).toEqual(["minFico=6600 outside 300-850"]);

    const cleared = resolveRangeFlag(
      { ...typed, maxLtv: undefined },
      "maxLtv",
      undefined,
      baseline
    );
    expect(cleared.needsReview).toBe(true);
    expect(cleared.rangeFlags).toEqual(
      expect.arrayContaining(["minFico=6600 outside 300-850", "maxLtv=1500 outside 20-200"])
    );

    // Even after the last flag was resolved (hold fully lifted), clearing restores it.
    const allFixed = resolveRangeFlag({ ...typed, minFico: 660 }, "minFico", 660, baseline);
    expect(tierNeedsReview(allFixed)).toBe(false);
    const reopened = resolveRangeFlag(
      { ...allFixed, minFico: undefined },
      "minFico",
      undefined,
      baseline
    );
    expect(reopened.rangeFlags).toEqual(["minFico=6600 outside 300-850"]);
    expect(reopened.needsReview).toBe(true);
  });

  it("treats empty, NaN and negative limits as not restoring the bound", () => {
    for (const value of [undefined, "", Number.NaN, -5]) {
      const next = resolveRangeFlag({ ...twoFlags }, "maxLtv", value);
      expect(next.rangeFlags).toEqual(twoFlags.rangeFlags);
      expect(next.needsReview).toBe(true);
    }
    // A negative rate adder is a legitimate discount, not a missing bound.
    const adder = resolveRangeFlag(
      { name: "T", rangeFlags: ["rateAdder=-25 outside -10-10"], needsReview: true },
      "rateAdder",
      -0.25
    );
    expect(tierNeedsReview(adder)).toBe(false);
  });

  it("leaves the tier untouched when an unflagged field is edited", () => {
    const tier = { ...twoFlags };
    expect(resolveRangeFlag(tier, "maxTerm", 84)).toBe(tier);
    expect(resolveRangeFlag(tier, "name", "Renamed")).toBe(tier);
    const bare = { name: "Bare", needsReview: true };
    expect(resolveRangeFlag(bare, "minFico", 660)).toBe(bare);
  });
});

describe("markTierVerified — never saves a tier with no limit for a flagged field [ai-range-guard]", () => {
  it("is a no-op while any flagged field is still empty", () => {
    const tier = {
      name: "Tier A",
      maxLtv: 125,
      rangeFlags: ["maxLtv=1500 outside 20-200", "minFico=6600 outside 300-850"],
      needsReview: true,
    };

    expect(unverifiedReviewFields(tier)).toEqual(["minFico"]);
    expect(markTierVerified(tier)).toBe(tier);

    const filled = { ...tier, minFico: 660 };
    expect(unverifiedReviewFields(filled)).toEqual([]);
    const verified = markTierVerified(filled);
    expect(verified).not.toHaveProperty("rangeFlags");
    expect(verified).not.toHaveProperty("needsReview");
    expect(verified.minFico).toBe(660);
  });

  it("clears a bare needsReview hold (no field was dropped)", () => {
    const verified = markTierVerified({ name: "Bare", needsReview: true });
    expect(tierNeedsReview(verified)).toBe(false);
  });

  it("does not let a flag naming an unknown field strand the tier", () => {
    const tier = { name: "T", rangeFlags: ["mysteryField=9 outside 0-1"], needsReview: true };
    expect(unverifiedReviewFields(tier)).toEqual([]);
    expect(tierNeedsReview(markTierVerified(tier))).toBe(false);
  });
});
