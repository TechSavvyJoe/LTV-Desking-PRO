import { describe, expect, it } from "vitest";
import { compareSortValues } from "./sortComparator";

describe("compareSortValues", () => {
  it("sorts invalid values last regardless of direction", () => {
    expect(compareSortValues("N/A", 10, "asc")).toBe(1);
    expect(compareSortValues(10, "Error", "asc")).toBe(-1);
    expect(compareSortValues(null, undefined, "desc")).toBe(0);
    expect(compareSortValues("N/A", 10, "desc")).toBe(1);
  });

  it("compares numbers and strings by direction", () => {
    expect(compareSortValues(1, 5, "asc")).toBeLessThan(0);
    expect(compareSortValues(1, 5, "desc")).toBeGreaterThan(0);
    expect(compareSortValues("alpha", "beta", "asc")).toBeLessThan(0);
    expect(compareSortValues("alpha", "beta", "desc")).toBeGreaterThan(0);
  });

  it("ties mixed types when mixedFallback is none", () => {
    expect(compareSortValues(1, "1", "asc")).toBe(0);
  });

  it("stringifies mixed types when requested", () => {
    expect(compareSortValues(1, "2", "asc", "stringify")).toBeLessThan(0);
    expect(compareSortValues(1, "2", "desc", "stringify")).toBeGreaterThan(0);
  });
});
