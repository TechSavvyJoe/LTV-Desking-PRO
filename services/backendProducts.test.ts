import { describe, expect, it } from "vitest";
import {
  applyBackendProductPatch,
  getBackendProductSplit,
  normalizeBackendProductFields,
  parseMoneyInput,
} from "./backendProducts";

describe("backend product split", () => {
  it("keeps backendProducts as the canonical total", () => {
    const split = getBackendProductSplit({
      backendProducts: 4_000,
      vscAmount: 2_495,
      gapAmount: 895,
    });

    expect(split).toEqual({
      vscAmount: 2_495,
      gapAmount: 895,
      otherBackend: 610,
      total: 4_000,
    });
  });

  it("patches VSC/GAP/other while preserving the sum invariant", () => {
    const next = applyBackendProductPatch(
      { backendProducts: 3_390, vscAmount: 2_495, gapAmount: 895 },
      { vscAmount: 3_100, otherBackend: 250 }
    );

    expect(next).toEqual({
      vscAmount: 3_100,
      gapAmount: 895,
      backendProducts: 4_245,
    });
  });

  it("does not let missing or bad inputs create negative totals", () => {
    const next = applyBackendProductPatch(
      { backendProducts: -100, vscAmount: undefined, gapAmount: undefined },
      { gapAmount: -50, otherBackend: 125 }
    );

    expect(next).toEqual({
      vscAmount: 0,
      gapAmount: 0,
      backendProducts: 125,
    });
  });

  it("repairs a stale total that is lower than its persisted components", () => {
    expect(
      normalizeBackendProductFields({
        backendProducts: 1000,
        vscAmount: 2495,
        gapAmount: 895,
      })
    ).toEqual({
      backendProducts: 3390,
      vscAmount: 2495,
      gapAmount: 895,
    });
  });

  it("preserves an excess canonical total as implicit other backend", () => {
    expect(
      normalizeBackendProductFields({
        backendProducts: 4000,
        vscAmount: 2495,
        gapAmount: 895,
      })
    ).toEqual({
      backendProducts: 4000,
      vscAmount: 2495,
      gapAmount: 895,
    });
  });

  it("parses formatted money input for editable add-on fields", () => {
    expect(parseMoneyInput("$2,495")).toBe(2495);
    expect(parseMoneyInput("")).toBe(0);
    expect(parseMoneyInput("-100")).toBe(100);
  });
});
