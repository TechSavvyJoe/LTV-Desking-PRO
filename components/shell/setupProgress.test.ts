import { describe, it, expect } from "vitest";
import { setupProgress, isSampleVehicle, isSampleLender } from "./setupProgress";

describe("setupProgress [codex review: seeded samples must not complete setup]", () => {
  it("ignores seeded sample vehicles and sample lender programs", () => {
    const inventory = [
      { vin: "SAMPLE01AAAA1000" },
      { vin: "sample02aaaa1001" },
      { vin: "1HGCV1F3XMA000000" },
    ];
    const lenders = [{ isSample: true }, { isSample: true }, { isSample: false }, {}];
    const deals = [{ id: "d1" }];

    expect(setupProgress(inventory, lenders, deals)).toEqual({
      inventoryCount: 1,
      lenderCount: 2,
      savedDealCount: 1,
    });
  });

  it("reports zero for a dealer that only has the seed data", () => {
    expect(setupProgress([{ vin: "SAMPLE03AAAA1002" }], [{ isSample: true }], [])).toEqual({
      inventoryCount: 0,
      lenderCount: 0,
      savedDealCount: 0,
    });
  });

  it("classifies units and programs by the seed conventions only", () => {
    expect(isSampleVehicle({ vin: "SAMPLE07AAAA1006" })).toBe(true);
    expect(isSampleVehicle({ vin: "5YJSA1E26MF000000" })).toBe(false);
    expect(isSampleVehicle({ vin: "" })).toBe(false);
    // A dealer-created unit that merely starts with SAMPLE is still real stock.
    expect(isSampleVehicle({ vin: "SAMPLE1234567890X" })).toBe(false);
    expect(isSampleLender({ isSample: true })).toBe(true);
    expect(isSampleLender({})).toBe(false);
  });
});
