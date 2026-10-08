import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDealContext } from "../../context/DealContext";
import { PdfGenerationError, generateDealPdf } from "../../services/pdfGenerator";
import { calculateFinancials } from "../../services/calculator";
import { lenderFitForVehicle } from "../../services/lenderFit";
import { scoreApprovalOdds } from "../../services/approvalScorer";
import { assessDeal, holdIncompleteFits } from "../../services/dealAssessment";
import { normalizeBackendProductFields } from "../../services/backendProducts";
import { getCurrentDealerDetails, logDealEvent } from "../../lib/api";
import { capture } from "../../lib/analytics";
import { toast } from "../../lib/toast";
import { BlobDownloadError, downloadBlob } from "../../utils/downloadBlob";
import { useFocusTrap, useKeyboardShortcuts, useRestoreFocus } from "../../hooks/useKeyboard";
import type { CalculatedVehicle, DealPdfData } from "../../types";
import { PdfTemplate } from "../pdf/PdfTemplate";

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
  return "Couldn't create the deal sheet PDF. Try again.";
};

const dealSheetFilename = (vehicle: CalculatedVehicle): string => {
  const id = vehicle.stock && vehicle.stock !== "N/A" ? vehicle.stock : vehicle.vin;
  return `Deal_Sheet_${id}.pdf`;
};

