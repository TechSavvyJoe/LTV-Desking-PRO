import { INITIAL_DEAL_DATA, INITIAL_FILTER_DATA } from "../constants";
import { unitsForEachLender } from "../services/lenderFit";
import type { CalculatedVehicle, LenderProfile } from "../types";

const INVENTORY_SIZES = [250, 1_000, 5_000];
const LENDER_COUNT = 25;
const WARMUP_TRIALS = 10;
const MEASURED_TRIALS = 25;

// Deterministic synthetic data only. It carries an explicit used condition,
// known buy-rate/floor values, and non-sample verified metadata. Never load
// dealer/customer/lender records into this benchmark.
const benchmarkLenders: LenderProfile[] = Array.from({ length: LENDER_COUNT }, (_, index) => ({
  id: `bench_lender_${String(index + 1).padStart(2, "0")}`,
  name: `Synthetic Benchmark Lender ${index + 1}`,
  active: true,
  isSample: false,
  bookValueSource: "Trade",
  effectiveDate: "2026-01-01",
  verifiedAt: "2026-01-01T00:00:00.000Z",
  reviewRequired: false,
  sourceReference: "Synthetic benchmark fixture; not a real program",
  tiers: [
    {
      name: "Synthetic used tier",
      vehicleType: "used",
      minFico: 500 + (index % 5) * 25,
      maxTerm: 84,
      maxLtv: 140,
      baseInterestRate: 6.5 + (index % 4) * 0.25,
      maxRate: 24,
    },
  ],
}));

const makeInventory = (count: number): CalculatedVehicle[] =>
  Array.from({ length: count }, (_, index) => {
    const suffix = String(index + 1).padStart(5, "0");
    const price = 18_000 + (index % 22) * 500;
    return {
      id: `bench_vehicle_${suffix}`,
      vehicle: `Synthetic Vehicle ${suffix}`,
      stock: `BENCH${suffix}`,
      vin: `SYNTHETICVIN${suffix}`,
      condition: "used",
      modelYear: 2021 + (index % 5),
      mileage: 10_000 + (index % 80) * 1_000,
      price,
      jdPower: price + 1_500,
      jdPowerRetail: price + 2_000,
      unitCost: price - 1_500,
      baseOutTheDoorPrice: price + 2_000,
      salesTax: 1_200,
      frontEndLtv: 100,
      frontEndGross: 1_500,
      amountToFinance: price + 2_000,
      otdLtv: 100,
      monthlyPayment: 450,
      make: "Synthetic",
      model: "Vehicle",
      trim: "Benchmark",
    };
  });

const deal = {
  ...INITIAL_DEAL_DATA,
  ...INITIAL_FILTER_DATA,
  vehicleCondition: "used" as const,
  creditScore: 700,
  monthlyIncome: 5_000,
  monthlyDebt: 500,
  loanTerm: 72,
  interestRate: 6.5,
};

const percentile = (sorted: number[], quantile: number): number =>
  sorted[Math.ceil(quantile * sorted.length) - 1] ?? 0;

const timeEvaluation = (inventory: CalculatedVehicle[]): number => {
  const start = performance.now();
  unitsForEachLender(inventory, deal, benchmarkLenders);
  return performance.now() - start;
};

for (const inventoryCount of INVENTORY_SIZES) {
  const inventory = makeInventory(inventoryCount);
  for (let trial = 0; trial < WARMUP_TRIALS; trial++) timeEvaluation(inventory);

  const durations = Array.from({ length: MEASURED_TRIALS }, () => timeEvaluation(inventory)).sort(
    (left, right) => left - right
  );
  console.log(
    JSON.stringify({
      benchmark: "synthetic-lender-fit",
      syntheticOnly: true,
      inventoryCount,
      lenderCount: LENDER_COUNT,
      ruleChecksPerTrial: inventoryCount * LENDER_COUNT,
      warmupTrials: WARMUP_TRIALS,
      measuredTrials: MEASURED_TRIALS,
      p50Ms: Number(percentile(durations, 0.5).toFixed(2)),
      p95Ms: Number(percentile(durations, 0.95).toFixed(2)),
    })
  );
}
