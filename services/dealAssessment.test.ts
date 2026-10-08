import { describe, expect, it } from "vitest";
import { INITIAL_DEAL_DATA, INITIAL_FILTER_DATA, INITIAL_SETTINGS } from "../constants";
import type { CalculatedVehicle, DealData, FilterData, LenderProfile, Vehicle } from "../types";
import { calculateFinancials } from "./calculator";
import { lenderFitForVehicle } from "./lenderFit";
import { assessDeal, holdIncompleteFits, markTradeoffs, readAssessment } from "./dealAssessment";

const vehicle: Vehicle = {
  vin: "1HGCV1F3XLA000001",
  stock: "A1",
  vehicle: "2024 Honda Accord",
  make: "Honda",
  modelYear: 2024,
  mileage: 20000,
  price: 25000,
  jdPower: 25000,
  jdPowerRetail: 28000,
  unitCost: 19000,
  baseOutTheDoorPrice: "N/A",
};
const lenders: LenderProfile[] = [
  {
    id: "bank",
    name: "Verified Bank",
    isSample: false,
    tiers: [{ name: "Prime", minFico: 650, maxLtv: 130, maxTerm: 72, maxPti: 20, maxDti: 45 }],
  },
];
const filters: FilterData = {
  ...INITIAL_FILTER_DATA,
  creditScore: 720,
  monthlyIncome: 6500,
  monthlyDebt: 500,
  maxPayment: 600,
};
const deal: DealData = {
  ...INITIAL_DEAL_DATA,
  loanTerm: 60,
  interestRate: 8.9,
  downPayment: 3000,
  vehicleCondition: "used",
  vehicleConditionVin: vehicle.vin,
  backendProducts: 2000,
  profitInputs: {
    allInUnitCosts: { [vehicle.vin]: 23000 },
    productCost: 800,
    reserve: 0,
    target: 2500,
  },
};
function assess(d = deal, f = filters, profiles = lenders, v = vehicle) {
  const calc = calculateFinancials(v, d, INITIAL_SETTINGS);
  return assessDeal(calc, d, f, profiles, lenderFitForVehicle(calc, { ...d, ...f }, profiles));
}

