import React from "react";
import type { DealPdfData, LenderEligibilityStatus, Settings } from "../../types";
import { formatCurrency, formatCurrencyExact, formatNumber } from "../common/TableCell";

const money = (value: number | string | undefined): string => formatCurrencyExact(value);
const wholeMoney = (value: number | string | undefined): string => formatCurrency(value);

const pct = (value: number | string | undefined, digits = 0): string => {
  if (value === undefined || value === null || value === "N/A" || value === "Error") return "N/A";
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : "N/A";
};

const n = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const MAX_PRINTED_LENDERS = 6;
const MAX_PRINTED_NOTE_CHARS = 220;
const CONTINUATION_SUFFIX = "... [continued in app]";

const normalizePrintableText = (value: string | undefined): string =>
  (value || "").replace(/\s+/g, " ").trim();

const boundedPrintableText = (value: string | undefined, maxChars: number): string => {
  const text = normalizePrintableText(value);
  if (!text) return "—";
  if (text.length <= maxChars) return text;

  const available = Math.max(1, maxChars - CONTINUATION_SUFFIX.length - 1);
  return `${text.slice(0, available).trimEnd()} ${CONTINUATION_SUFFIX}`;
};

const firstReason = (lender: LenderEligibilityStatus): string =>
  lender.reasons?.find(Boolean) || "Program rules need lender confirmation.";

const lenderLtvCap = (lender: LenderEligibilityStatus): string => {
  const cap = lender.matchedTier?.otdLtv ?? lender.matchedTier?.maxLtv;
  return cap === undefined ? "—" : pct(cap);
};

const lenderTerm = (lender: LenderEligibilityStatus): string => {
  const min = lender.matchedTier?.minTerm;
  const max = lender.matchedTier?.maxTerm;
  if (min !== undefined && max !== undefined) return `${min}–${max} mo`;
  if (max !== undefined) return `≤ ${max} mo`;
  if (min !== undefined) return `≥ ${min} mo`;
  return "—";
};

