import { describe, it, expect } from "vitest";
import { parseInventoryCsv, detectDelimiter, parseNumber } from "./fileParser";

describe("fileParser", () => {
  describe("detectDelimiter [B10]", () => {
    it("detects comma, semicolon, tab, and pipe", () => {
      expect(detectDelimiter("a,b,c,d")).toBe(",");
      expect(detectDelimiter("a;b;c;d")).toBe(";");
      expect(detectDelimiter("a\tb\tc\td")).toBe("\t");
      expect(detectDelimiter("a|b|c|d")).toBe("|");
    });
  });

  describe("parseNumber", () => {
    it("parses plain and currency-formatted numbers", () => {
      expect(parseNumber("30000")).toBe(30000);
      expect(parseNumber("$30,000")).toBe(30000);
      expect(parseNumber("1,234.56")).toBeCloseTo(1234.56, 2);
    });

    it("treats accounting-style parentheses as negative", () => {
      expect(parseNumber("(1,200.50)")).toBeCloseTo(-1200.5, 2);
    });

    it("refuses ambiguous European decimals instead of mis-parsing", () => {
      expect(parseNumber("1.234,56")).toBe("N/A");
    });

    it("refuses a pure comma-decimal value instead of parsing it as thousands [C-regression]", () => {
      // "28500,50" previously parsed as 2850050 — 1-2 digits after the final
      // comma is never a US thousands separator.
      expect(parseNumber("28500,50")).toBe("N/A");
    });

    it("still accepts trailing 3-digit thousands groups [C-regression]", () => {
      expect(parseNumber("1,234")).toBe(1234);
      expect(parseNumber("1,234,567")).toBe(1234567);
    });

    it("returns N/A for blank/non-numeric", () => {
      expect(parseNumber("")).toBe("N/A");
      expect(parseNumber(undefined)).toBe("N/A");
      expect(parseNumber("n/a")).toBe("N/A");
    });
  });

  describe("parseInventoryCsv", () => {
    const header = "Vehicle,VIN,Stock #,Price,Mileage,Unit Cost";

    it("pads short rows instead of dropping them [B1]", () => {
      // Row 2 omits the trailing optional Unit Cost column.
      const csv = [
        header,
        "2020 Toyota Camry,VIN1,S1,25000,30000,20000",
        "2021 Honda Civic,VIN2,S2,22000,15000",
      ].join("\n");
      const { vehicles, skipped } = parseInventoryCsv(csv, false);
      expect(vehicles).toHaveLength(2);
      expect(skipped).toBe(0);
      expect(vehicles[1]?.vehicle).toContain("Honda");
    });

    it("reports rows skipped for missing price/mileage instead of dropping silently [B1]", () => {
      const csv = [header, "2019 Ford F150,VIN3,S3,,40000,25000"].join("\n");
      // Only invalid rows -> parseInventoryCsv returns empty with a reason.
      const result = parseInventoryCsv(
        csv + "\n2020 Toyota Camry,VIN1,S1,25000,30000,20000",
        false
      );
      expect(result.vehicles).toHaveLength(1);
      expect(result.skipped).toBe(1);
      expect(result.reasons.join(" ")).toMatch(/Price\/Mileage/i);
    });

    it("ignores duplicate VINs and reports them [B11]", () => {
      const csv = [
        header,
        "2020 Toyota Camry,VIN1,S1,25000,30000,20000",
        "2020 Toyota Camry,VIN1,S1b,26000,31000,21000",
      ].join("\n");
      const { vehicles, skipped, reasons } = parseInventoryCsv(csv, false);
      expect(vehicles).toHaveLength(1);
      expect(skipped).toBe(1);
      expect(reasons.join(" ")).toMatch(/duplicate/i);
    });

    it("generates a stable synthetic VIN (no row index) when VIN is absent [B11]", () => {
      const noVinHeader = "Vehicle,Stock #,Price,Mileage";
      const rows = (order: string[]) => [noVinHeader, ...order].join("\n");
      const a = "2020 Toyota Camry,S1,25000,30000";
      const b = "2021 Honda Civic,S2,22000,15000";
      const first = parseInventoryCsv(rows([a, b]), false);
      const second = parseInventoryCsv(rows([b, a]), false); // rows reordered
      const vinFor = (res: typeof first, stock: string) =>
        res.vehicles.find((v) => v.stock === stock)?.vin;
      // Same car gets the same id regardless of position in the file.
      expect(vinFor(first, "S1")).toBe(vinFor(second, "S1"));
      expect(vinFor(first, "S1")).toMatch(/^SYN-/);
    });

    it("gives no-VIN rows differing only by trim distinct synthetic ids [C-regression]", () => {
      const trimHeader = "Make,Model,Trim,Stock #,Price,Mileage";
      const csv = [
        trimHeader,
        "Toyota,Camry,SE,S1,25000,30000",
        "Toyota,Camry,XLE,S1,25000,30000",
      ].join("\n");
      const { vehicles, skipped } = parseInventoryCsv(csv, false);
      expect(vehicles).toHaveLength(2);
      expect(skipped).toBe(0);
      expect(vehicles[0]?.vin).not.toBe(vehicles[1]?.vin);
    });

    it("keeps two IDENTICAL no-VIN rows with distinct suffixed ids [C-regression]", () => {
      const noVinHeader = "Vehicle,Stock #,Price,Mileage";
      const row = "2020 Toyota Camry,S1,25000,30000";
      const csv = [noVinHeader, row, row].join("\n");
      const { vehicles, skipped } = parseInventoryCsv(csv, false);
      expect(vehicles).toHaveLength(2);
      expect(skipped).toBe(0);
      const [first, second] = vehicles;
      expect(first?.vin).toMatch(/^SYN-/);
      expect(second?.vin).toBe(`${first?.vin}-2`);
    });

    it("parses tab-delimited files [B10]", () => {
      const tabCsv = [
        header.replace(/,/g, "\t"),
        "2020 Toyota Camry\tVIN1\tS1\t25000\t30000\t20000",
      ].join("\n");
      const { vehicles } = parseInventoryCsv(tabCsv, false);
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0]?.price).toBe(25000);
    });
  });
});
