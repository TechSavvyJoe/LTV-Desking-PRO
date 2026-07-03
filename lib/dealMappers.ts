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
  };
};

export const mapPocketBaseSavedDeal = (deal: PocketBaseSavedDeal): AppSavedDeal => {
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
  };
};