const styles = `
  .deal-pdf-page,
  .deal-pdf-page * {
    box-sizing: border-box;
  }
  .deal-pdf-page {
    margin: 0;
    background: #ffffff !important;
    background-clip: border-box !important;
    color: #111827;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 8.4pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    width: 215.9mm;
    height: 279.4mm;
    padding: 8mm;
    display: flex;
    flex-direction: column;
    gap: 5mm;
    overflow: hidden;
  }
  .deal-pdf-page > * {
    flex-shrink: 0;
  }
  .deal-pdf-page .topbar {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8mm;
    align-items: start;
    border-bottom: 2px solid #111827;
    padding-bottom: 4mm;
    background: #ffffff;
    color: #111827;
  }
  .deal-pdf-page .brand {
    display: flex;
    align-items: center;
    gap: 3mm;
  }
  .deal-pdf-page .mark {
    width: 10mm;
    height: 10mm;
    border-radius: 2.6mm;
    background: #34d399;
    color: #07120e;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    letter-spacing: 0;
  }
  .deal-pdf-page h1,
  .deal-pdf-page h2,
  .deal-pdf-page h3,
  .deal-pdf-page p { margin: 0; }
  .deal-pdf-page h1 {
    color: #111827;
    font-size: 16pt;
    line-height: 1.05;
    letter-spacing: 0;
  }
  .deal-pdf-page .subtitle {
    color: #4b5563;
    font-size: 8.2pt;
    margin-top: 1mm;
  }
  .deal-pdf-page .meta {
    color: #4b5563;
    font-size: 8pt;
    line-height: 1.45;
    text-align: right;
  }
  .deal-pdf-page .hero {
    display: grid;
    grid-template-columns: 1.08fr 1fr;
    gap: 4mm;
  }
  .deal-pdf-page .summary-card {
    border: 1px solid #d1d5db;
    border-radius: 3mm;
    padding: 4mm;
    background: #f8fafc;
  }
  .deal-pdf-page .payment-label {
    color: #047857;
    font-size: 8pt;
    font-weight: 800;
    letter-spacing: 0.7pt;
    text-transform: none;
  }
  .deal-pdf-page .payment {
    color: #064e3b;
    font-size: 28pt;
    font-weight: 900;
    line-height: 1;
    margin-top: 1mm;
  }
  .deal-pdf-page .payment small {
    font-size: 13pt;
  }
  .deal-pdf-page .hero-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2mm;
    margin-top: 3mm;
  }
  .deal-pdf-page .metric {
    border: 1px solid #d1d5db;
    border-radius: 2mm;
    padding: 2.3mm;
    min-height: 13mm;
    background: #ffffff;
  }
  .deal-pdf-page .metric span {
    display: block;
    color: #6b7280;
    font-size: 6.5pt;
    font-weight: 800;
    letter-spacing: 0.45pt;
    text-transform: none;
  }
  .deal-pdf-page .metric strong {
    display: block;
    color: #111827;
    font-size: 10pt;
    font-weight: 800;
    margin-top: 1mm;
  }
  .deal-pdf-page .section {
    border: 1px solid #e5e7eb;
    border-radius: 2.4mm;
    overflow: hidden;
    background: #ffffff;
  }
  .deal-pdf-page .section h2 {
    background: #f3f4f6;
    border-bottom: 1px solid #e5e7eb;
    color: #111827;
    font-size: 8.6pt;
    font-weight: 900;
    letter-spacing: 0.55pt;
    padding: 2.5mm 3mm;
    text-transform: none;
  }
  .deal-pdf-page .section-body {
    padding: 2.5mm 3mm;
  }
  .deal-pdf-page .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4mm;
  }
  .deal-pdf-page .kv {
    display: grid;
    grid-template-columns: minmax(26mm, 0.9fr) minmax(0, 1.1fr);
    gap: 2mm;
    padding: 1.05mm 0;
    border-bottom: 1px solid #f3f4f6;
  }
  .deal-pdf-page .kv:last-child { border-bottom: 0; }
  .deal-pdf-page .kv span {
    color: #6b7280;
  }
  .deal-pdf-page .kv strong {
    color: #111827;
    font-weight: 750;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .deal-pdf-page .financial-grid {
    display: grid;
    grid-template-columns: 1.05fr 0.95fr;
    gap: 4mm;
  }
  .deal-pdf-page table {
    width: 100%;
    border-collapse: collapse;
  }
  .deal-pdf-page td {
    padding: 1.25mm 0;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: top;
  }
  .deal-pdf-page td:first-child {
    color: #6b7280;
  }
  .deal-pdf-page td:last-child {
    text-align: right;
    font-weight: 750;
    color: #111827;
  }
  .deal-pdf-page tr.total td {
    border-top: 1.5px solid #111827;
    border-bottom: 0;
    padding-top: 2mm;
    font-weight: 900;
  }
  .deal-pdf-page tr.subtotal td {
    border-top: 1px solid #d1d5db;
    font-weight: 850;
  }
  .deal-pdf-page .notes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4mm;
  }
  .deal-pdf-page .callout {
    border: 1px solid #d1fae5;
    border-radius: 2.2mm;
    padding: 2.5mm 3mm;
    background: #ecfdf5;
    color: #065f46;
    line-height: 1.4;
  }
  .deal-pdf-page .fineprint {
    margin-top: auto;
    border-top: 1px solid #d1d5db;
    padding-top: 3mm;
    color: #6b7280;
    font-size: 7.1pt;
    line-height: 1.38;
  }
  .deal-pdf-page .page-footer {
    display: flex;
    justify-content: space-between;
    gap: 6mm;
  }
  .deal-pdf-page .page-footer span:last-child {
    white-space: nowrap;
  }
  .deal-pdf-page .detail-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3mm;
  }
  .deal-pdf-page .lender-table {
    table-layout: fixed;
    font-size: 7.1pt;
  }
  .deal-pdf-page .lender-table th {
    padding: 1.5mm 1.3mm;
    color: #4b5563;
    background: #f8fafc;
    border-bottom: 1px solid #d1d5db;
    font-size: 6.4pt;
    font-weight: 850;
    text-align: left;
  }
  .deal-pdf-page .lender-table td {
    padding: 1.35mm 1.3mm;
    border-bottom: 1px solid #e5e7eb;
    color: #111827;
    text-align: left;
    font-weight: 500;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .deal-pdf-page .lender-table tr:last-child td { border-bottom: 0; }
  .deal-pdf-page .lender-table .continuation-row td {
    padding: 1.1mm 1.3mm;
    background: #fffbeb;
    color: #92400e;
    font-weight: 800;
    text-align: left;
  }
  .deal-pdf-page .lender-table th:nth-child(1),
  .deal-pdf-page .lender-table td:nth-child(1) { width: 18%; }
  .deal-pdf-page .lender-table th:nth-child(2),
  .deal-pdf-page .lender-table td:nth-child(2) { width: 9%; }
  .deal-pdf-page .lender-table th:nth-child(3),
  .deal-pdf-page .lender-table td:nth-child(3) { width: 18%; }
  .deal-pdf-page .lender-table th:nth-child(4),
  .deal-pdf-page .lender-table td:nth-child(4) { width: 10%; }
  .deal-pdf-page .lender-table th:nth-child(5),
  .deal-pdf-page .lender-table td:nth-child(5) { width: 12%; }
  .deal-pdf-page .lender-table th:nth-child(6),
  .deal-pdf-page .lender-table td:nth-child(6) { width: 33%; }
  .deal-pdf-page .fit-badge {
    display: inline-block;
    min-width: 12mm;
    padding: 0.55mm 1mm;
    border-radius: 1.2mm;
    background: #d1fae5;
    color: #065f46;
    font-size: 6.2pt;
    font-weight: 900;
    text-align: center;
  }
  .deal-pdf-page .fit-badge.review {
    background: #fef3c7;
    color: #92400e;
  }
  .deal-pdf-page .notes-box {
    min-height: 25mm;
    overflow-wrap: anywhere;
    line-height: 1.45;
  }
  .deal-pdf-page .notes-text {
    color: #111827;
  }
  .deal-pdf-page .continuation-note {
    margin-top: auto;
    border-top: 1px solid #f59e0b;
    padding-top: 0.8mm;
    color: #92400e;
    font-size: 6.2pt;
    font-weight: 850;
    line-height: 1.2;
  }
  .deal-pdf-page--detail {
    gap: 3mm;
  }
  .deal-pdf-page--detail .topbar {
    padding-bottom: 3mm;
  }
  .deal-pdf-page--detail .section h2 {
    padding: 1.7mm 2.5mm;
  }
  .deal-pdf-page--detail .section-body {
    padding: 1.6mm 2.5mm;
  }
  .deal-pdf-page--detail .kv {
    padding: 0.62mm 0;
  }
  .deal-pdf-page--detail .lender-table {
    font-size: 6.45pt;
  }
  .deal-pdf-page--detail .lender-table th {
    padding: 0.8mm 1.15mm;
    font-size: 5.9pt;
  }
  .deal-pdf-page--detail .lender-table td {
    padding: 0.72mm 1.15mm;
    line-height: 1.1;
  }
  .deal-pdf-page--detail .fit-badge {
    padding: 0.3mm 0.8mm;
    font-size: 5.8pt;
  }
  .deal-pdf-page--detail .notes-box {
    display: flex;
    flex-direction: column;
    height: 23mm;
    min-height: 23mm;
    line-height: 1.3;
  }
  .deal-pdf-page--detail .callout {
    padding: 1.8mm 2.5mm;
    line-height: 1.3;
  }
  .deal-pdf-page--detail .fineprint {
    padding-top: 2mm;
  }
`;

