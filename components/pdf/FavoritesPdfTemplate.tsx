import React from "react";
import type { DealPdfData, Settings, LenderEligibilityStatus } from "../../types";
import { getRebateBreakdown, getTransactionFees } from "../../services/calculator";
import { formatCurrency, formatCurrencyExact, formatNumber } from "../common/TableCell";
import { InternalUseNotice } from "./InternalUseNotice";

/* Print styling follows PdfTemplate.tsx (the deal-sheet reference): light
   tokens only (ink #111827, muted #4b5563, hairline #e5e7eb, primary #4f46e5
   with white on it), one sans family with tabular numerals, rules and spacing
   instead of boxes, no box-shadows (they print as gray smudges), and no
   render-time font import, so PDF generation has no network dependency.

   Two constraints specific to this template:
   - Every selector is scoped under .fav-pdf. The <style> tag is live in the
     app document while the PDF renders off-screen, so bare selectors (body,
     .grid, .page, .badge) restyled the running app for the duration.
   - generateFavoritesPdf captures the whole stack as one image and slices it
     every 279.4mm (US Letter), so each .fav-page must be exactly Letter-sized
     or every page after the first drifts. Heights are budgeted to fit with
     margin: cover ≈ 113mm + 12 rows, vehicle page ≈ 237mm worst case, against
     a 259.4mm content box. */
const FONT_STACK = `"Geist Sans", Inter, ui-sans-serif, system-ui, sans-serif`;
const MONO_STACK = `"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace`;

const MAX_COVER_ROWS = 12;
const MAX_LENDER_TILES = 9;
const MAX_PENDING_LISTED = 3;
const MAX_COVER_NOTE_CHARS = 300;
const CONTINUATION_SUFFIX = "... [continued in app]";