describe("explainable deal assessment", () => {
  it("each number has a reproducible denominator or money formula", () => {
    const a = assess();
    expect(a.label).toBe("Checks passed");
    expect(a.readiness).toBe(100);
    expect(a.passed).toBe(12);
    expect(a.completeness).toBe(100);
    expect(a.lenderMatchPercent).toBe(100);
    expect(a.frontGross).toBe(2000);
    expect(a.productGross).toBe(1200);
    expect(a.totalGross).toBe(3200);
    expect(a.profitTargetPercent).toBe(128);
    expect(a.profitHeadroom).toBe(700);
    const calc = calculateFinancials(vehicle, deal, INITIAL_SETTINGS);
    const payment = calc.monthlyPayment as number;
    expect(a.budgetUsedPercent).toBeCloseTo((payment / 600) * 100, 1);
    expect(a.dti).toBeCloseTo(((payment + 500) / 6500) * 100, 1);
    expect(a.totalInterest).toBeCloseTo(payment * 60 - (calc.amountToFinance as number), 2);
    expect(readAssessment(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });
  it("blank customer inputs cannot pass a permissive program or reach 100", () => {
    const f = { ...filters, creditScore: null, monthlyIncome: null, monthlyDebt: null };
    const permissive = [{ ...lenders[0]!, tiers: [{ name: "Permissive", maxLtv: 200 }] }];
    const a = assess(deal, f, permissive);
    expect(a.label).toBe("Inputs needed");
    expect(a.readiness).toBeLessThan(100);
    expect(a.fitCount).toBe(0);
    expect(a.lenderMatchPercent).toBeNull();
    const calc = calculateFinancials(vehicle, deal, INITIAL_SETTINGS);
    const fit = holdIncompleteFits(lenderFitForVehicle(calc, { ...deal, ...f }, permissive), f);
    expect(fit.entries[0]?.status).toBe("pending");
    expect(fit.fitCount).toBe(0);
  });
  it("sample programs never enter the match denominator or count as fits", () => {
    const a = assess(deal, filters, [{ ...lenders[0]!, isSample: true }]);
    expect(a.checkedLenders).toBe(0);
    expect(a.fitCount).toBe(0);
    expect(a.sampleLenders).toBe(1);
    expect(a.lenderMatchPercent).toBeNull();
    expect(a.label).toBe("Inputs needed");
  });
  it("an empty program has no enforceable fit evidence", () => {
    const a = assess(deal, filters, [{ ...lenders[0]!, tiers: [{ name: "Empty" }] }]);
    expect(a.fitCount).toBe(0);
    expect(a.checkedLenders).toBe(0);
    expect(a.label).toBe("Inputs needed");
  });
  it("unknown costs stay unknown; imported acquisition cost is not all-in cost", () => {
    const a = assess({ ...deal, profitInputs: undefined });
    expect(a.frontGross).toBeNull();
    expect(a.productGross).toBeNull();
    expect(a.totalGross).toBeNull();
    expect(a.profitTargetPercent).toBeNull();
    expect(a.label).toBe("Inputs needed");
  });
  it("costs for another VIN cannot leak into this unit", () => {
    expect(
      assess({ ...deal, profitInputs: { ...deal.profitInputs, allInUnitCosts: { OTHER: 23000 } } })
        .frontGross
    ).toBeNull();
  });
  it("explicit zero APR, obligations, product cost and reserve remain known", () => {
    const a = assess(
      {
        ...deal,
        interestRate: 0,
        backendProducts: 0,
        profitInputs: { ...deal.profitInputs, productCost: 0, reserve: 0, target: 0 },
      },
      { ...filters, monthlyDebt: 0 }
    );
    expect(a.totalInterest).toBeLessThan(1); // cents-rounded amortization can differ by cents
    expect(a.productGross).toBe(0);
    expect(a.totalGross).toBe(2000);
    expect(a.label).toBe("Checks passed");
    expect(a.profitTargetPercent).toBeNull(); // dividing by a $0 target has no meaning
    expect(a.profitHeadroom).toBe(2000);
  });
  it("dealer discounts reduce gross while manufacturer rebates do not", () => {
    expect(assess({ ...deal, dealerDiscount: 1000 }).frontGross).toBe(1000);
    expect(assess({ ...deal, manufacturerRebate: 1000 }).frontGross).toBe(2000);
  });
  it("negative gross and an exceeded budget are failures, not missing facts", () => {
    const a = assess(
      { ...deal, profitInputs: { ...deal.profitInputs, allInUnitCosts: { [vehicle.vin]: 28000 } } },
      { ...filters, maxPayment: 100 }
    );
    expect(a.totalGross).toBe(-1800);
    expect(a.profitTargetPercent).toBe(-72);
    expect(a.budgetHeadroom).toBeLessThan(0);
    expect(a.label).toBe("Restructure");
    expect(a.completeness).toBe(100);
    expect(a.readiness).toBe(83);
    expect(a.checks.filter((c) => c.status === "fail").map((c) => c.id)).toEqual([
      "budget",
      "profit",
    ]);
  });
  it("missing reserve is not silently zero", () => {
    const a = assess({ ...deal, profitInputs: { ...deal.profitInputs, reserve: undefined } });
    expect(a.totalGross).toBeNull();
    expect(a.frontGross).toBe(2000);
  });
  it("missing debt prevents DTI and lender-match scoring", () => {
    const a = assess(deal, { ...filters, monthlyDebt: null });
    expect(a.dti).toBeNull();
    expect(a.lenderMatchPercent).toBeNull();
  });
  it("a failed long-term structure cannot earn a passing lender check", () => {
    const a = assess({ ...deal, loanTerm: 96 });
    expect(a.fitCount).toBe(0);
    expect(a.checks.find((c) => c.id === "lender")?.status).toBe("fail");
    expect(a.label).toBe("Restructure");
  });
  it("bad numeric inputs cannot produce NaN or Infinity in the assessment", () => {
    for (const n of [NaN, Infinity, -1, 1e308]) {
      const a = assess(
        { ...deal, profitInputs: { ...deal.profitInputs, reserve: n } },
        { ...filters, monthlyIncome: n, maxPayment: n }
      );
      for (const value of Object.values(a))
        if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
      expect(a.totalGross).toBeNull();
      expect(a.readiness).toBeLessThan(100);
    }
  });
  it("historic unversioned scores and forged checklist totals are not readiness", () => {
    expect(readAssessment({ approvalScore: 90 })).toBeUndefined();
    expect(readAssessment({ ...assess(), readiness: 70 })).toBeUndefined();
  });
  it("Pareto comparison exposes tradeoffs and excludes incomplete deals", () => {
    const a = assess();
    const base = {
      ...vehicle,
      ...calculateFinancials(vehicle, deal, INITIAL_SETTINGS),
      assessment: a,
    } as CalculatedVehicle;
    const worse = {
      ...base,
      vin: "worse",
      monthlyPayment: (base.monthlyPayment as number) + 10,
      assessment: { ...a, totalInterest: a.totalInterest! + 100, totalGross: a.totalGross! - 100 },
    };
    const tradeoff = {
      ...base,
      vin: "tradeoff",
      monthlyPayment: (base.monthlyPayment as number) - 10,
      assessment: { ...a, totalGross: a.totalGross! - 100 },
    };
    const unknown = {
      ...base,
      vin: "unknown",
      assessment: { ...a, label: "Inputs needed" as const },
    };
    const rows = markTradeoffs([base, worse, tradeoff, unknown]);
    expect(rows[0]?.assessment?.dominatedBy).toBe(0);
    expect(rows[1]?.assessment?.dominatedBy).toBeGreaterThan(0);
    expect(rows[2]?.assessment?.dominatedBy).toBe(0);
    expect(rows[3]?.assessment?.dominatedBy).toBeUndefined();
    expect(base.assessment?.dominatedBy).toBeUndefined(); // pure, no stale cache mutation
  });
});
