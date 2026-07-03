import { INITIAL_DEAL_DATA } from "../constants";
import type { AppState, CalculatedVehicle, DealData, SavedDeal as AppSavedDeal } from "../types";
import type { SavedDeal as PocketBaseSavedDeal } from "./pocketbase";

type UnknownRecord = Record<string, unknown>;

const APP_STATES: readonly AppState[] = ["MI", "OH", "IN", "IL", "FL"];

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toNumberOr = (value: unknown, fallback: number): number => toFiniteNumber(value) ?? fallback;

const toNumberOrNA = (value: unknown): number | "N/A" => toFiniteNumber(value) ?? "N/A";

const toNumberErrorOrNA = (value: unknown): number | "Error" | "N/A" => {
  if (value === "Error") return "Error";
  return toFiniteNumber(value) ?? "N/A";
};

const toStringOr = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() !== "" ? value : fallback;

const toOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

const toOptionalNumber = (value: unknown): number | null => toFiniteNumber(value) ?? null;

export const toAppState = (value: unknown, fallback: AppState): AppState =>
  typeof value === "string" && APP_STATES.includes(value as AppState)
    ? (value as AppState)
    : fallback;

// ============================================
// Pipeline status buckets [Phase 6 / reconciliation 7]
// ============================================

/** The canonical PocketBase saved_deals.status values (1747810000 migration). */
export const CANONICAL_DEAL_STATUSES = [
  "draft",
  "pending",
  "submitted",
  "approved",
  "funded",
  "declined",
  "cancelled",
] as const;

export type CanonicalDealStatus = (typeof CANONICAL_DEAL_STATUSES)[number];

/** The four pipeline display buckets the Pipeline screen renders. */
export type StatusBucket = "pending" | "approved" | "funded" | "declined";

/**
 * Map a canonical saved_deals.status to its pipeline display bucket:
 * draft/pending/submitted → "pending", approved → "approved",
 * funded → "funded", declined/cancelled → "declined".
 *
 * Unknown/legacy status strings bucket as "pending" — the safest read for a
 * working pipeline (still in flight) rather than mislabeling the deal with a
 * terminal state. [Phase 6]
 */
export const statusBucket = (status: string | null | undefined): StatusBucket => {
  switch (status) {
    case "approved":
      return "approved";
    case "funded":
      return "funded";
    case "declined":
    case "cancelled":
      return "declined";
    case "draft":
    case "pending":
    case "submitted":
    default:
      return "pending";
  }
};

export interface StatusBucketMeta {
  /** Pill text ("Pending" / "Approved" / "Funded" / "Declined"). */
  label: string;
  /** Pill foreground token. */
  colorVar: string;
  /** Pill background token. */
  bgVar: string;
}

/**
 * Bucket → pill label/colors, per the mockup's `_stColors`
 * (Pending warning · Approved success · Funded primary · Declined danger).
 */
export const STATUS_BUCKET_META: Record<StatusBucket, StatusBucketMeta> = {
  pending: {
    label: "Pending",
    colorVar: "var(--color-warning)",
    bgVar: "var(--color-warning-subtle)",
  },
  approved: {
    label: "Approved",
    colorVar: "var(--color-success)",
    bgVar: "var(--color-success-subtle)",
  },
  funded: {
    label: "Funded",
    colorVar: "var(--color-primary)",
    bgVar: "var(--color-primary-subtle)",
  },
  declined: {
    label: "Declined",
    colorVar: "var(--color-danger)",
    bgVar: "var(--color-danger-subtle)",
  },
};

/**
 * Normalize a raw status value to a canonical one. Unknown strings collapse to
 * "draft" (which buckets to "pending" — consistent with statusBucket's
 * unknown-status behavior) so a legacy/bad value can never render an
 * out-of-vocabulary status or a terminal pill.
 */
export const toCanonicalStatus = (value: unknown): CanonicalDealStatus =>
  typeof value === "string" && (CANONICAL_DEAL_STATUSES as readonly string[]).includes(value)
    ? (value as CanonicalDealStatus)
    : "draft";

export const mapDealData = (value: unknown): DealData => {
  const record = isRecord(value) ? value : {};

  return {
    downPayment: toNumberOr(record.downPayment, INITIAL_DEAL_DATA.downPayment),
    tradeInValue: toNumberOr(record.tradeInValue, INITIAL_DEAL_DATA.tradeInValue),
    tradeInPayoff: toNumberOr(record.tradeInPayoff, INITIAL_DEAL_DATA.tradeInPayoff),
    backendProducts: toNumberOr(record.backendProducts, INITIAL_DEAL_DATA.backendProducts),
    loanTerm: toNumberOr(record.loanTerm, INITIAL_DEAL_DATA.loanTerm),
    interestRate: toNumberOr(record.interestRate, INITIAL_DEAL_DATA.interestRate),
    stateFees: toNumberOr(record.stateFees, INITIAL_DEAL_DATA.stateFees),
    notes: toStringOr(record.notes, INITIAL_DEAL_DATA.notes),
    // Carry per-deal buyer state through persistence/PDF round-trips so an
    // out-of-state buyer's tax basis isn't silently lost on reload. [G18]
    buyerState: APP_STATES.includes(record.buyerState as AppState)
      ? (record.buyerState as DealData["buyerState"])
      : undefined,
  };
};

