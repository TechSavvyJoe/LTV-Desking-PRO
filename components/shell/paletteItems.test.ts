import { describe, expect, it, vi } from "vitest";
import type { Vehicle } from "../../types";
import { vehiclePaletteItem } from "./paletteItems";

const baseVehicle: Vehicle = {
  vehicle: "2020 Toyota Camry SE",
  stock: "4402",
  vin: "1HGCM82633A123456",
  modelYear: 2020,
  mileage: 30000,
  price: 20000,
  jdPower: 19000,
  jdPowerRetail: 21000,
  unitCost: 18000,
  baseOutTheDoorPrice: 20500,
};

describe("vehiclePaletteItem", () => {
  it("searches by stock number when a real stock is present", () => {
    const item = vehiclePaletteItem(baseVehicle, 0, {
      setSearchQuery: vi.fn(),
      setFocusVin: vi.fn(),
      navigate: vi.fn(),
    });

    expect(item.detail).toContain("STK 4402");
    expect(item.keywords).toContain("4402");
  });

  it("falls back to VIN and excludes 'N/A' when stock is 'N/A'", () => {
    const vehicle: Vehicle = { ...baseVehicle, stock: "N/A" };
    const item = vehiclePaletteItem(vehicle, 0, {
      setSearchQuery: vi.fn(),
      setFocusVin: vi.fn(),
      navigate: vi.fn(),
    });

    expect(item.detail).not.toContain("N/A");
    expect(item.detail).toContain(`VIN ${vehicle.vin}`);
    expect(item.keywords).not.toContain("N/A");
    expect(item.keywords).toContain(vehicle.vin);
  });

  it("falls back to VIN and excludes 'N/A' when stock is empty", () => {
    const vehicle: Vehicle = { ...baseVehicle, stock: "" };
    const item = vehiclePaletteItem(vehicle, 0, {
      setSearchQuery: vi.fn(),
      setFocusVin: vi.fn(),
      navigate: vi.fn(),
    });

    expect(item.detail).not.toContain("N/A");
    expect(item.detail).toContain(`VIN ${vehicle.vin}`);
    expect(item.keywords).not.toContain("N/A");
    expect(item.keywords).toContain(vehicle.vin);
  });

  it("calls setSearchQuery, setFocusVin, and navigate in order on select", () => {
    const calls: string[] = [];
    const setSearchQuery = vi.fn(() => calls.push("setSearchQuery"));
    const setFocusVin = vi.fn(() => calls.push("setFocusVin"));
    const navigate = vi.fn(() => calls.push("navigate"));

    const item = vehiclePaletteItem(baseVehicle, 0, { setSearchQuery, setFocusVin, navigate });
    item.onSelect();

    expect(setSearchQuery).toHaveBeenCalledWith("4402");
    expect(setFocusVin).toHaveBeenCalledWith(baseVehicle.vin);
    expect(navigate).toHaveBeenCalledWith("/desk");
    expect(calls).toEqual(["setSearchQuery", "setFocusVin", "navigate"]);
  });
});
