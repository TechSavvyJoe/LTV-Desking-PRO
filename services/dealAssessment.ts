import type { CalculatedVehicle, DealData, FilterData, LenderProfile } from "../types";
import type { VehicleFit } from "./lenderFit";
import { getRebateBreakdown } from "./calculator";
import { z } from "zod";

export type CheckStatus = "pass" | "fail" | "missing";
export interface DealCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}
export interface DealAssessment {
  version: "rules-v1";
  readiness: number;
  completeness: number;
  passed: number;
  total: number;
  checks: DealCheck[];
  label: "Inputs needed" | "Restructure" | "Checks passed";
  fitCount: number;
  checkedLenders: number;
  pendingLenders: number;
  sampleLenders: number;
  lenderMatchPercent: number | null;
  budgetUsedPercent: number | null;
  budgetHeadroom: number | null;
  pti: number | null;
  dti: number | null;
  totalPayments: number | null;
  totalInterest: number | null;
  frontGross: number | null;
  productGross: number | null;
  totalGross: number | null;
  profitTargetPercent: number | null;
  profitHeadroom: number | null;
  dominatedBy?: number;
}

export const ProfitInputsSchema = z
  .object({
    allInUnitCosts: z
      .record(z.string().max(100), z.number().finite().min(0).max(10000000))
      .optional(),
    productCost: z.number().finite().min(0).max(10000000).optional(),
    reserve: z.number().finite().min(0).max(10000000).optional(),
    target: z.number().finite().min(0).max(10000000).optional(),
  })
  .strict();
const numberOrUnknown = z.number().finite().nullable();
const AssessmentSnapshotSchema = z
  .object({
    version: z.literal("rules-v1"),
    readiness: z.number().int().min(0).max(100),
    completeness: z.number().int().min(0).max(100),
    passed: z.number().int().min(0).max(12),
    total: z.literal(12),
    checks: z
      .array(
        z.object({
          id: z.string().max(50),
          label: z.string().max(100),
          status: z.enum(["pass", "fail", "missing"]),
          detail: z.string().max(1000),
        })
      )
      .length(12),
    label: z.enum(["Inputs needed", "Restructure", "Checks passed"]),
    fitCount: z.number().int().min(0),
    checkedLenders: z.number().int().min(0),
    pendingLenders: z.number().int().min(0),
    sampleLenders: z.number().int().min(0),
    lenderMatchPercent: numberOrUnknown,
    budgetUsedPercent: numberOrUnknown,
    budgetHeadroom: numberOrUnknown,
    pti: numberOrUnknown,
    dti: numberOrUnknown,
    totalPayments: numberOrUnknown,
    totalInterest: numberOrUnknown,
    frontGross: numberOrUnknown,
    productGross: numberOrUnknown,
    totalGross: numberOrUnknown,
    profitTargetPercent: numberOrUnknown,
    profitHeadroom: numberOrUnknown,
    dominatedBy: z.number().int().min(0).optional(),
  })
  .refine(
    (a) =>
      a.passed === a.checks.filter((c) => c.status === "pass").length &&
      a.readiness === Math.round((a.passed / a.total) * 100) &&
      a.completeness ===
        Math.round((a.checks.filter((c) => c.status !== "missing").length / a.total) * 100) &&
      a.label ===
        (a.checks.some((c) => c.status === "missing")
          ? "Inputs needed"
          : a.passed < a.total
            ? "Restructure"
            : "Checks passed")
  );

