/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_SETTINGS } from "../../lib/aiModelRegistry";
import type { CalculatedVehicle, DealData, Settings } from "../../types";

const mocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  generateDealPdf: vi.fn(),
  downloadBlob: vi.fn(),
  checkBankEligibility: vi.fn(),
  getCurrentDealerDetails: vi.fn(),
  logDealEvent: vi.fn(),
  capture: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("../../context/DealContext", () => ({
  useDealContext: () => mocks.context,
}));

vi.mock("../../services/pdfGenerator", async () => {
  const actual = await vi.importActual<typeof import("../../services/pdfGenerator")>(
    "../../services/pdfGenerator"
  );
  return { ...actual, generateDealPdf: mocks.generateDealPdf };
});

vi.mock("../../utils/downloadBlob", async () => {
  const actual = await vi.importActual<typeof import("../../utils/downloadBlob")>(
    "../../utils/downloadBlob"
  );
  return { ...actual, downloadBlob: mocks.downloadBlob };
});

vi.mock("../../services/lenderMatcher", () => ({
  checkBankEligibility: mocks.checkBankEligibility,
}));

vi.mock("../../lib/api", () => ({
  getCurrentDealerDetails: mocks.getCurrentDealerDetails,
  logDealEvent: mocks.logDealEvent,
}));

vi.mock("../../lib/analytics", () => ({
  capture: mocks.capture,
}));

