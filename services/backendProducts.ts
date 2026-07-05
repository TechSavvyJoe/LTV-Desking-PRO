import type { DealData } from "../types";

export interface BackendProductSplit {
  vscAmount: number;
  gapAmount: number;
  otherBackend: number;
  total: number;
}

export interface BackendProductPatch {
  vscAmount?: number;
  gapAmount?: number;
  otherBackend?: number;
}

const nonNegative = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

export const parseMoneyInput = (value: string): number => {
  const n = parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

export const getBackendProductSplit = (
  dealData: Pick<DealData, "backendProducts" | "vscAmount" | "gapAmount">
): BackendProductSplit => {
  const total = nonNegative(dealData.backendProducts);
  const vscAmount = nonNegative(dealData.vscAmount);
  const gapAmount = nonNegative(dealData.gapAmount);
  const otherBackend = Math.max(0, total - vscAmount - gapAmount);

  return {
    vscAmount,
    gapAmount,
    otherBackend,
    total: vscAmount + gapAmount + otherBackend,
  };
};

export const applyBackendProductPatch = (
  dealData: Pick<DealData, "backendProducts" | "vscAmount" | "gapAmount">,
  patch: BackendProductPatch
): Pick<DealData, "backendProducts" | "vscAmount" | "gapAmount"> => {
  const current = getBackendProductSplit(dealData);
  const vscAmount = nonNegative(patch.vscAmount ?? current.vscAmount);
  const gapAmount = nonNegative(patch.gapAmount ?? current.gapAmount);
  const otherBackend = nonNegative(patch.otherBackend ?? current.otherBackend);

  return {
    vscAmount,
    gapAmount,
    backendProducts: vscAmount + gapAmount + otherBackend,
  };
};
