import React from "react";
import type { DealPdfData, LenderEligibilityStatus, Settings } from "../../types";
import { formatCurrency, formatCurrencyExact, formatNumber } from "../common/TableCell";
import { InternalUseNotice } from "./InternalUseNotice";

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
const CONTINUATION_SUFFIX = "… [continued in app]";

type PrintStatus = "fit" | "pending" | "none";

/** The same three-way split the app and the Compare PDF use: a held check is not a decline. */
const printStatus = (lender: LenderEligibilityStatus): PrintStatus =>
  lender.eligible && (lender.status === undefined || lender.status === "eligible")
    ? "fit"
    : // Explicit status wins; uncheckedConstraints only for legacy entries without one.
      (
          lender.status !== undefined
            ? lender.status === "pending"
            : (lender.uncheckedConstraints?.length ?? 0) > 0
        )
      ? "pending"
      : "none";

const PRINT_STATUS_LABEL: Record<PrintStatus, string> = {
  fit: "Fit",
  pending: "Pending",
  none: "No fit",
};

const PRINT_STATUS_RANK: Record<PrintStatus, number> = { fit: 0, none: 1, pending: 2 };

const normalizePrintableText = (value: string | undefined): string =>
  (value || "").replace(/\s+/g, " ").trim();

const boundedPrintableText = (value: string | undefined, maxChars: number): string => {
  const text = normalizePrintableText(value);
  if (!text) return "—";
  if (text.length <= maxChars) return text;

  const available = Math.max(1, maxChars - CONTINUATION_SUFFIX.length - 1);
  const cut = text.slice(0, available);
  // Break at a word boundary so a cut never lands mid-word ("before usi…").
  const lastSpace = cut.lastIndexOf(" ");
  const atWord = lastSpace > available * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${atWord.trimEnd().replace(/[,;:\s-]+$/, "")} ${CONTINUATION_SUFFIX}`;
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

/* Paper uses the light tokens from index.css only — ink #111827, muted
   #4b5563 (all 9pt text, so nothing prints lighter), hairline #e5e7eb, and
   primary #4f46e5 with white on it (the mark). Status fills are the success /
   warning subtle pairs. Groups are made with rules and spacing, not boxes.
   Type: one family (Geist Sans is what the app loads; html2canvas rasterizes
   what the browser renders, so Inter is only a fallback), weights 400–700,
   tabular numerals. Scale: title 20pt, payment figure 24pt, section heading
   11pt/600, body 10pt, captions and column heads 9pt. Mono is for VIN and
   stock number only.

   Height budget (content box 259.4mm): page 1 ≈ 227mm, page 2 ≈ 227mm at
   worst-case lender rows. assertPrintablePageFits in services/pdfGenerator.ts
   throws on overflow, so re-budget before adding rows or raising sizes. */
const FONT_STACK = `"Geist Sans", Inter, ui-sans-serif, system-ui, sans-serif`;
const MONO_STACK = `"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace`;

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
    font-family: ${FONT_STACK};
    font-size: 10pt;
    font-weight: 400;
    line-height: 1.25;
    /* No tabular-nums here: html2canvas drops font-variant when it draws, so the
       browser would lay digits out at tabular widths and the canvas would paint
       proportional ones — runs then overlap the next word ("30,000mi"). */
    font-variant-numeric: normal;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    width: 215.9mm;
    height: 279.4mm;
    padding: 10mm 11mm;
    display: flex;
    flex-direction: column;
    gap: 6mm;
    overflow: hidden;
  }
  .deal-pdf-page > * {
    flex-shrink: 0;
  }
  .deal-pdf-page h1,
  .deal-pdf-page h2,
  .deal-pdf-page p { margin: 0; }
  .deal-pdf-page .mono {
    font-family: ${MONO_STACK};
  }
  .deal-pdf-page .topbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8mm;
    align-items: start;
    padding-bottom: 4mm;
    border-bottom: 1px solid #111827;
  }
  .deal-pdf-page .brand {
    display: flex;
    align-items: flex-start;
    gap: 3mm;
  }
  .deal-pdf-page .mark {
    flex-shrink: 0;
    width: 9mm;
    height: 9mm;
    border-radius: 1.5mm;
    background: #4f46e5;
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 8pt;
    font-weight: 700;
  }
  .deal-pdf-page h1 {
    font-size: 20pt;
    font-weight: 600;
    line-height: 1.15;
    letter-spacing: -0.01em;
  }
  .deal-pdf-page .subtitle {
    margin-top: 1mm;
    color: #4b5563;
  }
  .deal-pdf-page .meta {
    color: #4b5563;
    font-size: 9pt;
    line-height: 1.4;
    text-align: right;
  }
  .deal-pdf-page .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8mm;
    align-items: start;
  }
  .deal-pdf-page h2 {
    margin-bottom: 1.5mm;
    font-size: 11pt;
    font-weight: 600;
    line-height: 1.3;
  }
  .deal-pdf-page .payment-label {
    color: #4b5563;
  }
  .deal-pdf-page .payment {
    margin-top: 1mm;
    font-size: 24pt;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.01em;
  }
  .deal-pdf-page .caption {
    color: #4b5563;
    font-size: 9pt;
    line-height: 1.35;
  }
  .deal-pdf-page .caption strong {
    color: #111827;
    font-weight: 600;
  }
  .deal-pdf-page .payment + .caption {
    margin-top: 1mm;
  }
  .deal-pdf-page .metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4mm;
    margin-top: 4mm;
    padding-top: 2mm;
    border-top: 1px solid #e5e7eb;
  }
  .deal-pdf-page .metric span {
    display: block;
    color: #4b5563;
    font-size: 9pt;
  }
  .deal-pdf-page .metric strong {
    display: block;
    margin-top: 0.8mm;
    font-size: 12pt;
    font-weight: 600;
  }
  .deal-pdf-page .kv {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 4mm;
    padding: 0.8mm 0;
    border-top: 1px solid #e5e7eb;
  }
  .deal-pdf-page .kv > span {
    color: #4b5563;
  }
  .deal-pdf-page .kv > strong {
    font-weight: 500;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .deal-pdf-page table {
    width: 100%;
    border-collapse: collapse;
  }
  .deal-pdf-page td {
    padding: 0.8mm 0;
    border-top: 1px solid #e5e7eb;
    vertical-align: top;
  }
  .deal-pdf-page td:first-child {
    padding-right: 3mm;
    color: #4b5563;
  }
  .deal-pdf-page td:last-child {
    text-align: right;
    font-weight: 500;
    white-space: nowrap;
  }
  .deal-pdf-page tr.subtotal td {
    color: #111827;
    font-weight: 600;
  }
  .deal-pdf-page tr.total td {
    padding-top: 1.5mm;
    border-top-color: #111827;
    color: #111827;
    font-weight: 600;
  }
  .deal-pdf-page .structure-note {
    margin-top: 2mm;
  }
  .deal-pdf-page .lender-table {
    table-layout: fixed;
  }
  .deal-pdf-page .lender-table th {
    padding: 0 2mm 1.2mm 0;
    border-bottom: 1px solid #111827;
    color: #4b5563;
    font-size: 9pt;
    font-weight: 600;
    text-align: left;
    vertical-align: bottom;
  }
  .deal-pdf-page .lender-table td,
  .deal-pdf-page .lender-table td:first-child,
  .deal-pdf-page .lender-table td:last-child {
    padding: 1.2mm 2mm 1.2mm 0;
    border-top: 0;
    border-bottom: 1px solid #e5e7eb;
    color: #111827;
    font-weight: 400;
    text-align: left;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .deal-pdf-page .lender-table td:first-child {
    font-weight: 500;
  }
  .deal-pdf-page .lender-table .continuation-row td {
    color: #b45309;
    font-size: 9pt;
    font-weight: 600;
  }
  .deal-pdf-page .lender-table .empty-row td {
    color: #4b5563;
    font-weight: 400;
  }
  .deal-pdf-page .lender-table th:nth-child(1) { width: 20%; }
  .deal-pdf-page .lender-table th:nth-child(2) { width: 9%; }
  .deal-pdf-page .lender-table th:nth-child(3) { width: 19%; }
  .deal-pdf-page .lender-table th:nth-child(4) { width: 9%; }
  .deal-pdf-page .lender-table th:nth-child(5) { width: 11%; }
  .deal-pdf-page .lender-table th:nth-child(6) { width: 32%; }
  .deal-pdf-page .fit-badge {
    display: inline-block;
    padding: 0.2mm 1.5mm;
    border-radius: 1mm;
    background: #dcfce7;
    color: #15803d;
    font-size: 9pt;
    font-weight: 600;
    line-height: 1.3;
  }
  .deal-pdf-page .fit-badge.pending {
    background: #f3f4f6;
    color: #4b5563;
  }
  .deal-pdf-page .fit-badge.none {
    background: #fee2e2;
    color: #b91c1c;
  }
  .deal-pdf-page .notes-box {
    display: flex;
    flex-direction: column;
    height: 44mm;
    padding-top: 1.2mm;
    border-top: 1px solid #e5e7eb;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .deal-pdf-page .continuation-note {
    margin-top: auto;
    padding-top: 1mm;
    color: #b45309;
    font-size: 9pt;
    font-weight: 600;
    line-height: 1.3;
  }
  .deal-pdf-page .page-footer {
    margin-top: auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6mm;
    align-items: end;
    padding-top: 3mm;
    border-top: 1px solid #e5e7eb;
    color: #4b5563;
    font-size: 9pt;
    line-height: 1.35;
  }
  .deal-pdf-page .page-footer p + p {
    margin-top: 1.5mm;
  }
  .deal-pdf-page .page-footer strong {
    color: #111827;
    font-weight: 600;
  }
  .deal-pdf-page .page-number {
    white-space: nowrap;
  }
`;

const Mark: React.FC = () => (
  <div className="mark" role="img" aria-label="LTV Desking PRO">
    LTV
  </div>
);

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
  // Fits first, then declines (their reasons are actionable), then held
  // checks, whose boilerplate reason would otherwise crowd out the rest.
  const printableLenders = [...safeEligibility]
    .sort((a, b) => PRINT_STATUS_RANK[printStatus(a)] - PRINT_STATUS_RANK[printStatus(b)])
    .slice(0, MAX_PRINTED_LENDERS);
  const omittedLenderCount = safeEligibility.length - printableLenders.length;
  const normalizedNotes = normalizePrintableText(dealData.notes);
  const notesTruncated = normalizedNotes.length > MAX_PRINTED_NOTE_CHARS;
  const printableNotes = notesTruncated
    ? `${normalizedNotes.slice(0, MAX_PRINTED_NOTE_CHARS).trimEnd()}…`
    : normalizedNotes || "No deal notes were entered.";

  const printedOn = new Date().toLocaleDateString();
  const aprText =
    typeof dealData.interestRate === "number" ? `${dealData.interestRate.toFixed(2)}%` : "N/A";

  return (
    <>
      <style>{styles}</style>
      <div className="deal-pdf-page" data-pdf-page="1">
        <header className="topbar">
          <div className="brand">
            <Mark />
            <div>
              <h1>Deal sheet</h1>
              <p className="subtitle">Preliminary deal worksheet, not a credit offer</p>
            </div>
          </div>
          <div className="meta">
            <div>{printedOn}</div>
            <div>{dealNumber ? `Deal #${dealNumber}` : "Working deal"}</div>
            <div>{salespersonName || "Salesperson not set"}</div>
            <div>{customerName || "Walk-in customer"}</div>
          </div>
        </header>

        <section className="pair">
          <div>
            <p className="payment-label">Estimated monthly payment</p>
            <p className="payment">{money(vehicle.monthlyPayment)}</p>
            <p className="caption">
              {typeof dealData.interestRate === "number"
                ? `${dealData.loanTerm} months at ${dealData.interestRate.toFixed(2)}% APR estimate`
                : `${dealData.loanTerm} months; enter APR for payment estimate`}
            </p>
            <div className="metrics">
              <Metric label="Amount financed" value={money(vehicle.amountToFinance)} />
              <Metric label="OTD LTV" value={pct(vehicle.otdLtv)} />
              <Metric label="PTI" value={pct(vehicle.ptiRatio, 1)} />
            </div>
          </div>

          <div>
            <h2>Vehicle</h2>
            <Kv label="Unit" value={vehicle.vehicle} />
            <Kv label="Stock" value={<span className="mono">{vehicle.stock}</span>} />
            <Kv label="VIN" value={<span className="mono">{vehicle.vin}</span>} />
            <Kv label="Mileage" value={`${formatNumber(vehicle.mileage)} mi`} />
            <Kv label="Trade book" value={wholeMoney(vehicle.jdPower)} />
            <Kv label="Retail book" value={wholeMoney(vehicle.jdPowerRetail)} />
          </div>
        </section>

        <section className="pair">
          <div>
            <h2>Customer inputs</h2>
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
            <Kv label="APR estimate" value={aprText} />
          </div>

          <div>
            <h2>Structure snapshot</h2>
            <Kv label="Front-end LTV" value={pct(vehicle.frontEndLtv)} />
            <Kv label="Out-the-door LTV" value={pct(vehicle.otdLtv)} />
            <Kv label="Payment-to-income" value={pct(vehicle.ptiRatio, 1)} />
            <Kv
              label="Lender fits"
              value={`${eligibleLenders.length} of ${safeEligibility.length}`}
            />
            <Kv label="Backend total" value={money(dealData.backendProducts)} />
            <Kv label="Total credits" value={money(totalCredits)} />
          </div>
        </section>

        <section>
          <h2>Deal structure</h2>
          <div className="pair">
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
          <p className="caption structure-note">
            <strong>Structure check:</strong> The payment, amount financed, LTV, PTI, cash/trade
            credits, rebate, and each backend product above are calculated from the current desk
            values. Page 2 prints the lender screen and flags any results that continue in the app.
          </p>
        </section>

        <footer className="page-footer">
          <div>
            <InternalUseNotice />
            <p>
              Estimate only. Not a retail installment contract, Truth-in-Lending disclosure, credit
              approval, or offer of credit. Verify taxes, fees, book values, APR, term, payment, and
              product pricing before contracting.
            </p>
          </div>
          <span className="page-number">Page 1 of 2</span>
        </footer>
      </div>

      <div className="deal-pdf-page" data-pdf-page="2">
        <header className="topbar">
          <div className="brand">
            <Mark />
            <div>
              <h1>Deal detail</h1>
              <p className="subtitle">Lender screen, calculation assumptions, and deal notes</p>
            </div>
          </div>
          <div className="meta">
            <div>{printedOn}</div>
            <div>{dealNumber ? `Deal #${dealNumber}` : "Working deal"}</div>
            <div>
              Stock <span className="mono">{vehicle.stock}</span>
            </div>
            <div>{customerName || "Walk-in customer"}</div>
          </div>
        </header>

        <section>
          <h2>
            Lender screening — {eligibleLenders.length} of {safeEligibility.length} preliminary fits
          </h2>
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
                    <span className={`fit-badge ${printStatus(lender)}`}>
                      {PRINT_STATUS_LABEL[printStatus(lender)]}
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
                      90
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
                <tr className="empty-row">
                  <td colSpan={6}>No active lender profiles were available for screening.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="pair">
          <div>
            <h2>Calculation assumptions</h2>
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
          <div>
            <h2>Deal notes</h2>
            <div className="notes-box" data-pdf-bounded="notes">
              <div>{printableNotes}</div>
              {notesTruncated && (
                <div className="continuation-note">
                  Deal notes continue in the application; the PDF shows the first{" "}
                  {MAX_PRINTED_NOTE_CHARS} characters.
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="page-footer">
          <div>
            <InternalUseNotice />
            <p>
              <strong>Lender screen:</strong> Results use dealer-entered program data and the
              current deal snapshot. Final approval, rate, advance, stipulations, product
              eligibility, and funding remain lender decisions. Dealer-internal cost, gross, and
              reserve are excluded.
            </p>
            <p>
              Recheck the lender’s current rate sheet and all required documents before submission.
              Retain this worksheet with the deal jacket according to dealership policy.
            </p>
          </div>
          <span className="page-number">Page 2 of 2</span>
        </footer>
      </div>
    </>
  );
};