const styles = `
  .fav-pdf,
  .fav-pdf * {
    box-sizing: border-box;
  }
  .fav-pdf {
    margin: 0;
    background: #ffffff;
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
  }
  .fav-pdf h1,
  .fav-pdf h2,
  .fav-pdf p,
  .fav-pdf ul { margin: 0; }
  .fav-pdf ul {
    padding: 0;
    list-style: none;
  }
  .fav-pdf .fav-page {
    width: 215.9mm;
    height: 279.4mm;
    padding: 10mm 11mm;
    display: flex;
    flex-direction: column;
    gap: 6mm;
    background: #ffffff;
    break-after: page;
  }
  .fav-pdf .fav-page:last-child {
    break-after: auto;
  }
  .fav-pdf .fav-page > * {
    flex-shrink: 0;
  }
  .fav-pdf .mono {
    font-family: ${MONO_STACK};
  }
  .fav-pdf .topbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8mm;
    align-items: start;
    padding-bottom: 4mm;
    border-bottom: 1px solid #111827;
  }
  .fav-pdf .brand {
    display: flex;
    align-items: flex-start;
    gap: 3mm;
    min-width: 0;
  }
  .fav-pdf .mark {
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
  .fav-pdf h1 {
    font-size: 20pt;
    font-weight: 600;
    line-height: 1.15;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  .fav-pdf .subtitle {
    margin-top: 1mm;
    color: #4b5563;
  }
  .fav-pdf .meta {
    color: #4b5563;
    font-size: 9pt;
    line-height: 1.4;
    text-align: right;
  }
  .fav-pdf h2 {
    margin-bottom: 1.5mm;
    font-size: 11pt;
    font-weight: 600;
    line-height: 1.3;
  }
  .fav-pdf .caption {
    color: #4b5563;
    font-size: 9pt;
    line-height: 1.35;
  }
  .fav-pdf .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8mm;
    align-items: start;
  }
  .fav-pdf .trio {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8mm;
    align-items: start;
  }
  .fav-pdf .kv {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 4mm;
    padding: 0.8mm 0;
    border-top: 1px solid #e5e7eb;
  }
  .fav-pdf .kv > span {
    color: #4b5563;
  }
  .fav-pdf .kv > strong {
    font-weight: 500;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .fav-pdf .payment-label {
    color: #4b5563;
  }
  .fav-pdf .payment {
    margin-top: 1mm;
    font-size: 24pt;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.01em;
  }
  .fav-pdf .payment + .caption {
    margin-top: 1mm;
  }
  .fav-pdf table {
    width: 100%;
    border-collapse: collapse;
  }
  .fav-pdf .money-table td {
    padding: 0.8mm 0;
    border-top: 1px solid #e5e7eb;
    vertical-align: top;
  }
  .fav-pdf .money-table td:first-child {
    padding-right: 3mm;
    color: #4b5563;
  }
  .fav-pdf .money-table td:last-child {
    text-align: right;
    font-weight: 500;
    white-space: nowrap;
  }
  .fav-pdf .money-table tr.total td {
    padding-top: 1.5mm;
    border-top-color: #111827;
    color: #111827;
    font-weight: 600;
  }
  .fav-pdf .fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 3mm 8mm;
  }
  .fav-pdf .field {
    padding-top: 1.5mm;
    border-top: 1px solid #e5e7eb;
  }
  .fav-pdf .field-label {
    color: #4b5563;
    font-size: 9pt;
  }
  .fav-pdf .field-value {
    margin-top: 0.5mm;
    font-size: 10.5pt;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .fav-pdf .notes {
    padding-top: 1.2mm;
    border-top: 1px solid #e5e7eb;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .fav-pdf .overview-table {
    table-layout: fixed;
  }
  .fav-pdf .overview-table th {
    padding: 0 2mm 1.2mm 0;
    border-bottom: 1px solid #111827;
    color: #4b5563;
    font-size: 9pt;
    font-weight: 600;
    text-align: left;
    vertical-align: bottom;
  }
  .fav-pdf .overview-table td {
    padding: 1.2mm 2mm 1.2mm 0;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  .fav-pdf .overview-table th:last-child,
  .fav-pdf .overview-table td:last-child {
    padding-right: 0;
  }
  .fav-pdf .overview-table .num {
    text-align: right;
    white-space: nowrap;
  }
  .fav-pdf .overview-table .vehicle-name {
    font-weight: 500;
  }
  .fav-pdf .overview-table .payment-cell {
    font-weight: 600;
  }
  .fav-pdf .overview-table .continuation-row td {
    color: #4b5563;
    font-size: 9pt;
  }
  .fav-pdf .overview-table th:nth-child(1) { width: 4%; }
  .fav-pdf .overview-table th:nth-child(2) { width: 28%; }
  .fav-pdf .overview-table th:nth-child(3) { width: 9%; }
  .fav-pdf .overview-table th:nth-child(4) { width: 9%; }
  .fav-pdf .overview-table th:nth-child(5) { width: 10%; }
  .fav-pdf .overview-table th:nth-child(6) { width: 10%; }
  .fav-pdf .overview-table th:nth-child(7) { width: 8%; }
  .fav-pdf .overview-table th:nth-child(8) { width: 8%; }
  .fav-pdf .overview-table th:nth-child(9) { width: 14%; }
  .fav-pdf .status {
    display: inline-block;
    padding: 0.2mm 1.5mm;
    border-radius: 1mm;
    font-size: 9pt;
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
  }
  .fav-pdf .status--fit {
    background: #dcfce7;
    color: #15803d;
  }
  .fav-pdf .status--pending {
    background: #f3f4f6;
    color: #4b5563;
  }
  .fav-pdf .status--none {
    background: #fee2e2;
    color: #b91c1c;
  }
  .fav-pdf .lender-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 3mm 8mm;
  }
  .fav-pdf .lender-list li {
    min-width: 0;
  }
  .fav-pdf .lender-name,
  .fav-pdf .lender-tier {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fav-pdf .lender-name {
    font-weight: 500;
  }
  .fav-pdf .lender-tier {
    margin-top: 0.5mm;
    color: #4b5563;
    font-size: 9pt;
  }
  .fav-pdf .lender-section .caption {
    margin-top: 2mm;
  }
  .fav-pdf .page-footer {
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
  .fav-pdf .page-footer p + p {
    margin-top: 1.5mm;
  }
  .fav-pdf .page-footer strong {
    color: #111827;
    font-weight: 600;
  }
  .fav-pdf .page-number {
    white-space: nowrap;
  }
`;

