import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDealContext } from "../../context/DealContext";
import { fmt, splitPay } from "../../utils/format";
import { PdfGenerationError, generateDealPdf } from "../../services/pdfGenerator";
import { checkBankEligibility } from "../../services/lenderMatcher";
import { calculateFinancials, getRebateBreakdown } from "../../services/calculator";
import { lenderFitForVehicle } from "../../services/lenderFit";
import { scoreApprovalOdds } from "../../services/approvalScorer";
import { normalizeBackendProductFields } from "../../services/backendProducts";
import { getCurrentDealerDetails, logDealEvent } from "../../lib/api";
import { capture } from "../../lib/analytics";
import { toast } from "../../lib/toast";
import { BlobDownloadError, downloadBlob } from "../../utils/downloadBlob";
import { useFocusTrap, useKeyboardShortcuts, useRestoreFocus } from "../../hooks/useKeyboard";
import type { CalculatedVehicle, DealPdfData } from "../../types";

const mono = "var(--mono)";

const numVal = (v: number | "Error" | "N/A" | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

interface DealSheetModalProps {
  /** The focused (scored) vehicle the sheet is prepared for. */
  vehicle: CalculatedVehicle;
  onClose: () => void;
  /**
   * Save-to-pipeline. The PARENT closes this modal before saving so the
   * success toast (z-80) never renders under the modal backdrop. [dc-redesign]
   */
  onSaveToPipeline: () => void;
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 13,
};
const rowLabel: React.CSSProperties = { color: "var(--color-text-muted)" };

const secondaryBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--color-border-strong)",
  color: "var(--color-text)",
  borderRadius: 8,
  padding: "8px 15px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

type PdfUiState =
  | { status: "idle" }
  | { status: "generating"; message: string }
  | { status: "downloaded"; message: string; filename: string; url: string | null }
  | { status: "error"; code: string; message: string };

const PDF_FALLBACK_LIFETIME_MS = 60_000;

const pdfErrorCode = (error: unknown): string => {
  if (error instanceof PdfGenerationError || error instanceof BlobDownloadError) return error.code;
  return "unknown";
};

const pdfErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  return "The deal sheet PDF could not be generated.";
};

const dealSheetFilename = (vehicle: CalculatedVehicle): string => {
  const id = vehicle.stock && vehicle.stock !== "N/A" ? vehicle.stock : vehicle.vin;
  return `Deal_Sheet_${id}.pdf`;
};

/**
 * Deal sheet modal — the customer-facing summary per LTV Desking PRO.dc.html
 * lines 910-945: dealer + date eyebrow, payment hero, financial breakdown with
 * suggested lender + PTI, and the verbatim estimate disclaimer. Adds a
 * "Download PDF" action wired to the existing deal-sheet PDF path (same
 * DealPdfData shape the legacy Favorites flow built). [dc-redesign / Phase 5]
 */
