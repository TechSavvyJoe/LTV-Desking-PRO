import { describe, expect, it } from "vitest";
import { INITIAL_DEAL_DATA } from "../constants";
import {
  normalizeVehicleCondition,
  resolveVehicleCondition,
  scopeDealToVehicle,
  scopeLegacyVehicleCondition,
} from "./vehicleCondition";

describe("per-VIN condition evidence", () => {
  it("accepts explicit status labels and never guesses from numeric age or mileage", () => {
    expect(normalizeVehicleCondition("Certified Pre-Owned")).toBe("certified");
    expect(normalizeVehicleCondition("N")).toBe("new");
    expect(normalizeVehicleCondition("pre-owned")).toBe("used");
    for (const value of [0, 2026, "0 miles", "available", "excellent", "", undefined]) {
      expect(normalizeVehicleCondition(value)).toBeUndefined();
    }
  });
  it("never applies an unscoped legacy condition to mixed inventory", () => {
    const deal = { ...INITIAL_DEAL_DATA, vehicleCondition: "new" as const };
    expect(resolveVehicleCondition({ vin: "A", condition: "used" }, deal)).toBe("used");
    expect(resolveVehicleCondition({ vin: "B" }, deal)).toBeUndefined();
  });
  it("normalizes VIN keys and lets an explicit override clear a recorded condition", () => {
    const deal = { ...INITIAL_DEAL_DATA, vehicleConditions: { A: "certified" as const, B: null } };
    expect(resolveVehicleCondition({ vin: " a ", condition: "new" }, deal)).toBe("certified");
    expect(resolveVehicleCondition({ vin: "B", condition: "used" }, deal)).toBeUndefined();
    expect(resolveVehicleCondition({ vin: "C", condition: "new" }, deal)).toBe("new");
  });
  it("restores a historical condition only for the saved VIN", () => {
    const scoped = scopeLegacyVehicleCondition(
      { ...INITIAL_DEAL_DATA, vehicleCondition: "used" },
      " a "
    );
    expect(scoped.vehicleConditionVin).toBe("A");
    expect(resolveVehicleCondition({ vin: "A" }, scoped)).toBe("used");
    expect(resolveVehicleCondition({ vin: "B" }, scoped)).toBeUndefined();
    expect(scopeDealToVehicle({ vin: "B" }, scoped).vehicleCondition).toBeUndefined();
    expect(scopeDealToVehicle({ vin: "C", condition: "new" }, scoped).vehicleCondition).toBe("new");
  });
});