const isVerifiedFit = (lender: LenderEligibilityStatus | null | undefined): boolean =>
  !!lender && lender.eligible && (lender.status === undefined || lender.status === "eligible");

const isPendingCheck = (lender: LenderEligibilityStatus | null | undefined): boolean =>
  !!lender &&
  !lender.eligible &&
  (lender.status === "pending" || (lender.uncheckedConstraints?.length ?? 0) > 0);

const safeList = (eligibility: LenderEligibilityStatus[] | undefined) =>
  Array.isArray(eligibility) ? eligibility : [];

const countVerified = (eligibility: LenderEligibilityStatus[] | undefined) =>
  safeList(eligibility).filter(isVerifiedFit).length;

const countPending = (eligibility: LenderEligibilityStatus[] | undefined) =>
  safeList(eligibility).filter(isPendingCheck).length;

const pct = (value: number | string | undefined): string => {
  if (value === undefined || value === null || value === "N/A" || value === "Error") return "N/A";
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) ? `${num.toFixed(0)}%` : "N/A";
};

const boundedNotes = (value: string | undefined): string => {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (text.length <= MAX_COVER_NOTE_CHARS) return text;
  const available = MAX_COVER_NOTE_CHARS - CONTINUATION_SUFFIX.length - 1;
  return `${text.slice(0, available).trimEnd()} ${CONTINUATION_SUFFIX}`;
};

const withPeriod = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

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

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="field">
    <div className="field-label">{label}</div>
    <div className="field-value">{value}</div>
  </div>
);

const FinancialsRow: React.FC<{
  label: string;
  value: string;
  isTotal?: boolean;
}> = ({ label, value, isTotal = false }) => (
  <tr className={isTotal ? "total" : undefined}>
    <td>{label}</td>
    <td>{value}</td>
  </tr>
);

const CoverStatus: React.FC<{ verified: number; pending: number }> = ({ verified, pending }) => {
  // ✓/✗ glyphs keep the distinction on B&W laser printouts. [G69] An
  // unchecked lender is never presented as a decline (MODEL_CARD §5).
  if (verified > 0) return <span className="status status--fit">✓ Possible fit</span>;
  if (pending > 0) return <span className="status status--pending">Pending</span>;
  return <span className="status status--none">✗ No fit</span>;
};

