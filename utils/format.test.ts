/**
 * Tests for the shared money formatters (verbatim dc-mockup semantics).
 */

import { describe, it, expect } from "vitest";
import { fmt, fmtN, splitPay } from "./format";

describe("fmt", () => {
  it("formats whole dollars with a $ prefix and en-US grouping", () => {
    expect(fmt(0)).toBe("$0");
    expect(fmt(999)).toBe("$999");
    expect(fmt(28450)).toBe("$28,450");
    expect(fmt(1234567)).toBe("$1,234,567");
  });

  it("rounds to the nearest dollar (half-up)", () => {
    expect(fmt(1234.49)).toBe("$1,234");
    expect(fmt(1234.5)).toBe("$1,235");
    expect(fmt(999.999)).toBe("$1,000");
  });

  it("keeps the sign inside the formatted number for negatives", () => {
    expect(fmt(-1250.4)).toBe("$-1,250");
    expect(fmt(-1250.6)).toBe("$-1,251");
  });
});

describe("fmtN", () => {
  it("formats rounded numbers without a currency symbol", () => {
    expect(fmtN(0)).toBe("0");
    expect(fmtN(72)).toBe("72");
    expect(fmtN(118234.4)).toBe("118,234");
    expect(fmtN(118234.5)).toBe("118,235");
  });

  it("handles negatives", () => {
    expect(fmtN(-987.65)).toBe("-988");
    expect(fmtN(-1500.6)).toBe("-1,501");
  });
});

describe("splitPay", () => {
  it("splits a payment into floored dollars and two-digit cents", () => {
    expect(splitPay(487.32)).toEqual({ whole: "$487", frac: ".32" });
    expect(splitPay(1234.56)).toEqual({ whole: "$1,234", frac: ".56" });
  });

  it("pads single-digit cents to two digits", () => {
    expect(splitPay(512.05)).toEqual({ whole: "$512", frac: ".05" });
    expect(splitPay(512.004)).toEqual({ whole: "$512", frac: ".00" });
  });

  it("handles a zero payment", () => {
    expect(splitPay(0)).toEqual({ whole: "$0", frac: ".00" });
  });

  it("carries a 100-cent round into the whole dollars", () => {
    // 123.999 → cents round to 100 → carry to $124.00
    expect(splitPay(123.999)).toEqual({ whole: "$124", frac: ".00" });
    expect(splitPay(999.995)).toEqual({ whole: "$1,000", frac: ".00" });
  });

  it("uses floor semantics for negatives (fractional part stays positive)", () => {
    expect(splitPay(-1.5)).toEqual({ whole: "$-2", frac: ".50" });
    expect(splitPay(-0.25)).toEqual({ whole: "$-1", frac: ".75" });
  });
});
