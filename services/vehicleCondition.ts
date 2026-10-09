import type { DealData, Vehicle, VehicleCondition } from "../types";

type ConditionDeal = Pick<
  DealData,
  "vehicleCondition" | "vehicleConditionVin" | "vehicleConditions"
>;
export const conditionVinKey = (vin: string): string => vin.trim().toUpperCase();

/** Only explicit source labels qualify. A zero odometer or recent year is not a condition. */
export function normalizeVehicleCondition(value: unknown): VehicleCondition | undefined {
  if (typeof value !== "string") return undefined;
  switch (
    value
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "")
  ) {
    case "new":
    case "n":
      return "new";
    case "used":
    case "u":
    case "preowned":
      return "used";
    case "certified":
    case "cpo":
    case "certifiedpreowned":
    case "certifiedused":
      return "certified";
    default:
      return undefined;
  }
}

export function resolveVehicleCondition(
  vehicle: Pick<Vehicle, "vin" | "condition">,
  deal: ConditionDeal
): VehicleCondition | undefined {
  const vin = conditionVinKey(vehicle.vin);
  if (vin && Object.prototype.hasOwnProperty.call(deal.vehicleConditions ?? {}, vin)) {
    return normalizeVehicleCondition(deal.vehicleConditions?.[vin]);
  }
  if (vin && conditionVinKey(deal.vehicleConditionVin ?? "") === vin) {
    return normalizeVehicleCondition(deal.vehicleCondition);
  }
  return normalizeVehicleCondition(vehicle.condition);
}

/** Adapt older calculation boundaries while keeping the selected unit explicitly scoped. */
export function scopeDealToVehicle<T extends ConditionDeal>(
  vehicle: Pick<Vehicle, "vin" | "condition">,
  deal: T
): T {
  return {
    ...deal,
    vehicleCondition: resolveVehicleCondition(vehicle, deal),
    vehicleConditionVin: vehicle.vin,
  };
}

/** Scope old saved records once, at their restore boundary. */
export function scopeLegacyVehicleCondition(deal: DealData, vin?: string): DealData {
  return deal.vehicleCondition && !deal.vehicleConditionVin && vin
    ? { ...deal, vehicleConditionVin: conditionVinKey(vin) }
    : deal;
}
