/**
 * Tests for the PocketBase ↔ app deal mappers — the pipeline status buckets
 * and the SavedDeal round-trip the Pipeline screen depends on. [Phase 6]
 */

import { describe, it, expect } from "vitest";
import {
  CANONICAL_DEAL_STATUSES,
  STATUS_BUCKET_META,
  statusBucket,
  toCanonicalStatus,
  toAppState,
  mapPocketBaseSavedDeal,
  asPipelineDeal,
  pipelineMetricsFromCalculatedData,
} from "./dealMappers";
import type { SavedDeal as PocketBaseSavedDeal } from "./pocketbase";
import type { SavedDeal as AppSavedDeal } from "../types";

describe("statusBucket", () => {
  it("maps every canonical status to its pipeline bucket", () => {
    expect(statusBucket("draft")).toBe("pending");
    expect(statusBucket("pending")).toBe("pending");
    expect(statusBucket("submitted")).toBe("pending");
    expect(statusBucket("approved")).toBe("approved");
    expect(statusBucket("funded")).toBe("funded");
    expect(statusBucket("declined")).toBe("declined");
    expect(statusBucket("cancelled")).toBe("declined");
  });

  it("covers the full canonical vocabulary (no status falls through unmapped)", () => {
    for (const status of CANONICAL_DEAL_STATUSES) {
      expect(["pending", "approved", "funded", "declined"]).toContain(statusBucket(status));
    }
  });

  it("buckets unknown/legacy status strings as pending (deal stays 'working')", () => {
    expect(statusBucket("in_review")).toBe("pending");
    expect(statusBucket("APPROVED")).toBe("pending"); // case-sensitive canon
    expect(statusBucket("")).toBe("pending");
    expect(statusBucket(null)).toBe("pending");
    expect(statusBucket(undefined)).toBe("pending");
  });

  it("has pill meta for every bucket with the mockup's label/color pairing", () => {
    expect(STATUS_BUCKET_META.pending.label).toBe("Pending");
    expect(STATUS_BUCKET_META.pending.colorVar).toBe("var(--color-warning)");
    expect(STATUS_BUCKET_META.approved.label).toBe("Approved");
    expect(STATUS_BUCKET_META.approved.colorVar).toBe("var(--color-success)");
    expect(STATUS_BUCKET_META.funded.label).toBe("Funded");
    expect(STATUS_BUCKET_META.funded.colorVar).toBe("var(--color-primary)");
    expect(STATUS_BUCKET_META.declined.label).toBe("Declined");
    expect(STATUS_BUCKET_META.declined.colorVar).toBe("var(--color-danger)");
    for (const meta of Object.values(STATUS_BUCKET_META)) {
      expect(meta.bgVar).toMatch(/^var\(--color-.+-subtle\)$/);
    }
  });
});

describe("toCanonicalStatus", () => {
  it("passes canonical statuses through", () => {
    for (const status of CANONICAL_DEAL_STATUSES) {
      expect(toCanonicalStatus(status)).toBe(status);
    }
  });

  it("collapses unknown values to draft (which buckets to pending)", () => {
    expect(toCanonicalStatus("mystery")).toBe("draft");
    expect(toCanonicalStatus(42)).toBe("draft");
    expect(toCanonicalStatus(undefined)).toBe("draft");
    expect(statusBucket(toCanonicalStatus("mystery"))).toBe("pending");
  });
});

/** A realistic saved_deals record as PocketBase returns it. */
const pbDeal = (overrides: Partial<PocketBaseSavedDeal> = {}): PocketBaseSavedDeal => ({
  id: "rec_deal_001",
  dealer: "dlr_001",
  user: "usr_001",
  vehicle: "inv_4455",
  name: "2026-06-24 - Marcus Bell",
  customerName: "Marcus Bell",
  salespersonName: "Jane Smith",
  vehicleData: {
    id: "inv_4455",
    vehicle: "2021 Hyundai Tucson SEL",
    stock: "4455",
    vin: "KM8J3CA46MU123456",
    modelYear: 2021,
    mileage: 41200,
    price: 22990,
    jdPower: 21800,
    jdPowerRetail: 23400,
    unitCost: 19850,
    baseOutTheDoorPrice: 24815,
    make: "Hyundai",
    model: "Tucson",
    trim: "SEL",
    salesTax: 1379.4,
    frontEndLtv: 105.5,
    frontEndGross: 3140,
    amountToFinance: 20079,
    otdLtv: 112.1,
    monthlyPayment: 361.42,
    approvalScore: 79,
    fitCount: 5,
  },
  dealData: {
    downPayment: 2000,
    tradeInValue: 0,
    tradeInPayoff: 0,
    backendProducts: 0,
    loanTerm: 72,
    interestRate: 8.9,
    stateFees: 31,
    notes: "",
    buyerState: "IL",
  },
  customerFilters: { creditScore: 712, monthlyIncome: 4800 },
  calculatedData: {
    payment: 361.42,
    otdLtv: 112.1,
    financed: 20079,
    approvalScore: 79,
    savedAt: "2026-06-24T15:04:05.000Z",
  },
  status: "declined",
  lenderName: "Lake Trust CU",
  notes: "Customer shopping payment.",
  created: "2026-06-24 15:04:05.000Z",
  updated: "2026-06-24 15:04:05.000Z",
  ...overrides,
});