const CoverPage: React.FC<{
  deals: DealPdfData[];
  customerName: string;
  salespersonName: string;
  creditScore: number | null;
  loanTerm: number;
  apr: number | null;
  downPayment: number;
  notes: string;
  pageCount: number;
}> = ({
  deals,
  customerName,
  salespersonName,
  creditScore,
  loanTerm,
  apr,
  downPayment,
  notes,
  pageCount,
}) => {
  const eligibleCount = deals.filter((d) => countVerified(d.lenderEligibility) > 0).length;
  const listedDeals = deals.slice(0, MAX_COVER_ROWS);
  const unlistedCount = deals.length - listedDeals.length;

  return (
    <div className="fav-page">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <div>
            <h1>Vehicle deal comparison</h1>
            <p className="subtitle">
              {`${deals.length} vehicle${deals.length === 1 ? "" : "s"} in Compare — ${eligibleCount} with possible lender fit${eligibleCount === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <div className="meta">{`Generated ${new Date().toLocaleDateString()}`}</div>
      </header>

      <section className="fields">
        <Field label="Customer" value={customerName || "—"} />
        <Field label="Salesperson" value={salespersonName || "—"} />
        <Field label="Credit score (est.)" value={creditScore ?? "—"} />
        <Field label="Down payment" value={formatCurrency(downPayment)} />
        <Field label="Loan term" value={`${loanTerm} months`} />
        {/* A cleared APR arrives as "" (typed-around via `as number`). Guard like
            every other APR site so the cover page doesn't crash the whole PDF. [G5] */}
        <Field label="APR" value={typeof apr === "number" ? `${apr.toFixed(2)}%` : "—"} />
      </section>

      {notes && (
        <section>
          <h2>Deal notes</h2>
          <p className="notes">{notes}</p>
        </section>
      )}

      <section>
        <h2>Vehicles in this report</h2>
        <table className="overview-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Vehicle</th>
              <th>Stock</th>
              <th className="num">Mileage</th>
              <th className="num">Price</th>
              <th className="num">Payment</th>
              <th className="num">OTD LTV</th>
              <th className="num">Lenders</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {listedDeals.map((deal, idx) => {
              const verified = countVerified(deal.lenderEligibility);
              return (
                <tr key={deal.vehicle?.vin || idx}>
                  <td>{String(idx + 1)}</td>
                  <td className="vehicle-name">{deal.vehicle?.vehicle || "Unknown vehicle"}</td>
                  <td className="mono">{deal.vehicle?.stock || "—"}</td>
                  <td className="num">{`${formatNumber(deal.vehicle?.mileage || 0)} mi`}</td>
                  <td className="num">{formatCurrency(deal.vehicle?.price)}</td>
                  <td className="num payment-cell">
                    {formatCurrency(deal.vehicle?.monthlyPayment)}
                  </td>
                  <td className="num">{pct(deal.vehicle?.otdLtv)}</td>
                  <td className="num">{`${verified}`}</td>
                  <td>
                    <CoverStatus
                      verified={verified}
                      pending={countPending(deal.lenderEligibility)}
                    />
                  </td>
                </tr>
              );
            })}
            {unlistedCount > 0 && (
              <tr className="continuation-row">
                <td colSpan={9}>
                  {`${unlistedCount} more vehicle${unlistedCount === 1 ? "" : "s"} continue on the following pages.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <footer className="page-footer">
        <div>
          <InternalUseNotice />
          <p>
            Each vehicle's full deal details follow on the next pages. All figures are estimates and
            subject to lender approval.
          </p>
        </div>
        <span className="page-number">{`Page 1 of ${pageCount}`}</span>
      </footer>
    </div>
  );
};

const VehiclePage: React.FC<{
  data: DealPdfData;
  settings: Settings;
  index: number;
  total: number;
}> = ({ data, settings, index, total }) => {
  const { vehicle, dealData, customerFilters, customerName, salespersonName, lenderEligibility } =
    data;
  const netTradeIn = dealData.tradeInValue - dealData.tradeInPayoff;
  const rebate = getRebateBreakdown(dealData);
  const transactionFees = getTransactionFees(dealData);
  const totalDown = dealData.downPayment + netTradeIn + rebate.manufacturerRebate;
  const safeEligibility = safeList(lenderEligibility);
  const eligibleLenders = safeEligibility.filter(isVerifiedFit);
  const pendingLenders = safeEligibility.filter(isPendingCheck);
  const unlistedPending = pendingLenders.length - MAX_PENDING_LISTED;

  return (
    <div className="fav-page">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <div>
            <h1>{vehicle?.vehicle || "Vehicle"}</h1>
            <p className="subtitle">
              {`Vehicle ${index + 1} of ${total} — ${customerName || "Customer"}`}
            </p>
          </div>
        </div>
        <div className="meta">
          <div>{new Date().toLocaleDateString()}</div>
          {salespersonName && <div>{salespersonName}</div>}
        </div>
      </header>

      <section className="trio">
        <div>
          <p className="payment-label">Estimated monthly payment</p>
          <p className="payment">{formatCurrencyExact(vehicle?.monthlyPayment)}</p>
          <p className="caption">
            {typeof dealData?.interestRate === "number"
              ? `Estimate at ${dealData.interestRate.toFixed(2)}% APR for ${dealData?.loanTerm} months — not an offer of credit`
              : "Estimate — enter a rate for payment terms; not an offer of credit"}
          </p>
        </div>
        <div>
          <h2>Vehicle details</h2>
          <Kv label="Stock #" value={<span className="mono">{vehicle?.stock}</span>} />
          <Kv label="VIN" value={<span className="mono">{vehicle?.vin}</span>} />
          <Kv label="Mileage" value={`${formatNumber(vehicle?.mileage)} mi`} />
          {/* Dealer-entered book values — never imply a licensed feed. [G26/G80] */}
          <Kv label="Book value (trade)" value={formatCurrency(vehicle?.jdPower)} />
          <Kv label="Book value (retail)" value={formatCurrency(vehicle?.jdPowerRetail)} />
        </div>
        <div>
          {/* Front-end gross is never printed: dealer-internal profit stays off
              customer paper. [G1] */}
          <h2>Deal terms</h2>
          <Kv label="Credit score (est.)" value={customerFilters?.creditScore || "N/A"} />
          <Kv label="Loan term" value={`${dealData?.loanTerm} months`} />
          {/* Blank APR arrives as "" — guard the toFixed crash. [G5] */}
          <Kv
            label="Est. interest rate"
            value={
              typeof dealData?.interestRate === "number"
                ? `${dealData.interestRate.toFixed(2)}% APR`
                : "—"
            }
          />
        </div>
      </section>

      <section>
        <h2>Financial breakdown</h2>
        <div className="pair">
          <table className="money-table">
            <tbody>
              <FinancialsRow label="Selling price" value={formatCurrencyExact(vehicle?.price)} />
              {rebate.dealerDiscount > 0 && (
                <FinancialsRow
                  label="Dealer discount / rebate"
                  value={`- ${formatCurrencyExact(rebate.dealerDiscount)}`}
                />
              )}
              <FinancialsRow label="Doc fee" value={`+ ${formatCurrencyExact(settings.docFee)}`} />
              <FinancialsRow label="CVR fee" value={`+ ${formatCurrencyExact(settings.cvrFee)}`} />
              {transactionFees > 0 && (
                <FinancialsRow
                  label="Transaction fees"
                  value={`+ ${formatCurrencyExact(transactionFees)}`}
                />
              )}
              <FinancialsRow
                label="State/title fees"
                value={`+ ${formatCurrencyExact(dealData?.stateFees)}`}
              />
              <FinancialsRow
                label="Sales tax (est.)"
                value={`+ ${formatCurrencyExact(vehicle?.salesTax)}`}
              />
              <FinancialsRow
                label="Total OTD price (est.)"
                value={formatCurrencyExact(vehicle?.baseOutTheDoorPrice)}
                isTotal
              />
            </tbody>
          </table>
          <table className="money-table">
            <tbody>
              <FinancialsRow
                label="Cash down"
                value={`- ${formatCurrencyExact(dealData?.downPayment)}`}
              />
              {/* Explicit rollover line instead of "- -$3,000". [G21] */}
              {netTradeIn >= 0 ? (
                <FinancialsRow
                  label="Net trade-in"
                  value={`- ${formatCurrencyExact(netTradeIn)}`}
                />
              ) : (
                <FinancialsRow
                  label="Negative equity (added to amount financed)"
                  value={`+ ${formatCurrencyExact(Math.abs(netTradeIn))}`}
                />
              )}
              {rebate.manufacturerRebate > 0 && (
                <FinancialsRow
                  label="Manufacturer rebate"
                  value={`- ${formatCurrencyExact(rebate.manufacturerRebate)}`}
                />
              )}
              <FinancialsRow
                label="Subtotal"
                value={formatCurrencyExact(
                  typeof vehicle?.baseOutTheDoorPrice === "number"
                    ? vehicle.baseOutTheDoorPrice - totalDown
                    : "Error"
                )}
                isTotal
              />
              <FinancialsRow
                label="Backend products"
                value={`+ ${formatCurrencyExact(dealData?.backendProducts)}`}
              />
              <FinancialsRow
                label="Total amount to finance (est.)"
                value={formatCurrencyExact(vehicle?.amountToFinance)}
                isTotal
              />
            </tbody>
          </table>
        </div>
      </section>

      <section className="lender-section">
        <h2>{`Lender fits — ${eligibleLenders.length} of ${safeEligibility.length} verified`}</h2>
        {eligibleLenders.length > 0 ? (
          <ul className="lender-list">
            {eligibleLenders.slice(0, MAX_LENDER_TILES).map((lender) => (
              <li key={lender.name}>
                <div className="lender-name">{lender.name}</div>
                <div className="lender-tier">{lender.matchedTier?.name || "Possible fit"}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No verified lender fits for this vehicle with the current borrower and vehicle
            information.
          </p>
        )}
        {eligibleLenders.length > MAX_LENDER_TILES && (
          <p className="caption">
            {`+ ${eligibleLenders.length - MAX_LENDER_TILES} more possible fits`}
          </p>
        )}
        {pendingLenders.length > 0 && (
          <p className="caption">
            {`Pending verification (${pendingLenders.length}): ${pendingLenders
              .slice(0, MAX_PENDING_LISTED)
              .map(
                (lender) =>
                  `${lender.name} — ${withPeriod(
                    lender.reasons?.[0] || "required information is incomplete"
                  )}`
              )
              .join(
                " "
              )}${unlistedPending > 0 ? ` ${unlistedPending} more in the application.` : ""}`}
          </p>
        )}
      </section>

      <footer className="page-footer">
        <div>
          <InternalUseNotice />
          <p>
            {"This worksheet is a preliminary estimate for discussion only. It is not a contract, not an " +
              "offer or extension of credit, and not a Truth-in-Lending disclosure. Lender fits are a " +
              "preliminary screen against dealer-entered program data, not credit decisions. Sample and " +
              "incomplete programs are pending and excluded from verified fit counts. All figures " +
              "are estimates; final pricing, taxes, fees, APR, and payment are subject to lender credit " +
              "approval and final contract documents. Book values are entered by the dealership."}
          </p>
        </div>
        <span className="page-number">{`Page ${index + 2} of ${total + 1}`}</span>
      </footer>
    </div>
  );
};

export const FavoritesPdfTemplate: React.FC<{ deals: DealPdfData[]; settings: Settings }> = ({
  deals,
  settings,
}) => {
  const safeDeals = Array.isArray(deals) ? deals.filter(Boolean) : [];
  if (safeDeals.length === 0) {
    return (
      <div className="fav-pdf">
        <style>{styles}</style>
        <div className="fav-page">
          <h1>No vehicles in Compare.</h1>
        </div>
      </div>
    );
  }

  const first = safeDeals[0]!;
  const customerName = first.customerName || "";
  const salespersonName = first.salespersonName || "";
  const creditScore = first.customerFilters?.creditScore ?? null;
  const loanTerm = first.dealData?.loanTerm ?? 0;
  // interestRate may be "" (cleared field, typed-around) — coerce to null, not 0,
  // so the cover page shows "—" rather than a fabricated 0% or a toFixed crash. [G5]
  const rawApr = first.dealData?.interestRate;
  const apr = typeof rawApr === "number" && Number.isFinite(rawApr) ? rawApr : null;
  const downPayment = first.dealData?.downPayment ?? 0;
  // Every compared vehicle shares one desk's deal inputs, so deal notes print once on
  // the cover rather than repeating on each vehicle page.
  const notes = boundedNotes(first.dealData?.notes);

  return (
    <div className="fav-pdf">
      <style>{styles}</style>
      <CoverPage
        deals={safeDeals}
        customerName={customerName}
        salespersonName={salespersonName}
        creditScore={creditScore}
        loanTerm={loanTerm}
        apr={apr}
        downPayment={downPayment}
        notes={notes}
        pageCount={safeDeals.length + 1}
      />
      {safeDeals.map((deal, idx) => (
        <VehiclePage
          key={deal.vehicle?.vin || idx}
          data={deal}
          settings={settings}
          index={idx}
          total={safeDeals.length}
        />
      ))}
    </div>
  );
};
