import React from "react";
import type { DealPdfData, LenderEligibilityStatus, Settings } from "../../types";
import { formatCurrencyExact, formatNumber } from "../common/TableCell";
import { getRebateBreakdown, getTransactionFees, roundCents } from "../../services/calculator";
import { getBackendProductSplit } from "../../services/backendProducts";
import { InternalUseNotice } from "./InternalUseNotice";

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const n = (value: unknown): number => finite(value) ?? 0;
const money = (value: unknown): string =>
  finite(value) === null ? "—" : formatCurrencyExact(value as number);
const change = (value: number): string =>
  value === 0 ? money(0) : `${value < 0 ? "−" : "+"} ${money(Math.abs(value))}`;
const pct = (value: unknown, digits = 0): string =>
  finite(value) === null ? "—" : `${(value as number).toFixed(digits)}%`;

const MAX_PRINTED_LENDERS = 6;
const MAX_PRINTED_NOTE_CHARS = 220;
const CONTINUATION_SUFFIX = "… [continued in app]";
type PrintStatus = "fit" | "pending" | "none";
const printStatus = (lender: LenderEligibilityStatus): PrintStatus =>
  lender.eligible && (lender.status === undefined || lender.status === "eligible")
    ? "fit"
    : (
          lender.status !== undefined
            ? lender.status === "pending"
            : (lender.uncheckedConstraints?.length ?? 0) > 0
        )
      ? "pending"
      : "none";
const PRINT_STATUS_LABEL = { fit: "Fit", pending: "Pending", none: "No fit" };
const PRINT_STATUS_RANK = { fit: 0, none: 1, pending: 2 };
const normalizePrintableText = (value: string | undefined): string =>
  (value || "").replace(/\s+/g, " ").trim();