/** Legacy scores never get relabelled as readiness. Only versioned snapshots qualify. */
export function readAssessment(value: unknown): DealAssessment | undefined {
  const parsed = AssessmentSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const nonnegative = (value: unknown): number | null => {
  const n = finite(value);
  return n !== null && n >= 0 && n <= 10000000 ? n : null;
};
const positive = (value: unknown): number | null => {
  const n = finite(value);
  return n !== null && n > 0 && n <= 10000000 ? n : null;
};
const cents = (n: number) => Math.round(n * 100) / 100;
const percent = (n: number, d: number): number | null => {
  const result = Math.round((n / d) * 1000) / 10;
  return Number.isFinite(result) ? result : null;
};

/** Hold otherwise passing paths until the desk's baseline customer inputs exist. */
export function holdIncompleteFits(fit: VehicleFit, filters: FilterData): VehicleFit {
  const missing = [
    !(
      typeof filters.creditScore === "number" &&
      Number.isInteger(filters.creditScore) &&
      filters.creditScore >= 300 &&
      filters.creditScore <= 850
    )
      ? "credit score"
      : null,
    positive(filters.monthlyIncome) === null ? "monthly income" : null,
    nonnegative(filters.monthlyDebt) === null ? "monthly debt" : null,
  ].filter((s): s is string => s !== null);
  const entries = fit.entries.map((e) =>
    e.eligible && (missing.length || !((e.evaluatedConstraints ?? 0) > 0))
      ? {
          ...e,
          eligible: false,
          status: "pending" as const,
          uncheckedConstraints: [...(e.uncheckedConstraints ?? []), ...missing],
          reasons: [
            ...e.reasons,
            missing.length
              ? `Complete customer inputs: ${missing.join(", ")}.`
              : "No enforceable program constraints recorded.",
          ],
        }
      : e
  );
  const matches = entries.filter((e) => e.eligible);
  return {
    ...fit,
    entries,
    fitCount: matches.length,
    fitNames: matches.map((e) => e.name),
    pendingCount: entries.filter((e) => e.status === "pending").length,
  };
}

/**
 * Counts explicit checks, never estimates a credit approval probability.
 * A missing fact earns no points. Completeness counts resolved checks, including
 * failures; readiness counts passes. The checklist is fixed across vehicles.
 * Profit requires a manager-entered all-in cost (not an assumed acquisition cost)
 * and an explicit reserve estimate. No reserve is inferred from rate markup.
 */
export function assessDeal(
  vehicle: CalculatedVehicle,
  deal: DealData,
  filters: FilterData,
  lenders: LenderProfile[],
  fit: VehicleFit
): DealAssessment {
  const income = positive(filters.monthlyIncome);
  const debt = nonnegative(filters.monthlyDebt);
  const fico = finite(filters.creditScore);
  const ficoKnown = fico !== null && Number.isInteger(fico) && fico >= 300 && fico <= 850;
  const price = positive(vehicle.price);
  const bookKnown = positive(vehicle.jdPower) !== null || positive(vehicle.jdPowerRetail) !== null;
  const payment = nonnegative(vehicle.monthlyPayment);
  const principal = nonnegative(vehicle.amountToFinance);
  const apr = nonnegative(deal.interestRate);
  const term = positive(deal.loanTerm);
  const termsKnown =
    payment !== null &&
    principal !== null &&
    apr !== null &&
    apr <= 50 &&
    term !== null &&
    Number.isInteger(term) &&
    term >= 6 &&
    term <= 96;
  const budget = positive(filters.maxPayment);
  const cost = nonnegative(deal.profitInputs?.allInUnitCosts?.[vehicle.vin]);
  const backend = nonnegative(deal.backendProducts);
  const productCost = backend === 0 ? 0 : nonnegative(deal.profitInputs?.productCost);
  const reserve = nonnegative(deal.profitInputs?.reserve);
  const target = nonnegative(deal.profitInputs?.target);
  const frontGross =
    price !== null && cost !== null
      ? cents(Math.max(0, price - getRebateBreakdown(deal).dealerDiscount) - cost)
      : null;
  const productGross =
    backend !== null && productCost !== null ? cents(backend - productCost) : null;
  const totalGross =
    frontGross !== null && productGross !== null && reserve !== null
      ? cents(frontGross + productGross + reserve)
      : null;
  const customerKnown = ficoKnown && income !== null && debt !== null;
  const active = lenders.filter((l) => l && l.active !== false);
  const samples = new Set(active.filter((l) => l.isSample === true).map((l) => l.id));
  const verified = fit.entries.filter((e) => !samples.has(e.lenderId));
  // A permissive program cannot make an incomplete customer look fully assessed.
  const checked = customerKnown
    ? verified.filter(
        (e) => e.status !== "pending" && (!e.eligible || (e.evaluatedConstraints ?? 0) > 0)
      )
    : [];
  const fits = checked.filter((e) => e.eligible && (e.evaluatedConstraints ?? 0) > 0);
  const unchecked = active.length - checked.length;
  const checks: DealCheck[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) =>
    checks.push({ id, label, status, detail });
  add(
    "vehicle",
    "Vehicle pricing + book",
    price !== null && bookKnown ? "pass" : "missing",
    "Positive selling price and at least one entered book value; accuracy still requires source verification."
  );
  add(
    "fico",
    "Customer FICO",
    ficoKnown ? "pass" : "missing",
    "Enter an integer FICO from 300–850; this is not a bureau pull."
  );
  add(
    "income",
    "Monthly income",
    income !== null ? "pass" : "missing",
    "Enter gross monthly income greater than zero."
  );
  add(
    "debt",
    "Monthly obligations",
    debt !== null ? "pass" : "missing",
    "Enter existing monthly debt; an explicit 0 is valid."
  );
  add(
    "condition",
    "Vehicle condition",
    deal.vehicleCondition === "new" || deal.vehicleCondition === "used" ? "pass" : "missing",
    "Select new or used; condition is not inferred from age."
  );
  add(
    "terms",
    "Payment calculation",
    termsKnown ? "pass" : "missing",
    "Requires a valid financed amount, 6–96 month term and explicit APR (0% is valid)."
  );
  add(
    "lender",
    "Verified program match",
    fits.length > 0 ? "pass" : unchecked > 0 || !checked.length ? "missing" : "fail",
    `${fits.length} fits / ${checked.length} fully checked programs; ${unchecked} pending, including ${samples.size} samples. Published rules only; no lender decision.`
  );
  add(
    "budget",
    "Customer payment budget",
    budget === null || payment === null ? "missing" : payment <= budget ? "pass" : "fail",
    "Payment must fit the customer's entered monthly ceiling; this is not a universal affordability threshold."
  );
  add(
    "cost",
    "All-in vehicle cost",
    cost !== null ? "pass" : "missing",
    "Confirm acquisition, recon, pack and carrying costs for this VIN; imported unit cost is not automatically confirmed."
  );
  add(
    "products",
    "Product costs",
    productCost !== null ? "pass" : "missing",
    "Add-on gross = selling amount minus product cost; no products means $0 gross."
  );
  add(
    "reserve",
    "Lender reserve estimate",
    reserve !== null ? "pass" : "missing",
    "Enter actual expected reserve/flat or 0; rate markup does not imply a reserve amount."
  );
  add(
    "profit",
    "Dealer gross target",
    target === null || totalGross === null ? "missing" : totalGross >= target ? "pass" : "fail",
    "Estimated gross must meet the manager's entered target. Excludes unentered costs, chargebacks and overhead."
  );
  const passed = checks.filter((c) => c.status === "pass").length;
  const missing = checks.filter((c) => c.status === "missing").length;
  const totalPayments = termsKnown ? cents(payment! * term!) : null;
  return {
    version: "rules-v1",
    readiness: Math.round((passed / checks.length) * 100),
    completeness: Math.round(((checks.length - missing) / checks.length) * 100),
    passed,
    total: checks.length,
    checks,
    label: missing ? "Inputs needed" : passed < checks.length ? "Restructure" : "Checks passed",
    fitCount: fits.length,
    checkedLenders: checked.length,
    pendingLenders: unchecked,
    sampleLenders: samples.size,
    lenderMatchPercent: checked.length ? percent(fits.length, checked.length) : null,
    budgetUsedPercent: budget !== null && payment !== null ? percent(payment, budget) : null,
    budgetHeadroom: budget !== null && payment !== null ? cents(budget - payment) : null,
    pti: income !== null && payment !== null ? percent(payment, income) : null,
    dti:
      income !== null && debt !== null && payment !== null ? percent(debt + payment, income) : null,
    totalPayments,
    totalInterest: totalPayments !== null ? cents(Math.max(0, totalPayments - principal!)) : null,
    frontGross,
    productGross,
    totalGross,
    profitTargetPercent:
      target !== null && target > 0 && totalGross !== null ? percent(totalGross, target) : null,
    profitHeadroom: target !== null && totalGross !== null ? cents(totalGross - target) : null,
  };
}

/**
 * Pareto comparison among fully assessed, feasible deals only. A candidate is
 * dominated if another has no higher payment/interest and no lower gross,
 * with at least one strict improvement. This exposes tradeoffs without opaque
 * weights or treating dealership profit as the customer's best choice.
 */
export function markTradeoffs(vehicles: CalculatedVehicle[]): CalculatedVehicle[] {
  const feasible = vehicles.filter((v) => v.assessment?.label === "Checks passed");
  return vehicles.map((v) => {
    const a = v.assessment;
    if (!a || a.label !== "Checks passed") return v;
    const dominatedBy = feasible.filter((other) => {
      if (other === v) return false;
      const b = other.assessment!;
      const p = finite(v.monthlyPayment),
        q = finite(other.monthlyPayment);
      if (
        p === null ||
        q === null ||
        a.totalInterest === null ||
        b.totalInterest === null ||
        a.totalGross === null ||
        b.totalGross === null
      )
        return false;
      return (
        q <= p &&
        b.totalInterest <= a.totalInterest &&
        b.totalGross >= a.totalGross &&
        (q < p || b.totalInterest < a.totalInterest || b.totalGross > a.totalGross)
      );
    }).length;
    return { ...v, assessment: { ...a, dominatedBy } };
  });
}

export const assessmentColor = (a?: DealAssessment): string =>
  !a || a.label === "Inputs needed"
    ? "var(--color-text-muted)"
    : a.label === "Checks passed"
      ? "var(--color-success)"
      : "var(--color-warning)";