describe("mapPocketBaseSavedDeal", () => {
  it("round-trips a realistic record incl. declined status + lenderName + IL buyerState", () => {
    const mapped = mapPocketBaseSavedDeal(pbDeal());

    expect(mapped.id).toBe("rec_deal_001");
    expect(mapped.date).toBe("2026-06-24 15:04:05.000Z");
    expect(mapped.createdAt).toBe("2026-06-24 15:04:05.000Z");
    expect(mapped.customerName).toBe("Marcus Bell");
    expect(mapped.salespersonName).toBe("Jane Smith");
    expect(mapped.notes).toBe("Customer shopping payment.");

    // Vehicle snapshot survives, including the persisted score.
    expect(mapped.vehicle.vehicle).toBe("2021 Hyundai Tucson SEL");
    expect(mapped.vehicle.vin).toBe("KM8J3CA46MU123456");
    expect(mapped.vehicleVin).toBe("KM8J3CA46MU123456");
    expect(mapped.vehicle.stock).toBe("4455");
    expect(mapped.vehicle.price).toBe(22990);
    expect(mapped.vehicle.jdPower).toBe(21800);
    expect(mapped.vehicle.monthlyPayment).toBe(361.42);
    expect(mapped.vehicle.amountToFinance).toBe(20079);
    expect(mapped.vehicle.otdLtv).toBe(112.1);
    expect(mapped.vehicle.approvalScore).toBe(79);
    expect(mapped.vehicle.fitCount).toBe(5);
    expect(mapped.vehicleSnapshot).toEqual(mapped.vehicle);

    // Deal terms round-trip, incl. the per-deal IL buyer state.
    expect(mapped.dealData.downPayment).toBe(2000);
    expect(mapped.dealData.loanTerm).toBe(72);
    expect(mapped.dealData.interestRate).toBe(8.9);
    expect(mapped.dealData.buyerState).toBe("IL");

    expect(mapped.customerFilters).toEqual({ creditScore: 712, monthlyIncome: 4800 });

    // Pipeline fields.
    expect(mapped.status).toBe("declined");
    expect(statusBucket(mapped.status)).toBe("declined");
    expect(mapped.lenderName).toBe("Lake Trust CU");
    expect(mapped.calculatedData).toMatchObject({ payment: 361.42, approvalScore: 79 });
  });

  it("handles an unknown status string gracefully (draft → pending bucket)", () => {
    const record = pbDeal({
      status: "wat" as unknown as PocketBaseSavedDeal["status"],
      lenderName: undefined,
    });
    const mapped = mapPocketBaseSavedDeal(record);
    expect(mapped.status).toBe("draft");
    expect(statusBucket(mapped.status)).toBe("pending");
    expect(mapped.lenderName).toBeUndefined();
  });

  it("keeps buyerState undefined for non-vocabulary states", () => {
    const mapped = mapPocketBaseSavedDeal(
      pbDeal({ dealData: { downPayment: 500, buyerState: "CA" } })
    );
    expect(mapped.dealData.buyerState).toBeUndefined();
    expect(mapped.dealData.downPayment).toBe(500);
  });
});

describe("asPipelineDeal", () => {
  it("re-narrows a context SavedDeal that carries pipeline fields at runtime", () => {
    const deal = mapPocketBaseSavedDeal(pbDeal()) as AppSavedDeal;
    const pipeline = asPipelineDeal(deal);
    expect(pipeline.status).toBe("declined");
    expect(pipeline.lenderName).toBe("Lake Trust CU");
    expect(pipeline.calculatedData?.financed).toBe(20079);
  });

  it("defaults a deal that lost its pipeline fields to draft/pending", () => {
    const bare = { ...mapPocketBaseSavedDeal(pbDeal()) } as AppSavedDeal & {
      status?: unknown;
      lenderName?: unknown;
      calculatedData?: unknown;
    };
    delete bare.status;
    delete bare.lenderName;
    delete bare.calculatedData;
    const pipeline = asPipelineDeal(bare);
    expect(pipeline.status).toBe("draft");
    expect(statusBucket(pipeline.status)).toBe("pending");
    expect(pipeline.lenderName).toBeUndefined();
    expect(pipeline.calculatedData).toBeUndefined();
  });
});

describe("pipelineMetricsFromCalculatedData", () => {
  it("reads the canonical keys written at save time", () => {
    expect(
      pipelineMetricsFromCalculatedData({
        payment: 361.42,
        otdLtv: 112.1,
        financed: 20079,
        approvalScore: 79,
      })
    ).toEqual({ payment: 361.42, otdLtv: 112.1, financed: 20079, approvalScore: 79 });
  });

  it("accepts legacy/serialized aliases", () => {
    expect(
      pipelineMetricsFromCalculatedData({
        monthlyPayment: 402,
        otd: 118,
        amountToFinance: 23789,
        score: 61,
      })
    ).toEqual({ payment: 402, otdLtv: 118, financed: 23789, approvalScore: 61 });
  });

  it("returns nulls for missing/blob-less deals so callers recompute", () => {
    expect(pipelineMetricsFromCalculatedData(undefined)).toEqual({
      payment: null,
      otdLtv: null,
      financed: null,
      approvalScore: null,
    });
    expect(pipelineMetricsFromCalculatedData({ lenderEligibility: [] })).toEqual({
      payment: null,
      otdLtv: null,
      financed: null,
      approvalScore: null,
    });
  });

  it("ignores non-finite values instead of rendering NaN", () => {
    expect(
      pipelineMetricsFromCalculatedData({ payment: "abc", otdLtv: Infinity, financed: "20079" })
    ).toEqual({ payment: null, otdLtv: null, financed: 20079, approvalScore: null });
  });
});

describe("toAppState", () => {
  it("accepts the full 5-state vocabulary incl. IL/FL", () => {
    expect(toAppState("IL", "MI")).toBe("IL");
    expect(toAppState("FL", "MI")).toBe("FL");
    expect(toAppState("CA", "MI")).toBe("MI");
  });
});