vi.mock("../../lib/toast", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

import { PdfGenerationError } from "../../services/pdfGenerator";
import { calculateFinancials } from "../../services/calculator";
import DealSheetModal from "./DealSheetModal";

const settings: Settings = {
  defaultTerm: 72,
  defaultApr: 8.9,
  defaultState: "MI",
  docFee: 280,
  cvrFee: 24,
  defaultStateFees: 31,
  outOfStateTransitFee: 10,
  customTaxRate: null,
  miTradeInCreditCap: 12000,
  vscPrice: 2495,
  gapPrice: 895,
  ltvThresholds: { warn: 115, danger: 125, critical: 135 },
  ai: DEFAULT_AI_SETTINGS,
};

const dealData: DealData = {
  downPayment: 1000,
  tradeInValue: 0,
  tradeInPayoff: 0,
  backendProducts: 3390,
  loanTerm: 72,
  interestRate: 8.9,
  stateFees: 31,
  notes: "",
  vscAmount: 2495,
  gapAmount: 895,
};

const vehicle: CalculatedVehicle = {
  vehicle: "2020 Ford Escape SEL",
  stock: "5101",
  vin: "1FMCU0H60LUA00001",
  modelYear: 2020,
  mileage: 71478,
  price: 24500,
  jdPower: 22000,
  jdPowerRetail: 25000,
  unitCost: 20000,
  baseOutTheDoorPrice: 26323,
  make: "Ford",
  model: "Escape",
  trim: "SEL",
  salesTax: 1540,
  frontEndLtv: 111,
  frontEndGross: 4500,
  amountToFinance: 26323,
  otdLtv: 120,
  monthlyPayment: 473.19,
  approvalScore: 68,
  approvalBand: "moderate",
  ptiRatio: 9.1,
  fitCount: 3,
  fitNames: ["Ford Credit", "Lake Trust CU", "PNC Bank"],
};

const renderModal = () =>
  render(<DealSheetModal vehicle={vehicle} onClose={vi.fn()} onSaveToPipeline={vi.fn()} />);

describe("DealSheetModal PDF states", () => {
  beforeEach(() => {
    mocks.context = {
      settings,
      dealData,
      filters: { creditScore: 680, monthlyIncome: 5200 },
      customerName: "Demo Customer",
      salespersonName: "Demo Salesperson",
      safeLenderProfiles: [{ id: "ford", name: "Ford Credit", tiers: [] }],
    };
    mocks.generateDealPdf.mockResolvedValue(
      new Blob([new Uint8Array(600)], { type: "application/pdf" })
    );
    mocks.downloadBlob.mockReturnValue({
      status: "download-triggered",
      filename: "Deal_Sheet_5101.pdf",
      url: "blob:deal-sheet",
      revoke: vi.fn(),
    });
    mocks.checkBankEligibility.mockReturnValue({
      eligible: true,
      reasons: [],
      matchedTier: null,
    });
    mocks.getCurrentDealerDetails.mockResolvedValue({ name: "Bob Maxey Ford" });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows success and exposes an Open PDF fallback link", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    expect(await screen.findByText("PDF ready")).toBeTruthy();
    expect(screen.getByRole("link", { name: /open pdf fallback/i }).getAttribute("href")).toBe(
      "blob:deal-sheet"
    );
    expect(mocks.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "Deal_Sheet_5101.pdf", {
      revokeAfterMs: 60_000,
    });
    expect(mocks.capture).toHaveBeenCalledWith(
      "pdf_generated",
      expect.objectContaining({ pdfType: "deal_sheet", status: "download-triggered" })
    );
    expect(mocks.logDealEvent).toHaveBeenCalledWith(
      "deal_sheet_generated",
      expect.objectContaining({
        vin: vehicle.vin,
        customerName: "Demo Customer",
        snapshot: expect.objectContaining({
          backendProducts: 3390,
          vscAmount: 2495,
          gapAmount: 895,
        }),
      })
    );
  });

  it("recalculates the PDF synchronously from edited terms and normalizes backend split", async () => {
    const editedDeal = {
      ...dealData,
      downPayment: 5000,
      backendProducts: 1000,
    };
    mocks.context = { ...mocks.context, dealData: editedDeal };

    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    await waitFor(() => expect(mocks.generateDealPdf).toHaveBeenCalledTimes(1));

    const pdfData = mocks.generateDealPdf.mock.calls[0]?.[0];
    const normalizedDeal = { ...editedDeal, backendProducts: 3390 };
    const expected = calculateFinancials(vehicle, normalizedDeal, settings);
    expect(pdfData.dealData.backendProducts).toBe(3390);
    expect(pdfData.vehicle.amountToFinance).toBe(expected.amountToFinance);
    expect(pdfData.vehicle.amountToFinance).not.toBe(vehicle.amountToFinance);
    expect(mocks.checkBankEligibility).toHaveBeenCalledWith(
      expect.objectContaining({ amountToFinance: expected.amountToFinance }),
      expect.objectContaining({ downPayment: 5000, backendProducts: 3390 }),
      expect.any(Object)
    );
  });

  it("passes pending sample provenance through to PDF lender language", async () => {
    mocks.checkBankEligibility.mockReturnValue({
      eligible: false,
      status: "pending",
      reasons: [
        "Sample program - illustrative only; verify or convert it before using it as an approval path.",
      ],
      matchedTier: { name: "Illustrative" },
      uncheckedConstraints: ["sample program - verify or convert before use"],
      effectiveRate: 6.5,
      evaluatedConstraints: 1,
    });

    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    await waitFor(() => expect(mocks.generateDealPdf).toHaveBeenCalledTimes(1));

    const pdfData = mocks.generateDealPdf.mock.calls[0]?.[0];
    expect(pdfData.vehicle.fitCount).toBe(0);
    expect(pdfData.lenderEligibility[0]).toMatchObject({
      eligible: false,
      status: "pending",
      reasons: [expect.stringMatching(/illustrative only/i)],
    });
  });

  it("shows coded PDF errors", async () => {
    mocks.generateDealPdf.mockRejectedValue(
      new PdfGenerationError("blank_canvas", "Canvas rendered blank.")
    );

    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    await waitFor(() => {
      expect(screen.getByText("PDF error · blank_canvas")).toBeTruthy();
    });
    expect(screen.queryByRole("link", { name: /open pdf fallback/i })).toBeNull();
    expect(mocks.capture).toHaveBeenCalledWith(
      "pdf_failed",
      expect.objectContaining({ pdfType: "deal_sheet", code: "blank_canvas" })
    );
  });

  it("renders without crashing when some context fields are missing (component edge)", () => {
    mocks.context = { settings, dealData: { ...dealData, interestRate: "" }, filters: {} };
    const { container } = renderModal();
    expect(container).toBeTruthy();
    expect(screen.getByText(/deal sheet/i)).toBeTruthy();
  });

  it("toasts error on unexpected PDF failure (not typed PdfGenerationError)", async () => {
    mocks.generateDealPdf.mockRejectedValue(new Error("random crash"));
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalled();
    });
  });

  it("displays render_failed PDF error code and does not expose fallback [PDF-failures-component]", async () => {
    mocks.generateDealPdf.mockRejectedValue(
      new PdfGenerationError("render_failed", "html2canvas crashed")
    );
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    await waitFor(() => {
      expect(screen.getByText("PDF error · render_failed")).toBeTruthy();
    });
    expect(screen.queryByRole("link", { name: /open pdf fallback/i })).toBeNull();
    expect(mocks.capture).toHaveBeenCalledWith(
      "pdf_failed",
      expect.objectContaining({ code: "render_failed" })
    );
  });

  it("handles dependency_load_failed from PDF gen without leaking internals [PDF-failures-component]", async () => {
    mocks.generateDealPdf.mockRejectedValue(
      new PdfGenerationError("dependency_load_failed", "jspdf import fail")
    );
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    await waitFor(() => {
      expect(screen.getByText(/PDF error · dependency_load_failed/)).toBeTruthy();
      expect(mocks.toastError).toHaveBeenCalled();
    });
  });

  it("component edge: PDF generation skipped when busy prevents double call [PDF-failures-component]", async () => {
    let resolvePdf: (b: Blob) => void;
    const pendingPdf = new Promise<Blob>((r) => {
      resolvePdf = r;
    });
    mocks.generateDealPdf.mockReturnValue(pendingPdf as any);

    renderModal();
    const btn = screen.getByRole("button", { name: /download pdf/i });
    fireEvent.click(btn);
    // Wait for generating state to be reflected in UI (avoids stale closure on sync clicks)
    await waitFor(() => expect(screen.getByText("Generating PDF...")).toBeTruthy());
    // second click while generating should be ignored by guard
    fireEvent.click(btn);

    // resolve to clean
    resolvePdf!(new Blob([new Uint8Array(600)], { type: "application/pdf" }));
    await waitFor(() => {
      expect(mocks.generateDealPdf).toHaveBeenCalledTimes(1);
    });
  });

  it("traps focus, closes once on Escape, and restores the trigger focus", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open deal sheet";
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();

    const { unmount } = render(
      <DealSheetModal vehicle={vehicle} onClose={onClose} onSaveToPipeline={vi.fn()} />
    );
    const headerClose = screen.getAllByRole("button", { name: /^close$/i })[0];
    const saveButton = screen.getByRole("button", { name: /save to pipeline/i });

    await waitFor(() => expect(document.activeElement).toBe(headerClose));
    fireEvent.keyDown(headerClose!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(saveButton);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