export const mapCalculatedVehicle = (value: unknown): CalculatedVehicle => {
  const record = isRecord(value) ? value : {};
  const make = toOptionalString(record.make);
  const model = toOptionalString(record.model);
  const trim = toOptionalString(record.trim);
  const modelYear = toNumberOrNA(record.modelYear ?? record.year);
  const nameFallback = [modelYear === "N/A" ? undefined : modelYear, make, model, trim]
    .filter(Boolean)
    .join(" ");

  return {
    id: toOptionalString(record.id),
    vehicle: toStringOr(record.vehicle, nameFallback || "Unknown Vehicle"),
    stock: toStringOr(record.stock ?? record.stockNumber, "N/A"),
    vin: toStringOr(record.vin, "N/A"),
    modelYear,
    mileage: toNumberOrNA(record.mileage),
    price: toNumberOrNA(record.price),
    jdPower: toNumberOrNA(record.jdPower),
    jdPowerRetail: toNumberOrNA(record.jdPowerRetail),
    unitCost: toNumberOrNA(record.unitCost),
    baseOutTheDoorPrice: toNumberErrorOrNA(record.baseOutTheDoorPrice),
    make,
    model,
    trim,
    salesTax: toNumberErrorOrNA(record.salesTax),
    frontEndLtv: toNumberErrorOrNA(record.frontEndLtv),
    frontEndGross: toNumberErrorOrNA(record.frontEndGross),
    amountToFinance: toNumberErrorOrNA(record.amountToFinance),
    otdLtv: toNumberErrorOrNA(record.otdLtv),
    monthlyPayment: toNumberErrorOrNA(record.monthlyPayment),
    // Score snapshot carried through persistence so the Pipeline APPROVAL
    // column can render the odds shown at save time. [Phase 6]
    approvalScore: toFiniteNumber(record.approvalScore),
    fitCount: toFiniteNumber(record.fitCount),
  };
};

/**
 * Pipeline-only fields carried on top of the app SavedDeal shape (types.ts is
 * frozen this wave, so the Pipeline screen reads them through this extension —
 * mapPocketBaseSavedDeal always populates them, and PipelineSavedDeal is
 * structurally assignable to SavedDeal so every existing consumer keeps
 * working unchanged). [Phase 6]
 */
export interface PipelineDealFields {
  status: CanonicalDealStatus;
  /** Lender the deal was submitted to / approved with (1747810000). */
  lenderName?: string;
  /** Persisted metric snapshot (payment/otdLtv/financed/approvalScore …). */
  calculatedData?: UnknownRecord;
}

export type PipelineSavedDeal = AppSavedDeal & PipelineDealFields;

export const mapPocketBaseSavedDeal = (deal: PocketBaseSavedDeal): PipelineSavedDeal => {
  const customerFilterSource = isRecord(deal.customerFilters)
    ? deal.customerFilters
    : isRecord(deal.dealData)
      ? deal.dealData
      : {};

  const vehicle = mapCalculatedVehicle(deal.vehicleData);

  return {
    id: deal.id,
    date: deal.created,
    // Populate createdAt + vehicleSnapshot so DealHistoryPanel sorts by date and
    // renders the stored payment instead of N/A. [frontend-state]
    createdAt: deal.created,
    customerName: deal.customerName || "Unknown",
    salespersonName: deal.salespersonName || "Unknown",
    vehicle,
    vehicleSnapshot: vehicle,
    vehicleVin: vehicle.vin !== "N/A" ? vehicle.vin : undefined,
    dealData: mapDealData(deal.dealData),
    customerFilters: {
      creditScore: toOptionalNumber(customerFilterSource.creditScore),
      monthlyIncome: toOptionalNumber(customerFilterSource.monthlyIncome),
    },
    notes: deal.notes || "",
    status: toCanonicalStatus(deal.status),
    lenderName: toOptionalString(deal.lenderName),
    calculatedData: isRecord(deal.calculatedData) ? deal.calculatedData : undefined,
  };
};

/**
 * View a context SavedDeal as a PipelineSavedDeal. The provider stores what
 * mapPocketBaseSavedDeal produced, so the pipeline fields are present at
 * runtime — this narrows them back defensively (a deal that somehow lost its
 * status reads "draft" → bucket "pending").
 */
export const asPipelineDeal = (deal: AppSavedDeal): PipelineSavedDeal => {
  const rec = deal as AppSavedDeal & Partial<PipelineDealFields>;
  return {
    ...deal,
    status: toCanonicalStatus(rec.status),
    lenderName: toOptionalString(rec.lenderName),
    calculatedData: isRecord(rec.calculatedData) ? rec.calculatedData : undefined,
  };
};

/** Metric snapshot the Pipeline drawer renders (null = recompute from the deal). */
export interface PipelineMetrics {
  payment: number | null;
  otdLtv: number | null;
  financed: number | null;
  approvalScore: number | null;
}

/**
 * Project the persisted calculatedData blob into the Pipeline drawer's metric
 * set. Accepts both the canonical keys written at save time
 * (payment/otdLtv/financed/approvalScore, reconciliation 7) and their
 * legacy/serialized aliases (monthlyPayment/amountToFinance/amountFinanced/
 * score). Anything missing reads null so the caller can recompute from the
 * deal snapshot with services/calculator. [Phase 6]
 */
export const pipelineMetricsFromCalculatedData = (
  calculatedData: UnknownRecord | undefined | null
): PipelineMetrics => {
  const record = isRecord(calculatedData) ? calculatedData : {};
  const pick = (...keys: string[]): number | null => {
    for (const key of keys) {
      const n = toFiniteNumber(record[key]);
      if (n !== undefined) return n;
    }
    return null;
  };
  return {
    payment: pick("payment", "monthlyPayment"),
    otdLtv: pick("otdLtv", "otd"),
    financed: pick("financed", "amountToFinance", "amountFinanced"),
    approvalScore: pick("approvalScore", "score"),
  };
};