const DealSheetModalBase: React.FC<DealSheetModalProps> = ({
  vehicle,
  onClose,
  onSaveToPipeline,
}) => {
  const { settings, dealData, filters, customerName, salespersonName, safeLenderProfiles } =
    useDealContext();

  const [dealerName, setDealerName] = useState<string>("");
  const [pdfState, setPdfState] = useState<PdfUiState>({ status: "idle" });
  const revokePdfUrlRef = useRef<(() => void) | null>(null);
  const expirePdfFallbackRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const pdfBusy = pdfState.status === "generating";

  useRestoreFocus(true);
  useFocusTrap(dialogRef as React.RefObject<HTMLElement>, true);
  useKeyboardShortcuts({ escape: onClose }, true);

  useEffect(() => {
    let cancelled = false;
    getCurrentDealerDetails().then((dealer) => {
      if (!cancelled && dealer?.name) setDealerName(dealer.name);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (expirePdfFallbackRef.current) window.clearTimeout(expirePdfFallbackRef.current);
      revokePdfUrlRef.current?.();
    },
    []
  );

  const dateLabel = new Date()
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    .toUpperCase();

  const custName =
    typeof customerName === "string" && customerName.trim()
      ? customerName.trim()
      : "Walk-in customer";

  const lenders = Array.isArray(safeLenderProfiles) ? safeLenderProfiles : [];
  const normalizedDealData = useMemo(
    () => ({ ...dealData, ...normalizeBackendProductFields(dealData) }),
    [dealData]
  );
  const liveVehicle = useMemo(() => {
    const calculated = calculateFinancials(vehicle, normalizedDealData, settings);
    const fit = lenderFitForVehicle(calculated, { ...normalizedDealData, ...filters }, lenders);
    const approval = scoreApprovalOdds(calculated, filters, fit.fitCount);
    return {
      ...calculated,
      approvalScore: approval.internalScore,
      approvalBand: approval.band,
      ptiRatio: approval.ptiRatio,
      fitCount: fit.fitCount,
      fitNames: fit.fitNames,
    };
  }, [filters, lenders, normalizedDealData, settings, vehicle]);
  const rebate = getRebateBreakdown(normalizedDealData);
  const price = numVal(liveVehicle.price);
  const baseOtd = numVal(liveVehicle.baseOutTheDoorPrice);
  const discountedPrice = price === null ? null : Math.max(0, price - rebate.dealerDiscount);
  const taxFees =
    discountedPrice !== null && baseOtd !== null
      ? baseOtd - discountedPrice
      : numVal(liveVehicle.salesTax);
  const addons = normalizedDealData.backendProducts;
  const down =
    (normalizedDealData.downPayment || 0) +
    ((normalizedDealData.tradeInValue || 0) - (normalizedDealData.tradeInPayoff || 0)) +
    rebate.manufacturerRebate;
  const financed = numVal(liveVehicle.amountToFinance);
  const payment = numVal(liveVehicle.monthlyPayment);
  const pay = payment !== null ? splitPay(payment) : null;

  const pti = liveVehicle.ptiRatio;
  const ptiColor =
    pti === undefined
      ? "var(--color-text-muted)"
      : pti <= 13
        ? "var(--color-success)"
        : pti <= 18
          ? "var(--color-warning)"
          : "var(--color-danger)";

  const bestLender =
    liveVehicle.fitNames && liveVehicle.fitNames.length > 0 ? liveVehicle.fitNames[0] : "—";

  const aprLabel =
    typeof normalizedDealData.interestRate === "number" &&
    Number.isFinite(normalizedDealData.interestRate)
      ? `${normalizedDealData.interestRate}%`
      : "—";

  const handleDownloadPdf = async () => {
    if (pdfBusy) return;
    setPdfState({ status: "generating", message: "Generating PDF..." });
    try {
      // Recalculate from the live, non-debounced inputs at click time. The
      // vehicle prop may still carry the prior 300ms scoring snapshot.
      const freshFinancials = calculateFinancials(vehicle, normalizedDealData, settings);
      const freshFit = lenderFitForVehicle(
        freshFinancials,
        { ...normalizedDealData, ...filters },
        lenders
      );
      const freshApproval = scoreApprovalOdds(freshFinancials, filters, freshFit.fitCount);
      const freshVehicle: CalculatedVehicle = {
        ...freshFinancials,
        approvalScore: freshApproval.internalScore,
        approvalBand: freshApproval.band,
        ptiRatio: freshApproval.ptiRatio,
        fitCount: freshFit.fitCount,
        fitNames: freshFit.fitNames,
      };
      const pdfData: DealPdfData = {
        vehicle: freshVehicle,
        dealData: normalizedDealData,
        customerFilters: {
          creditScore: filters.creditScore,
          monthlyIncome: filters.monthlyIncome,
          monthlyDebt: filters.monthlyDebt,
        },
        customerName,
        salespersonName,
        lenderEligibility: lenders.map((bank) => ({
          name: bank.name,
          ...checkBankEligibility(freshVehicle, { ...normalizedDealData, ...filters }, bank),
        })),
      };
      const blob = await generateDealPdf(pdfData, settings);
      const result = downloadBlob(blob, dealSheetFilename(freshVehicle), {
        revokeAfterMs: PDF_FALLBACK_LIFETIME_MS,
      });
      revokePdfUrlRef.current?.();
      if (expirePdfFallbackRef.current) window.clearTimeout(expirePdfFallbackRef.current);
      revokePdfUrlRef.current = result.revoke;
      setPdfState({
        status: "downloaded",
        message: "Download started. If Chrome blocks it, open the PDF below.",
        filename: result.filename,
        url: result.url,
      });
      expirePdfFallbackRef.current = window.setTimeout(() => {
        setPdfState((current) =>
          current.status === "downloaded" && current.url === result.url
            ? {
                ...current,
                url: null,
                message:
                  "Download started. The fallback link expired; generate again to reopen it.",
              }
            : current
        );
      }, PDF_FALLBACK_LIFETIME_MS);
      toast.success("PDF ready. Download started.");
      capture("pdf_generated", {
        pdfType: "deal_sheet",
        status: result.status,
        term: normalizedDealData.loanTerm,
        fitCount: freshVehicle.fitCount ?? 0,
      });
      logDealEvent("deal_sheet_generated", {
        vin: freshVehicle.vin,
        customerName,
        snapshot: {
          stock: freshVehicle.stock,
          term: normalizedDealData.loanTerm,
          amountFinanced: freshVehicle.amountToFinance,
          monthlyPayment: freshVehicle.monthlyPayment,
          otdLtv: freshVehicle.otdLtv,
          ptiRatio: freshVehicle.ptiRatio,
          backendProducts: normalizedDealData.backendProducts,
          vscAmount: normalizedDealData.vscAmount ?? 0,
          gapAmount: normalizedDealData.gapAmount ?? 0,
          fitCount: freshVehicle.fitCount ?? 0,
          pdfStatus: result.status,
        },
      });
    } catch (error) {
      // Error surfaced to UI via PdfGenerationError; log at call site if needed.
      const code = pdfErrorCode(error);
      const message = pdfErrorMessage(error);
      setPdfState({ status: "error", code, message });
      capture("pdf_failed", {
        pdfType: "deal_sheet",
        code,
        term: normalizedDealData.loanTerm,
        fitCount: liveVehicle.fitCount ?? 0,
      });
      toast.error(`PDF failed (${code}).`);
    }
  };

  return (
    <div
      onClick={onClose}
      className="modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4,7,10,.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: "var(--z-modal)",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Deal sheet"
        ref={dialogRef}
        tabIndex={-1}
        style={{
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          boxShadow: "var(--shadow-md)",
          width: "100%",
          maxWidth: 440,
          display: "flex",
          flexDirection: "column",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontFamily: mono,
                color: "var(--color-text-subtle)",
              }}
            >
              {dealerName || "—"} · {dateLabel}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 3 }}>Deal sheet</div>
          </div>
          <button
            onClick={onClose}
            className="transition-colors"
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              width: 30,
              height: 30,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 22px" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Prepared for</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{custName}</div>
          <div style={{ fontSize: 14, color: "var(--color-text-muted)", marginTop: 2 }}>
            {liveVehicle.vehicle} · STK {liveVehicle.stock}
          </div>

          <div
            className="pay-glow"
            style={{
              margin: "14px 0",
              padding: "14px 16px",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.1em",
                fontFamily: mono,
                color: "var(--color-text-muted)",
              }}
            >
              EST. MONTHLY PAYMENT
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 1, marginTop: 4 }}>
              <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: 0, lineHeight: 1 }}>
                {pay ? pay.whole : "—"}
              </span>
              <span style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text-muted)" }}>
                {pay ? pay.frac : ""}
              </span>
              <span style={{ fontSize: 13, color: "var(--color-text-subtle)", marginLeft: 6 }}>
                /mo · {normalizedDealData.loanTerm} mo · {aprLabel} APR
              </span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={rowStyle}>
              <span style={rowLabel}>Selling price</span>
              <span style={{ fontFamily: mono }}>{price === null ? "—" : fmt(price)}</span>
            </div>
            {rebate.dealerDiscount > 0 && (
              <div style={rowStyle}>
                <span style={rowLabel}>Dealer discount / rebate</span>
                <span style={{ fontFamily: mono, color: "var(--color-danger)" }}>
                  −{fmt(rebate.dealerDiscount)}
                </span>
              </div>
            )}
            <div style={rowStyle}>
              <span style={rowLabel}>Tax + fees</span>
              <span style={{ fontFamily: mono }}>{taxFees === null ? "—" : fmt(taxFees)}</span>
            </div>
            <div style={rowStyle}>
              <span style={rowLabel}>Back-end add-ons</span>
              <span style={{ fontFamily: mono }}>{fmt(addons)}</span>
            </div>
            <div style={rowStyle}>
              <span style={rowLabel}>Down + trade + manufacturer rebate</span>
              <span style={{ fontFamily: mono, color: "var(--color-danger)" }}>
                {down >= 0 ? `−${fmt(down)}` : `+${fmt(-down)}`}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 14,
                paddingTop: 8,
                borderTop: "1px solid var(--color-border)",
              }}
            >
              <span style={{ fontWeight: 600 }}>Amount financed</span>
              <span style={{ fontFamily: mono, fontWeight: 700, color: "var(--color-primary)" }}>
                {financed === null ? "—" : fmt(financed)}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={rowLabel}>Suggested lender</span>
              <span style={{ fontWeight: 600 }}>{bestLender}</span>
            </div>
            <div style={rowStyle}>
              <span style={rowLabel}>Payment-to-income</span>
              <span style={{ fontFamily: mono, color: ptiColor }}>
                {pti !== undefined ? `${pti.toFixed(1)}%` : "—"}
              </span>
            </div>
          </div>

          <div
            style={{
              fontSize: 11.5,
              color: "var(--color-text-subtle)",
              marginTop: 14,
              lineHeight: 1.5,
            }}
          >
            Estimate only — not an offer or approval of credit. Taxes and fees estimated for the
            selected buyer state. Subject to lender verification of income, identity, and vehicle
            condition.
          </div>

          {pdfState.status !== "idle" && (
            <div
              role={pdfState.status === "error" ? "alert" : "status"}
              aria-live={pdfState.status === "error" ? "assertive" : "polite"}
              style={{
                marginTop: 14,
                border: `1px solid ${
                  pdfState.status === "error" ? "var(--color-danger)" : "var(--color-border)"
                }`,
                background:
                  pdfState.status === "error"
                    ? "var(--color-danger-subtle)"
                    : "var(--color-bg-subtle)",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {pdfState.status === "generating" && "Generating PDF"}
                {pdfState.status === "downloaded" && "PDF ready"}
                {pdfState.status === "error" && `PDF error · ${pdfState.code}`}
              </div>
              <div style={{ color: "var(--color-text-muted)", marginTop: 2 }}>
                {pdfState.message}
              </div>
              {pdfState.status === "downloaded" && pdfState.url && (
                <a
                  href={pdfState.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex",
                    marginTop: 8,
                    color: "var(--color-primary)",
                    fontWeight: 700,
                  }}
                >
                  Open PDF fallback
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "13px 22px",
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-bg-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 9,
            borderRadius: "0 0 16px 16px",
          }}
        >
          <button onClick={onClose} className="transition-colors" style={secondaryBtn}>
            Close
          </button>
          <button
            onClick={handleDownloadPdf}
            className="transition-colors"
            disabled={pdfBusy}
            style={{ ...secondaryBtn, opacity: pdfBusy ? 0.6 : 1 }}
          >
            {pdfBusy ? "Generating…" : "Download PDF"}
          </button>
          <button
            onClick={onSaveToPipeline}
            className="transition-colors"
            style={{
              background: "var(--color-primary)",
              border: "1px solid transparent",
              color: "var(--on-primary)",
              borderRadius: 8,
              padding: "8px 15px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Save to pipeline
          </button>
        </div>
      </div>
    </div>
  );
};

const DealSheetModal = React.memo(DealSheetModalBase) as React.FC<DealSheetModalProps>;
DealSheetModal.displayName = "DealSheetModal";
export default DealSheetModal;
export { DealSheetModal };
