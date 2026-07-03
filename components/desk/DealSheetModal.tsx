import React, { useEffect, useState } from "react";
import { useDealContext } from "../../context/DealContext";
import { fmt, splitPay } from "../../utils/format";
import { generateDealPdf } from "../../services/pdfGenerator";
import { checkBankEligibility } from "../../services/lenderMatcher";
import { getCurrentDealerDetails, logDealEvent } from "../../lib/api";
import { toast } from "../../lib/toast";
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

/**
 * Deal sheet modal — the customer-facing summary per LTV Desking PRO.dc.html
 * lines 910-945: dealer + date eyebrow, payment hero, financial breakdown with
 * suggested lender + PTI, and the verbatim estimate disclaimer. Adds a
 * "Download PDF" action wired to the existing deal-sheet PDF path (same
 * DealPdfData shape the legacy Favorites flow built). [dc-redesign / Phase 5]
 */
export const DealSheetModal: React.FC<DealSheetModalProps> = ({
  vehicle,
  onClose,
  onSaveToPipeline,
}) => {
  const { settings, dealData, filters, customerName, salespersonName, safeLenderProfiles } =
    useDealContext();

  const [dealerName, setDealerName] = useState<string>("");
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCurrentDealerDetails().then((dealer) => {
      if (!cancelled && dealer?.name) setDealerName(dealer.name);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The modal handles its own Escape (the desk shortcut hook also closes it —
  // both firing on one press is harmless).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dateLabel = new Date()
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    .toUpperCase();

  const custName = customerName.trim() || "Walk-in customer";

  const price = numVal(vehicle.price);
  const baseOtd = numVal(vehicle.baseOutTheDoorPrice);
  const taxFees = price !== null && baseOtd !== null ? baseOtd - price : numVal(vehicle.salesTax);
  const addons = dealData.backendProducts || 0;
  const down =
    (dealData.downPayment || 0) +
    ((dealData.tradeInValue || 0) - (dealData.tradeInPayoff || 0)) +
    (dealData.rebate || 0);
  const financed = numVal(vehicle.amountToFinance);
  const payment = numVal(vehicle.monthlyPayment);
  const pay = payment !== null ? splitPay(payment) : null;

  const pti = vehicle.ptiRatio;
  const ptiColor =
    pti === undefined
      ? "var(--color-text-muted)"
      : pti <= 13
        ? "var(--color-success)"
        : pti <= 18
          ? "var(--color-warning)"
          : "var(--color-danger)";

  const bestLender = vehicle.fitNames && vehicle.fitNames.length > 0 ? vehicle.fitNames[0] : "—";

  const aprLabel =
    typeof dealData.interestRate === "number" && Number.isFinite(dealData.interestRate)
      ? `${dealData.interestRate}%`
      : "—";

  const handleDownloadPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      // Same DealPdfData shape the legacy flow built (FavoritesTable
      // preparePdfData): full lender-eligibility pass across ALL profiles.
      const pdfData: DealPdfData = {
        vehicle,
        dealData,
        customerFilters: {
          creditScore: filters.creditScore,
          monthlyIncome: filters.monthlyIncome,
        },
        customerName,
        salespersonName,
        lenderEligibility: safeLenderProfiles.map((bank) => ({
          name: bank.name,
          ...checkBankEligibility(vehicle, { ...dealData, ...filters }, bank),
        })),
      };
      const blob = await generateDealPdf(pdfData, settings);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Deal_Sheet_${vehicle.stock && vehicle.stock !== "N/A" ? vehicle.stock : vehicle.vin}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      logDealEvent("deal_sheet_generated", { vin: vehicle.vin, customerName });
    } catch (error) {
      console.error("Error generating deal sheet PDF:", error);
      toast.error("Failed to generate PDF. Please check deal data.");
    } finally {
      setPdfBusy(false);
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
        zIndex: 60,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Deal sheet"
        style={{
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: 16,
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
                letterSpacing: "0.14em",
                color: "var(--color-text-subtle)",
                textTransform: "uppercase",
              }}
            >
              {(dealerName || "—").toUpperCase()} · {dateLabel}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 3 }}>Deal sheet</div>
          </div>
          <button
            onClick={onClose}
            className="lift-btn"
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
            {vehicle.vehicle} · STK {vehicle.stock}
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
              <span
                style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}
              >
                {pay ? pay.whole : "—"}
              </span>
              <span style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text-muted)" }}>
                {pay ? pay.frac : ""}
              </span>
              <span style={{ fontSize: 13, color: "var(--color-text-subtle)", marginLeft: 6 }}>
                /mo · {dealData.loanTerm} mo · {aprLabel} APR
              </span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={rowStyle}>
              <span style={rowLabel}>Selling price</span>
              <span style={{ fontFamily: mono }}>{price === null ? "—" : fmt(price)}</span>
            </div>
            <div style={rowStyle}>
              <span style={rowLabel}>Tax + fees</span>
              <span style={{ fontFamily: mono }}>{taxFees === null ? "—" : fmt(taxFees)}</span>
            </div>
            <div style={rowStyle}>
              <span style={rowLabel}>Back-end add-ons</span>
              <span style={{ fontFamily: mono }}>{fmt(addons)}</span>
            </div>
            <div style={rowStyle}>
              <span style={rowLabel}>Down + trade + rebate</span>
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
          <button onClick={onClose} className="lift-btn" style={secondaryBtn}>
            Close
          </button>
          <button
            onClick={handleDownloadPdf}
            className="lift-btn"
            disabled={pdfBusy}
            style={{ ...secondaryBtn, opacity: pdfBusy ? 0.6 : 1 }}
          >
            {pdfBusy ? "Generating…" : "Download PDF"}
          </button>
          <button
            onClick={onSaveToPipeline}
            className="lift-btn"
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

export default DealSheetModal;