/** Live preview of the same two-page worksheet used by the PDF exporter. */
const DealSheetModalBase: React.FC<DealSheetModalProps> = ({
  vehicle,
  onClose,
  onSaveToPipeline,
}) => {
  const { settings, dealData, filters, customerName, salespersonName, safeLenderProfiles } =
    useDealContext();

  const [dealerName, setDealerName] = useState<string>("");
  const dealerDetailsRef = useRef<ReturnType<typeof getCurrentDealerDetails> | null>(null);
  const [previewPage, setPreviewPage] = useState<1 | 2>(1);
  const previewRef = useRef<HTMLDivElement>(null);
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
    const lookup = getCurrentDealerDetails().catch(() => null);
    dealerDetailsRef.current = lookup;
    lookup.then((dealer) => {
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

  const lenders = Array.isArray(safeLenderProfiles) ? safeLenderProfiles : [];
  const normalizedDealData = useMemo(
    () => ({ ...dealData, ...normalizeBackendProductFields(dealData) }),
    [dealData]
  );
  const liveVehicle = useMemo(() => {
    const calculated = calculateFinancials(vehicle, normalizedDealData, settings);
    const fit = holdIncompleteFits(
      lenderFitForVehicle(calculated, { ...normalizedDealData, ...filters }, lenders),
      filters
    );
    const approval = scoreApprovalOdds(
      calculated,
      filters,
      fit.fitCount,
      fit.pendingCount,
      fit.pendingReason
    );
    const assessment = assessDeal(calculated, normalizedDealData, filters, lenders, fit);
    return {
      ...calculated,
      approvalScore: approval.internalScore,
      approvalBand: approval.band,
      ptiRatio: approval.ptiRatio,
      fitCount: fit.fitCount,
      pendingCount: fit.pendingCount,
      pendingCause: fit.pendingCause ?? undefined,
      fitNames: fit.fitNames,
      fitEntries: fit.entries,
      assessment,
      readinessScore: assessment.readiness,
    };
  }, [filters, lenders, normalizedDealData, settings, vehicle]);
  const previewData: DealPdfData = {
    dealerName,
    vehicle: liveVehicle,
    dealData: normalizedDealData,
    customerFilters: {
      creditScore: filters.creditScore,
      monthlyIncome: filters.monthlyIncome,
      monthlyDebt: filters.monthlyDebt,
    },
    customerName,
    salespersonName,
    lenderEligibility: liveVehicle.fitEntries,
  };

  const changePreviewPage = (page: 1 | 2) => {
    setPreviewPage(page);
    previewRef.current?.scrollTo?.({ top: 0 });
  };

  const handleDownloadPdf = async () => {
    if (pdfBusy) return;
    setPdfState({ status: "generating", message: "Generating PDF…" });
    try {
      // Recalculate from the live, non-debounced inputs at click time. The
      // vehicle prop may still carry the prior 300ms scoring snapshot.
      const freshFinancials = calculateFinancials(vehicle, normalizedDealData, settings);
      const freshFit = holdIncompleteFits(
        lenderFitForVehicle(freshFinancials, { ...normalizedDealData, ...filters }, lenders),
        filters
      );
      const freshApproval = scoreApprovalOdds(
        freshFinancials,
        filters,
        freshFit.fitCount,
        freshFit.pendingCount,
        freshFit.pendingReason
      );
      const freshVehicle: CalculatedVehicle = {
        ...freshFinancials,
        approvalScore: freshApproval.internalScore,
        approvalBand: freshApproval.band,
        ptiRatio: freshApproval.ptiRatio,
        fitCount: freshFit.fitCount,
        pendingCount: freshFit.pendingCount,
        pendingCause: freshFit.pendingCause ?? undefined,
        fitNames: freshFit.fitNames,
        assessment: assessDeal(freshFinancials, normalizedDealData, filters, lenders, freshFit),
      };
      freshVehicle.readinessScore = freshVehicle.assessment?.readiness;
      const worksheetDealerName = dealerName || (await dealerDetailsRef.current)?.name || "";
      const pdfData: DealPdfData = {
        dealerName: worksheetDealerName,
        vehicle: freshVehicle,
        dealData: normalizedDealData,
        customerFilters: {
          creditScore: filters.creditScore,
          monthlyIncome: filters.monthlyIncome,
          monthlyDebt: filters.monthlyDebt,
        },
        customerName,
        salespersonName,
        lenderEligibility: freshFit.entries,
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
                message: "Download started. The open link expired — download again to reopen it.",
              }
            : current
        );
      }, PDF_FALLBACK_LIFETIME_MS);
      toast.success("Deal sheet PDF ready");
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
      toast.error(`Couldn't create the PDF (${code}). Try again.`);
    }
  };

  return createPortal(
    <div onClick={onClose} className="modal-backdrop deal-sheet-backdrop">
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Deal sheet"
        ref={dialogRef}
        tabIndex={-1}
        className="deal-sheet-modal"
      >
        <header className="deal-sheet-toolbar">
          <div>
            <div className="deal-sheet-eyebrow">DEAL DOCUMENTS</div>
            <h2>Deal sheet</h2>
          </div>
          <button onClick={onClose} className="deal-sheet-close" aria-label="Close">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <nav className="deal-sheet-pages" aria-label="Worksheet pages">
          <button aria-pressed={previewPage === 1} onClick={() => changePreviewPage(1)}>
            <span>01</span> Deal structure
          </button>
          <button aria-pressed={previewPage === 2} onClick={() => changePreviewPage(2)}>
            <span>02</span> Lender review
          </button>
          <span className="deal-sheet-page-hint">PDF includes both pages</span>
        </nav>
        <div className="deal-sheet-preview" ref={previewRef}>
          <PdfTemplate {...previewData} settings={settings} previewPage={previewPage} />
        </div>
        <footer className="deal-sheet-actions">
          {pdfState.status !== "idle" && (
            <div
              className="deal-sheet-pdf-status"
              data-error={pdfState.status === "error"}
              role={pdfState.status === "error" ? "alert" : "status"}
              aria-live={pdfState.status === "error" ? "assertive" : "polite"}
            >
              <strong>
                {pdfState.status === "generating" ? (
                  "Generating PDF"
                ) : pdfState.status === "downloaded" ? (
                  "PDF ready"
                ) : (
                  <>
                    <span>PDF error:</span> {pdfState.code}
                  </>
                )}
              </strong>
              <span>{pdfState.message}</span>
              {pdfState.status === "downloaded" && pdfState.url && (
                <a href={pdfState.url} target="_blank" rel="noreferrer">
                  Open PDF
                </a>
              )}
            </div>
          )}
          <div className="deal-sheet-footer-note">
            Letter format · 2 pages<span>Internal worksheet · Estimate only</span>
          </div>
          <div className="deal-sheet-action-buttons">
            <button onClick={onClose} className="deal-sheet-button">
              Close
            </button>
            <button
              onClick={handleDownloadPdf}
              className="deal-sheet-button deal-sheet-download"
              disabled={pdfBusy}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" />
              </svg>
              {pdfBusy ? "Generating…" : "Download PDF"}
            </button>
            <button onClick={onSaveToPipeline} className="deal-sheet-button deal-sheet-save">
              Save deal
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};

const DealSheetModal = React.memo(DealSheetModalBase) as React.FC<DealSheetModalProps>;
DealSheetModal.displayName = "DealSheetModal";
export default DealSheetModal;
export { DealSheetModal };