const Kv: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="kv">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const Metric: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="metric">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const Row: React.FC<{
  label: string;
  value: React.ReactNode;
  total?: boolean;
  subtotal?: boolean;
}> = ({ label, value, total, subtotal }) => (
  <tr className={total ? "total" : subtotal ? "subtotal" : undefined}>
    <td>{label}</td>
    <td>{value}</td>
  </tr>
);

export const PdfTemplate: React.FC<DealPdfData & { settings: Settings }> = ({
  vehicle,
  dealData,
  customerFilters,
  customerName,
  salespersonName,
  lenderEligibility,
  dealNumber,
  settings,
}) => {
  const safeEligibility = Array.isArray(lenderEligibility) ? lenderEligibility : [];
  const eligibleLenders = safeEligibility.filter((lender) => lender?.eligible);

  const netTrade = n(dealData.tradeInValue) - n(dealData.tradeInPayoff);
  const rebate = n(dealData.rebate);
  const totalCredits = n(dealData.downPayment) + netTrade + rebate;
  const vscAmount = n(dealData.vscAmount);
  const gapAmount = n(dealData.gapAmount);
  const otherBackend = Math.max(0, n(dealData.backendProducts) - vscAmount - gapAmount);
  const buyerState = dealData.buyerState || settings.defaultState;
  const outOfStateTransitFee = buyerState !== "MI" ? n(settings.outOfStateTransitFee) : 0;
  const taxAndFees =
    n(vehicle.salesTax) +
    n(settings.docFee) +
    n(settings.cvrFee) +
    n(dealData.stateFees) +
    outOfStateTransitFee;
  const printableLenders = safeEligibility.slice(0, MAX_PRINTED_LENDERS);
  const omittedLenderCount = safeEligibility.length - printableLenders.length;
  const normalizedNotes = normalizePrintableText(dealData.notes);
  const notesTruncated = normalizedNotes.length > MAX_PRINTED_NOTE_CHARS;
  const printableNotes = notesTruncated
    ? `${normalizedNotes.slice(0, MAX_PRINTED_NOTE_CHARS).trimEnd()}...`
    : normalizedNotes || "No deal notes were entered.";

  return (
    <>
      <style>{styles}</style>
      <div className="deal-pdf-page" data-pdf-page="1">
        <header className="topbar">
          <div className="brand">
            <div className="mark">LTV</div>
            <div>
              <h1>Deal Sheet</h1>
              <p className="subtitle">Preliminary customer worksheet, not a credit offer</p>
            </div>
          </div>
          <div className="meta">
            <div>{new Date().toLocaleDateString()}</div>
            <div>{dealNumber ? `Deal #${dealNumber}` : "Working deal"}</div>
            <div>{salespersonName || "Salesperson not set"}</div>
            <div>{customerName || "Walk-in customer"}</div>
          </div>
        </header>

        <section className="hero">
          <div className="summary-card">
            <div className="payment-label">Estimated monthly payment</div>
            <div className="payment">{money(vehicle.monthlyPayment)}</div>
            <p className="subtitle">
              {typeof dealData.interestRate === "number"
                ? `${dealData.loanTerm} months at ${dealData.interestRate.toFixed(2)}% APR estimate`
                : `${dealData.loanTerm} months; enter APR for payment estimate`}
            </p>
            <div className="hero-grid">
              <Metric label="Amount financed" value={money(vehicle.amountToFinance)} />
              <Metric label="OTD LTV" value={pct(vehicle.otdLtv)} />
              <Metric label="PTI" value={pct(vehicle.ptiRatio, 1)} />
            </div>
          </div>

          <div className="section">
            <h2>Vehicle</h2>
            <div className="section-body">
              <Kv label="Unit" value={vehicle.vehicle} />
              <Kv label="Stock / VIN" value={`${vehicle.stock} / ${vehicle.vin}`} />
              <Kv label="Mileage" value={`${formatNumber(vehicle.mileage)} mi`} />
              <Kv label="Selling price" value={money(vehicle.price)} />
              <Kv label="Trade book" value={wholeMoney(vehicle.jdPower)} />
              <Kv label="Retail book" value={wholeMoney(vehicle.jdPowerRetail)} />
            </div>
          </div>
        </section>

        <section className="columns">
          <div className="section">
            <h2>Customer Inputs</h2>
            <div className="section-body">
              <Kv label="Customer" value={customerName || "N/A"} />
              <Kv label="FICO estimate" value={customerFilters.creditScore ?? "N/A"} />
              <Kv
                label="Gross income"
                value={
                  customerFilters.monthlyIncome
                    ? `${money(customerFilters.monthlyIncome)} / mo`
                    : "N/A"
                }
              />
              <Kv label="Buyer state" value={buyerState} />
              <Kv label="Term" value={`${dealData.loanTerm} months`} />
              <Kv
                label="APR estimate"
                value={
                  typeof dealData.interestRate === "number"
                    ? `${dealData.interestRate.toFixed(2)}%`
                    : "N/A"
                }
              />
            </div>
          </div>

          <div className="section">
            <h2>Structure Snapshot</h2>
            <div className="section-body">
              <Kv label="Front-end LTV" value={pct(vehicle.frontEndLtv)} />
              <Kv label="Out-the-door LTV" value={pct(vehicle.otdLtv)} />
              <Kv label="Payment-to-income" value={pct(vehicle.ptiRatio, 1)} />
              <Kv
                label="Lender fits"
                value={`${eligibleLenders.length}/${safeEligibility.length || 0}`}
              />
              <Kv label="Backend total" value={money(dealData.backendProducts)} />
              <Kv label="Total credits" value={money(totalCredits)} />
            </div>
          </div>
        </section>

        <section className="section">
          <h2>Deal Structure</h2>
          <div className="section-body financial-grid">
            <table>
              <tbody>
                <Row label="Selling price" value={money(vehicle.price)} />
                <Row label="Doc fee" value={`+ ${money(settings.docFee)}`} />
                <Row label="CVR fee" value={`+ ${money(settings.cvrFee)}`} />
                <Row label="State/title fees" value={`+ ${money(dealData.stateFees)}`} />
                {buyerState !== "MI" && (
                  <Row
                    label="Out-of-state transit fee"
                    value={`+ ${money(outOfStateTransitFee)}`}
                  />
                )}
                <Row label="Sales tax estimate" value={`+ ${money(vehicle.salesTax)}`} />
                <Row label="Tax + fees subtotal" value={money(taxAndFees)} subtotal />
                <Row label="Out-the-door price" value={money(vehicle.baseOutTheDoorPrice)} total />
              </tbody>
            </table>
            <table>
              <tbody>
                <Row label="Cash down" value={`- ${money(dealData.downPayment)}`} />
                <Row
                  label={netTrade >= 0 ? "Net trade credit" : "Negative equity"}
                  value={`${netTrade >= 0 ? "-" : "+"} ${money(Math.abs(netTrade))}`}
                />
                <Row label="Rebate" value={`- ${money(rebate)}`} />
                <Row label="Service contract" value={`+ ${money(vscAmount)}`} />
                <Row label="GAP coverage" value={`+ ${money(gapAmount)}`} />
                <Row label="Other backend" value={`+ ${money(otherBackend)}`} />
                <Row label="Amount financed" value={money(vehicle.amountToFinance)} total />
              </tbody>
            </table>
          </div>
        </section>

        <section className="callout">
          <strong>Structure check:</strong> The payment, amount financed, LTV, PTI, cash/trade
          credits, rebate, and each backend product above are calculated from the current desk
          values. Page 2 prints the lender screen and flags any results that continue in the app.
        </section>

        <footer className="fineprint page-footer">
          <span>
            Estimate only. Not a retail installment contract, Truth-in-Lending disclosure, credit
            approval, or offer of credit. Verify taxes, fees, book values, APR, term, payment, and
            product pricing before contracting.
          </span>
          <span>Page 1 of 2</span>
        </footer>
      </div>

      <div className="deal-pdf-page deal-pdf-page--detail" data-pdf-page="2">
        <header className="topbar">
          <div className="brand">
            <div className="mark">LTV</div>
            <div>
              <h1>Deal Detail</h1>
              <p className="subtitle">Lender paths, backend composition, and deal assumptions</p>
            </div>
          </div>
          <div className="meta">
            <div>{new Date().toLocaleDateString()}</div>
            <div>{dealNumber ? `Deal #${dealNumber}` : `Stock ${vehicle.stock}`}</div>
            <div>{customerName || "Walk-in customer"}</div>
          </div>
        </header>

        <section className="detail-grid">
          <div className="section">
            <h2>Deal Reference</h2>
            <div className="section-body">
              <Kv label="Customer" value={customerName || "N/A"} />
              <Kv label="Salesperson" value={salespersonName || "N/A"} />
              <Kv label="Stock" value={vehicle.stock} />
              <Kv label="VIN" value={vehicle.vin} />
              <Kv label="Buyer state" value={buyerState} />
            </div>
          </div>

          <div className="section">
            <h2>Current Structure</h2>
            <div className="section-body">
              <Kv label="Payment" value={money(vehicle.monthlyPayment)} />
              <Kv label="Amount financed" value={money(vehicle.amountToFinance)} />
              <Kv label="Term" value={`${dealData.loanTerm} months`} />
              <Kv
                label="APR"
                value={
                  typeof dealData.interestRate === "number"
                    ? `${dealData.interestRate.toFixed(2)}%`
                    : "N/A"
                }
              />
              <Kv
                label="OTD LTV / PTI"
                value={`${pct(vehicle.otdLtv)} / ${pct(vehicle.ptiRatio, 1)}`}
              />
            </div>
          </div>

          <div className="section">
            <h2>Backend & Credits</h2>
            <div className="section-body">
              <Kv label="Service contract" value={money(vscAmount)} />
              <Kv label="GAP coverage" value={money(gapAmount)} />
              <Kv label="Other backend" value={money(otherBackend)} />
              <Kv label="Backend total" value={money(dealData.backendProducts)} />
              <Kv label="Total credits" value={money(totalCredits)} />
            </div>
          </div>
        </section>

        <section className="section">
          <h2>
            Lender Screening — {eligibleLenders.length}/{safeEligibility.length} Preliminary Fits
          </h2>
          <div className="section-body" style={{ padding: 0 }}>
            <table className="lender-table">
              <thead>
                <tr>
                  <th>Lender</th>
                  <th>Status</th>
                  <th>Matched program</th>
                  <th>OTD cap</th>
                  <th>Term range</th>
                  <th>Screen result</th>
                </tr>
              </thead>
              <tbody>
                {printableLenders.map((lender, index) => (
                  <tr key={`${lender.name}-${index}`}>
                    <td>{boundedPrintableText(lender.name, 34)}</td>
                    <td>
                      <span className={`fit-badge${lender.eligible ? "" : " review"}`}>
                        {lender.eligible ? "Fit" : "Review"}
                      </span>
                    </td>
                    <td>{boundedPrintableText(lender.matchedTier?.name, 38)}</td>
                    <td>{lenderLtvCap(lender)}</td>
                    <td>{lenderTerm(lender)}</td>
                    <td>
                      {boundedPrintableText(
                        lender.eligible
                          ? "Current inputs pass the entered program rules."
                          : firstReason(lender),
                        105
                      )}
                    </td>
                  </tr>
                ))}
                {omittedLenderCount > 0 && (
                  <tr className="continuation-row">
                    <td colSpan={6}>
                      {omittedLenderCount} additional lender screen
                      {omittedLenderCount === 1 ? "" : "s"} continue in the application.
                    </td>
                  </tr>
                )}
                {safeEligibility.length === 0 && (
                  <tr>
                    <td colSpan={6}>No active lender profiles were available for screening.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="columns">
          <div className="section">
            <h2>Calculation Assumptions</h2>
            <div className="section-body">
              <Kv label="Doc fee" value={money(settings.docFee)} />
              <Kv label="CVR fee" value={money(settings.cvrFee)} />
              <Kv label="State/title fees" value={money(dealData.stateFees)} />
              {buyerState !== "MI" && (
                <Kv label="Out-of-state transit fee" value={money(outOfStateTransitFee)} />
              )}
              <Kv label="Sales tax estimate" value={money(vehicle.salesTax)} />
              <Kv label="Trade book" value={wholeMoney(vehicle.jdPower)} />
              <Kv label="Retail book" value={wholeMoney(vehicle.jdPowerRetail)} />
            </div>
          </div>
          <div className="section">
            <h2>Deal Notes</h2>
            <div className="section-body notes-box" data-pdf-bounded="notes">
              <div className="notes-text">{printableNotes}</div>
              {notesTruncated && (
                <div className="continuation-note">
                  Deal notes continue in the application; the PDF shows the first{" "}
                  {MAX_PRINTED_NOTE_CHARS} characters.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="callout">
          <strong>Lender screen:</strong> Results use dealer-entered program data and the current
          deal snapshot. Final approval, rate, advance, stipulations, product eligibility, and
          funding remain lender decisions. Dealer-internal cost, gross, and reserve are excluded.
        </section>

        <footer className="fineprint page-footer">
          <span>
            Recheck the lender’s current rate sheet and all required documents before submission.
            Retain this worksheet with the deal jacket according to dealership policy.
          </span>
          <span>Page 2 of 2</span>
        </footer>
      </div>
    </>
  );
};
