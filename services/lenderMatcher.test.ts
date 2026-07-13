import { describe, it, expect } from "vitest";
import { checkBankEligibility } from "./lenderMatcher";
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