const boundedPrintableText = (value: string | undefined, maxChars: number): string => {
  const text = normalizePrintableText(value);
  if (!text) return "—";
  if (text.length <= maxChars) return text;
  const available = Math.max(1, maxChars - CONTINUATION_SUFFIX.length - 1);
  const cut = text.slice(0, available);
  const lastSpace = cut.lastIndexOf(" ");
  const atWord = lastSpace > available * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${atWord.trimEnd().replace(/[,;:\s-]+$/, "")} ${CONTINUATION_SUFFIX}`;
};
const lenderTerm = (lender: LenderEligibilityStatus): string => {
  const { minTerm: min, maxTerm: max } = lender.matchedTier ?? {};
  if (min !== undefined && max !== undefined) return `${min}–${max} mo`;
  if (max !== undefined) return `≤ ${max} mo`;
  if (min !== undefined) return `≥ ${min} mo`;
  return "—";
};

// Screen preview and exported paper use this same document. Keep every selector
// scoped: PDF rendering mounts the style tag in the live app. Normal numerals
// avoid html2canvas's font-variant layout/painting mismatch.
const styles = `
.deal-pdf-page, .deal-pdf-page * { box-sizing: border-box; }
.deal-pdf-page {
  width: 215.9mm; height: 279.4mm; padding: 8mm 11mm;
  background: #ffffff !important; color: #13283e;
  font-family: "Geist Sans", Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 9.5pt; line-height: 1.3; font-variant-numeric: normal;
  display: flex; flex-direction: column; gap: 4mm; overflow: hidden;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.deal-pdf-page > * { flex-shrink: 0; }
.deal-pdf-page h1, .deal-pdf-page h2, .deal-pdf-page p { margin: 0; }
.deal-pdf-page .mono { font-family: "Geist Mono", ui-monospace, Menlo, monospace; }
.deal-pdf-page .topbar {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 6mm; border-bottom: 3px solid #17344f; padding-bottom: 4mm;
}
.deal-pdf-page .dealer-name { font-size: 11pt; font-weight: 700; color: #315a7f; margin-bottom: 1.5mm; overflow-wrap: anywhere; }
.deal-pdf-page h1 { font-size: 23pt; font-weight: 700; line-height: 1.15; letter-spacing: -.02em; }
.deal-pdf-page .subtitle { font-size: 9pt; color: #465c70; margin-top: 1.5mm; }
.deal-pdf-page .meta { text-align: right; color: #465c70; font-size: 9pt; line-height: 1.6; flex-shrink: 0; }
.deal-pdf-page .document-tag { background: #edf2f6; color: #17344f; font-size: 8pt; font-weight: 700; padding: 1mm 2mm; margin-bottom: 1mm; display: inline-block; letter-spacing: .06em; }
.deal-pdf-page .customer-strip { display: grid; grid-template-columns: 1.4fr 1fr auto; gap: 4mm; }
.deal-pdf-page .field span { display: block; color: #465c70; font-size: 8.5pt; margin-bottom: .8mm; }
.deal-pdf-page .field strong { font-weight: 600; font-size: 10pt; overflow-wrap: anywhere; }
.deal-pdf-page .vehicle-strip { background: #edf2f6; border-left: 3px solid #315a7f; padding: 3mm 4mm; }
.deal-pdf-page .vehicle-strip h2 { font-size: 14pt; font-weight: 700; margin-bottom: 2mm; line-height: 1.2; }
.deal-pdf-page .vehicle-meta { display: flex; flex-wrap: wrap; gap: 2mm 6mm; font-size: 9pt; color: #465c70; }
.deal-pdf-page .vehicle-meta strong { color: #13283e; font-weight: 500; }
.deal-pdf-page .payment-band { display: grid; grid-template-columns: 1.25fr 1fr 1fr; padding: 3.5mm 0; border-bottom: 1px solid #c7d2dd; gap: 5mm; align-items: center; }
.deal-pdf-page .payment-label { font-size: 9pt; color: #465c70; }
.deal-pdf-page .payment { font-size: 29pt; font-weight: 700; line-height: 1.2; letter-spacing: -.02em; }
.deal-pdf-page .payment small { font-size: 10pt; font-weight: 500; color: #465c70; }
.deal-pdf-page .loan-terms { display: flex; gap: 4mm; }
.deal-pdf-page .loan-terms strong { font-size: 14pt; }
.deal-pdf-page .financed-figure { font-size: 19pt; font-weight: 700; color: #17344f; margin-top: 1mm; }
.deal-pdf-page .pair { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 7mm; align-items: start; }
.deal-pdf-page h2.section-title { display: flex; align-items: center; gap: 2mm; font-size: 11pt; font-weight: 700; padding-bottom: 2mm; border-bottom: 2px solid #17344f; margin-bottom: 1mm; }
.deal-pdf-page .section-index { font-size: 8pt; color: #315a7f; font-weight: 700; }
.deal-pdf-page table { width: 100%; border-collapse: collapse; }
.deal-pdf-page td { padding: .8mm 0 2mm; border-bottom: 1px solid #c7d2dd; vertical-align: top; }
.deal-pdf-page td:first-child { padding-right: 2mm; color: #465c70; }
.deal-pdf-page td:last-child { text-align: right; font-weight: 500; white-space: nowrap; }
.deal-pdf-page tr.subtotal td { color: #13283e; font-weight: 600; }
.deal-pdf-page tr.total td { border-top: 2px solid #17344f; border-bottom: 0; background: #edf2f6; color: #17344f; font-weight: 700; padding: 2mm; }
.deal-pdf-page .caption { font-size: 8.5pt; line-height: 1.45; color: #465c70; margin-top: 2mm; }
.deal-pdf-page .kv { display: flex; justify-content: space-between; gap: 4mm; padding: .8mm 0 2mm; border-bottom: 1px solid #c7d2dd; }
.deal-pdf-page .kv span { color: #465c70; }
.deal-pdf-page .kv strong { font-weight: 600; text-align: right; }
.deal-pdf-page .lender-table { table-layout: fixed; font-size: 9pt; }
.deal-pdf-page .lender-table th { padding: 2mm 1.5mm; color: #17344f; background: #edf2f6; text-align: left; font-size: 8pt; font-weight: 700; }
.deal-pdf-page .lender-table td, .deal-pdf-page .lender-table td:first-child, .deal-pdf-page .lender-table td:last-child { padding: 2mm 1.5mm; text-align: left; color: #13283e; font-weight: 400; white-space: normal; overflow-wrap: anywhere; }
.deal-pdf-page .lender-table td:first-child { font-weight: 600; }
.deal-pdf-page .lender-table th:nth-child(1) { width: 20%; }
.deal-pdf-page .lender-table th:nth-child(2) { width: 10%; }
.deal-pdf-page .lender-table th:nth-child(3) { width: 19%; }
.deal-pdf-page .lender-table th:nth-child(4) { width: 9%; }
.deal-pdf-page .lender-table th:nth-child(5) { width: 11%; }
.deal-pdf-page .lender-table th:nth-child(6) { width: 31%; }
.deal-pdf-page .fit-badge { display: inline-block; padding: .4mm 1mm; border-radius: 1mm; background: #dcfce7; color: #15803d; font-size: 8pt; font-weight: 700; }
.deal-pdf-page .fit-badge.pending { background: #edf2f6; color: #465c70; }
.deal-pdf-page .fit-badge.none { background: #fee2e2; color: #b91c1c; }
.deal-pdf-page .lender-table .continuation-row td { color: #b45309; font-size: 8.5pt; font-weight: 600; }
.deal-pdf-page .notes-box { min-height: 18mm; padding: 2mm 0; overflow-wrap: anywhere; }
.deal-pdf-page .continuation-note { margin-top: 2mm; color: #b45309; font-size: 8.5pt; font-weight: 600; }
.deal-pdf-page .page-footer { margin-top: auto; border-top: 1px solid #c7d2dd; padding-top: 3mm; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 4mm; align-items: end; color: #465c70; font-size: 8pt; line-height: 1.4; }
.deal-pdf-page .page-footer p + p { margin-top: 1.5mm; }
.deal-pdf-page .page-footer strong { color: #13283e; }
.deal-pdf-page .page-number { white-space: nowrap; }
.deal-pdf-page.review-page { gap: 3mm; font-size: 9.5pt; }
.deal-pdf-page.review-page h1 { font-size: 20pt; }
.deal-pdf-page.review-page .lender-table td { padding-top: .6mm; padding-bottom: 2mm; }
.deal-pdf-page.review-page .kv { padding: .6mm 0 1.6mm; }
.deal-pdf-page.review-page .notes-box { min-height: 12mm; }
.deal-pdf-page .review-context { color: #465c70; font-size: 9pt; overflow-wrap: anywhere; }

`;

const Kv: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="kv">
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
const SectionTitle: React.FC<{ index: string; children: React.ReactNode }> = ({
  index,
  children,
}) => (
  <h2 className="section-title">
    <span className="section-index">{index}</span> {children}
  </h2>
);

export const PdfTemplate: React.FC<DealPdfData & { settings: Settings; previewPage?: 1 | 2 }> = ({
  vehicle,
  dealData,
  customerFilters,
  customerName,
  salespersonName,
  dealerName,
  lenderEligibility,
  dealNumber,
  settings,
  previewPage,
}) => {
  const safeEligibility = Array.isArray(lenderEligibility) ? lenderEligibility : [];
  const eligibleLenders = safeEligibility.filter((lender) => printStatus(lender) === "fit");
  const pendingLenders = safeEligibility.filter((lender) => printStatus(lender) === "pending");
  const netTrade = roundCents(n(dealData.tradeInValue) - n(dealData.tradeInPayoff));
  const rebate = getRebateBreakdown(dealData);
  const appliedDiscount = Math.min(Math.max(0, n(vehicle.price)), rebate.dealerDiscount);
  const netPrice = Math.max(0, n(vehicle.price) - appliedDiscount);
  const products = getBackendProductSplit(dealData);
  const transactionFees = getTransactionFees(dealData);
  const buyerState = dealData.buyerState || settings.defaultState;
  const transitFee = buyerState !== "MI" ? n(settings.outOfStateTransitFee) : 0;
  const taxAndFees =
    finite(vehicle.salesTax) === null
      ? null
      : roundCents(
          n(vehicle.salesTax) +
            Math.max(0, n(settings.docFee)) +
            Math.max(0, n(settings.cvrFee)) +
            n(dealData.stateFees) +
            transitFee +
            transactionFees
        );
  const otd = finite(vehicle.baseOutTheDoorPrice);
  const financed = finite(vehicle.amountToFinance);
  const term =
    finite(dealData.loanTerm) !== null && dealData.loanTerm >= 1
      ? Math.floor(dealData.loanTerm)
      : null;
  const payment = finite(vehicle.monthlyPayment);
  const payments = payment !== null && term !== null ? roundCents(payment * term) : null;
  const interest =
    payments !== null && financed !== null
      ? roundCents(Math.max(0, payments - Math.max(0, financed)))
      : null;
  const pti =
    payment !== null && n(customerFilters.monthlyIncome) > 0
      ? (payment / n(customerFilters.monthlyIncome)) * 100
      : null;
  const dti =
    pti !== null &&
    finite(customerFilters.monthlyDebt) !== null &&
    n(customerFilters.monthlyDebt) >= 0
      ? ((n(customerFilters.monthlyDebt) + n(payment)) / n(customerFilters.monthlyIncome)) * 100
      : null;
  const printableLenders = [...safeEligibility]
    .sort((a, b) => PRINT_STATUS_RANK[printStatus(a)] - PRINT_STATUS_RANK[printStatus(b)])
    .slice(0, MAX_PRINTED_LENDERS);
  const omittedLenderCount = safeEligibility.length - printableLenders.length;
  const normalizedNotes = normalizePrintableText(dealData.notes);
  const notesTruncated = normalizedNotes.length > MAX_PRINTED_NOTE_CHARS;
  const printableNotes = notesTruncated
    ? `${normalizedNotes.slice(0, MAX_PRINTED_NOTE_CHARS).trimEnd()}…`
    : normalizedNotes || "No deal notes were entered.";
  const printedOn = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const header = (detail: boolean) => (
    <header className="topbar">
      <div>
        <p className="dealer-name">{dealerName || "LTV Desking PRO"}</p>
        <h1>{detail ? "Lender review" : "Deal worksheet"}</h1>
        <p className="subtitle">
          {detail
            ? "Program checks and supporting deal inputs"
            : "Preliminary deal worksheet, not a credit offer"}
        </p>
      </div>
      <div className="meta">
        <div className="document-tag">INTERNAL WORKSHEET</div>
        <div>{printedOn}</div>
        <div>{dealNumber ? `Deal #${dealNumber}` : "Working deal"}</div>
      </div>
    </header>
  );
  const customerStrip = (
    <div className="customer-strip">
      <div className="field">
        <span>Prepared for</span>
        <strong>{customerName?.trim() || "Walk-in customer"}</strong>
      </div>
      <div className="field">
        <span>Prepared by</span>
        <strong>{salespersonName?.trim() || "Salesperson not set"}</strong>
      </div>
      <div className="field">
        <span>Buyer state</span>
        <strong>{buyerState}</strong>
      </div>
    </div>
  );
  const vehicleStrip = (
    <section className="vehicle-strip" aria-label="Selected vehicle">
      <h2>{vehicle.vehicle}</h2>
      <div className="vehicle-meta">
        <span>
          Stock <strong className="mono">{vehicle.stock}</strong>
        </span>
        <span>
          VIN <strong className="mono">{vehicle.vin}</strong>
        </span>
        <span>
          Mileage <strong>{formatNumber(vehicle.mileage)} mi</strong>
        </span>
      </div>
    </section>
  );
  return (
    <>
      <style>{styles}</style>
      {(!previewPage || previewPage === 1) && (
        <div className="deal-pdf-page" data-pdf-page="1">
          {header(false)}
          {customerStrip}
          {vehicleStrip}
          <section className="payment-band" aria-label="Financing estimate">
            <div>
              <p className="payment-label">Estimated monthly payment</p>
              <p className="payment">
                {money(payment)} <small>/mo</small>
              </p>
            </div>
            <div className="loan-terms">
              <div className="field">
                <span>Term</span>
                <strong>{term === null ? "—" : `${term} mo`}</strong>
              </div>
              <div className="field">
                <span>Interest rate</span>
                <strong>{pct(dealData.interestRate, 2)}</strong>
              </div>
            </div>
            <div>
              <p className="payment-label">Amount financed</p>
              <p className="financed-figure">{money(financed)}</p>
            </div>
          </section>
          <div className="pair">
            <section>
              <SectionTitle index="01">Vehicle pricing & fees</SectionTitle>
              <table aria-label="Vehicle pricing and fees">
                <tbody>
                  <Row label="Vehicle price" value={money(vehicle.price)} />
                  {appliedDiscount > 0 && (
                    <Row label="Dealer discount" value={change(-appliedDiscount)} />
                  )}
                  {appliedDiscount > 0 && (
                    <Row label="Net selling price" value={money(netPrice)} subtotal />
                  )}
                  <Row label="Documentation fee" value={change(Math.max(0, n(settings.docFee)))} />
                  <Row label="CVR fee" value={change(Math.max(0, n(settings.cvrFee)))} />
                  {transactionFees > 0 && (
                    <Row label="Transaction fees" value={change(transactionFees)} />
                  )}
                  <Row label="State/title fees" value={change(n(dealData.stateFees))} />
                  {buyerState !== "MI" && (
                    <Row label="Out-of-state transit fee" value={change(transitFee)} />
                  )}
                  <Row
                    label="Sales tax estimate"
                    value={finite(vehicle.salesTax) === null ? "—" : change(n(vehicle.salesTax))}
                  />
                  <Row label="Tax + fees subtotal" value={money(taxAndFees)} subtotal />
                  <Row label="Out-the-door price" value={money(otd)} total />
                </tbody>
              </table>
              <p className="caption">
                Before optional products, cash down, trade equity and manufacturer rebates.
              </p>
            </section>
            <section>
              <SectionTitle index="02">Financing breakdown</SectionTitle>
              <table aria-label="Financing breakdown">
                <tbody>
                  <Row label="Out-the-door price" value={money(otd)} />
                  <Row label="Service contract" value={change(products.vscAmount)} />
                  <Row label="GAP coverage" value={change(products.gapAmount)} />
                  <Row label="Other optional products" value={change(products.otherBackend)} />
                  <Row
                    label="Total with products"
                    value={money(otd === null ? null : roundCents(otd + products.total))}
                    subtotal
                  />
                  <Row label="Cash down" value={change(-n(dealData.downPayment))} />
                  <Row
                    label={netTrade < 0 ? "Negative trade equity" : "Net trade credit"}
                    value={change(-netTrade)}
                  />
                  <Row label="Manufacturer rebate" value={change(-rebate.manufacturerRebate)} />
                  <Row label="Amount financed" value={money(financed)} total />
                </tbody>
              </table>
              <p className="caption">
                Optional products reflect the current selection. A positive trade payoff balance
                increases the amount financed.
              </p>
            </section>
          </div>
          <div className="pair">
            <section>
              <SectionTitle index="03">Trade equity</SectionTitle>
              <Kv label="Trade allowance" value={money(n(dealData.tradeInValue))} />
              <Kv label="Less trade payoff" value={money(n(dealData.tradeInPayoff))} />
              <Kv
                label={netTrade < 0 ? "Negative equity added" : "Net credit applied"}
                value={money(Math.abs(netTrade))}
              />
            </section>
            <section>
              <SectionTitle index="04">Loan estimate</SectionTitle>
              <Kv label="Total loan payments" value={money(payments)} />
              <Kv label="Estimated loan interest" value={money(interest)} />
              <p className="caption">
                Monthly estimate × {term ?? "entered"} months. Excludes cash down; final payment may
                vary with rounding.{" "}
                {financed !== null && financed < 0
                  ? "Credits exceed the purchase total; no loan payment is required."
                  : "Final terms require lender confirmation."}
              </p>
            </section>
          </div>
          <footer className="page-footer">
            <div>
              <InternalUseNotice />
              <p>
                Equal monthly estimate at the entered nominal rate. Not a retail installment
                contract or Truth-in-Lending disclosure; not credit approval or an offer of credit.
                Verify taxes, fees, disclosure APR, term, payment and product pricing before
                contracting.
              </p>
            </div>
            <span className="page-number">Page 1 of 2</span>
          </footer>
        </div>
      )}
      {(!previewPage || previewPage === 2) && (
        <div className="deal-pdf-page review-page" data-pdf-page="2">
          {header(true)}
          <p className="review-context">
            {customerName?.trim() || "Walk-in customer"} · Stock{" "}
            <span className="mono">{vehicle.stock}</span> · VIN{" "}
            <span className="mono">{vehicle.vin}</span>
          </p>
          <section>
            <SectionTitle index="05">
              Lender screening — {eligibleLenders.length} of {safeEligibility.length} preliminary
              fits
            </SectionTitle>
            <p className="caption" style={{ margin: "0 0 3mm" }}>
              {eligibleLenders.length} fit · {pendingLenders.length} pending ·{" "}
              {safeEligibility.length - eligibleLenders.length - pendingLenders.length} no fit. Fits
              pass entered rules; they do not confirm credit approval or a quoted rate.
            </p>
            <table className="lender-table" aria-label="Lender screening">
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
                    <td data-label="Matched program">
                      {boundedPrintableText(lender.matchedTier?.name, 38)}
                    </td>
                    <td data-label="OTD cap">
                      {pct(lender.matchedTier?.otdLtv ?? lender.matchedTier?.maxLtv)}
                    </td>
                    <td data-label="Term range">{lenderTerm(lender)}</td>
                    <td data-label="Screen result">
                      {boundedPrintableText(
                        printStatus(lender) === "fit"
                          ? "Current inputs pass the entered program rules."
                          : lender.reasons?.find(Boolean) ||
                              "Program rules need lender confirmation.",
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
                  <tr>
                    <td colSpan={6}>No active lender profiles were available for screening.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          <div className="pair">
            <section>
              <SectionTitle index="06">Customer & affordability</SectionTitle>
              <Kv label="FICO estimate" value={customerFilters.creditScore ?? "—"} />
              <Kv label="Gross income / mo" value={money(customerFilters.monthlyIncome)} />
              <Kv label="Other debt / mo" value={money(customerFilters.monthlyDebt)} />
              <Kv label="Payment-to-income" value={pct(pti, 1)} />
              <Kv label="Debt-to-income" value={pct(dti, 1)} />
            </section>
            <section>
              <SectionTitle index="07">Advance & book values</SectionTitle>
              <Kv label="Front-end LTV" value={pct(vehicle.frontEndLtv)} />
              <Kv label="Out-the-door LTV" value={pct(vehicle.otdLtv)} />
              <Kv label="Trade book" value={money(vehicle.jdPower)} />
              <Kv label="Retail book" value={money(vehicle.jdPowerRetail)} />
            </section>
          </div>
          <section>
            <SectionTitle index="08">Deal notes</SectionTitle>
            <div className="notes-box" data-pdf-bounded="notes">
              <div>{printableNotes}</div>
              {notesTruncated && (
                <div className="continuation-note">
                  Deal notes continue in the application; first {MAX_PRINTED_NOTE_CHARS} characters
                  shown.
                </div>
              )}
            </div>
          </section>
          <footer className="page-footer">
            <div>
              <InternalUseNotice />
              <p>
                <strong>Lender screen:</strong> Final approval, rate, advance, stipulations, product
                eligibility, and funding remain lender decisions. Dealer-internal cost, gross, and
                reserve are excluded.
              </p>
              <p>
                Recheck the lender’s current rate sheet and all required documents before
                submission. Retain this worksheet with the deal jacket according to dealership
                policy.
              </p>
            </div>
            <span className="page-number">Page 2 of 2</span>
          </footer>
        </div>
      )}
    </>
  );
};
