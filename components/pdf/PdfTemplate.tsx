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

const firstReason = (lender: LenderEligibilityStatus): string =>
  lender.reasons?.find(Boolean) || "Program rules need lender confirmation.";

const styles = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #ffffff;
    color: #111827;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 8.4pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 215.9mm;
    height: 279.4mm;
    padding: 8mm;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    gap: 5mm;
  }
  .topbar {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8mm;
    align-items: start;
    border-bottom: 2px solid #111827;
    padding-bottom: 4mm;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 3mm;
  }
  .mark {
    width: 10mm;
    height: 10mm;
    border-radius: 2.6mm;
    background: #34d399;
    color: #07120e;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    letter-spacing: -0.8pt;
  }
  h1, h2, h3, p { margin: 0; }
  h1 {
    font-size: 16pt;
    line-height: 1.05;
    letter-spacing: -0.35pt;
  }
  .subtitle {
    color: #4b5563;
    font-size: 8.2pt;
    margin-top: 1mm;
  }
  .meta {
    color: #4b5563;
    font-size: 8pt;
    line-height: 1.45;
    text-align: right;
  }
  .hero {
    display: grid;
    grid-template-columns: 1.08fr 1fr;
    gap: 4mm;
  }
  .summary-card {
    border: 1px solid #d1d5db;
    border-radius: 3mm;
    padding: 4mm;
    background: #f8fafc;
  }
  .payment-label {
    color: #047857;
    font-size: 8pt;
    font-weight: 800;
    letter-spacing: 0.7pt;
    text-transform: none;
  }
  .payment {
    color: #064e3b;
    font-size: 28pt;
    font-weight: 900;
    line-height: 1;
    margin-top: 1mm;
  }
  .payment small {
    font-size: 13pt;
  }
  .hero-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2mm;
    margin-top: 3mm;
  }
  .metric {
    border: 1px solid #d1d5db;
    border-radius: 2mm;
    padding: 2.3mm;
    min-height: 13mm;
    background: #ffffff;
  }
  .metric span {
    display: block;
    color: #6b7280;
    font-size: 6.5pt;
    font-weight: 800;
    letter-spacing: 0.45pt;
    text-transform: none;
  }
  .metric strong {
    display: block;
    color: #111827;
    font-size: 10pt;
    font-weight: 800;
    margin-top: 1mm;
  }
  .section {
    border: 1px solid #e5e7eb;
    border-radius: 2.4mm;
    overflow: hidden;
    background: #ffffff;
  }
  .section h2 {
    background: #f3f4f6;
    border-bottom: 1px solid #e5e7eb;
    color: #111827;
    font-size: 8.6pt;
    font-weight: 900;
    letter-spacing: 0.55pt;
    padding: 2.5mm 3mm;
    text-transform: none;
  }
  .section-body {
    padding: 2.5mm 3mm;
  }
  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4mm;
  }
  .kv {
    display: grid;
    grid-template-columns: minmax(26mm, 0.9fr) minmax(0, 1.1fr);
    gap: 2mm;
    padding: 1.05mm 0;
    border-bottom: 1px solid #f3f4f6;
  }
  .kv:last-child { border-bottom: 0; }
  .kv span {
    color: #6b7280;
  }
  .kv strong {
    color: #111827;
    font-weight: 750;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .financial-grid {
    display: grid;
    grid-template-columns: 1.05fr 0.95fr;
    gap: 4mm;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  td {
    padding: 1.25mm 0;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: top;
  }
  td:first-child {
    color: #6b7280;
  }
  td:last-child {
    text-align: right;
    font-weight: 750;
    color: #111827;
  }
  tr.total td {
    border-top: 1.5px solid #111827;
    border-bottom: 0;
    padding-top: 2mm;
    font-weight: 900;
  }
  tr.subtotal td {
    border-top: 1px solid #d1d5db;
    font-weight: 850;
  }
  .lender-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4mm;
  }
  .lender-list {
    display: flex;
    flex-direction: column;
    gap: 1.5mm;
  }
  .lender-row {
    border: 1px solid #e5e7eb;
    border-left: 3px solid #34d399;
    border-radius: 1.8mm;
    padding: 2mm;
    background: #f9fafb;
    min-height: 12mm;
    max-height: 16mm;
    overflow: hidden;
  }
  .lender-row.miss {
    border-left-color: #f59e0b;
  }
  .lender-row strong {
    display: block;
    font-size: 8pt;
  }
  .lender-row span {
    display: -webkit-box;
    color: #6b7280;
    font-size: 7.2pt;
    margin-top: 0.7mm;
    line-height: 1.25;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .notes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4mm;
  }
  .callout {
    border: 1px solid #d1fae5;
    border-radius: 2.2mm;
    padding: 2.5mm 3mm;
    background: #ecfdf5;
    color: #065f46;
    line-height: 1.4;
  }
  .fineprint {
    margin-top: auto;
    border-top: 1px solid #d1d5db;
    padding-top: 3mm;
    color: #6b7280;
    font-size: 7.1pt;
    line-height: 1.38;
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

const LenderRow: React.FC<{ lender: LenderEligibilityStatus; miss?: boolean }> = ({
  lender,
  miss,
}) => (
  <div className={`lender-row${miss ? " miss" : ""}`}>
    <strong>{lender.name}</strong>
    <span>{miss ? firstReason(lender) : lender.matchedTier?.name || "Possible fit"}</span>
  </div>
);

export const PdfTemplate: React.FC<DealPdfData & { settings: Settings }> = ({
  vehicle,
  dealData,
  customerFilters,
  customerName,
  salespersonName,
  lenderEligibility,
  settings,
}) => {
  const safeEligibility = Array.isArray(lenderEligibility) ? lenderEligibility : [];
  const eligibleLenders = safeEligibility.filter((lender) => lender?.eligible);
  const missedLenders = safeEligibility.filter((lender) => lender && !lender.eligible);

  const netTrade = n(dealData.tradeInValue) - n(dealData.tradeInPayoff);
  const rebate = n(dealData.rebate);
  const totalCredits = n(dealData.downPayment) + netTrade + rebate;
  const vscAmount = n(dealData.vscAmount);
  const gapAmount = n(dealData.gapAmount);
  const otherBackend = Math.max(0, n(dealData.backendProducts) - vscAmount - gapAmount);
  const taxAndFees =
    n(vehicle.salesTax) + n(settings.docFee) + n(settings.cvrFee) + n(dealData.stateFees);

  return (
    <>
      <style>{styles}</style>
      <div className="page">
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
              <Kv label="Buyer state" value={dealData.buyerState || settings.defaultState} />
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

        <section className="section">
          <h2>Lender Screen</h2>
          <div className="section-body lender-grid">
            <div>
              <div className="subtitle" style={{ marginBottom: "2mm", fontWeight: 800 }}>
                Top preliminary fits
              </div>
              <div className="lender-list">
                {eligibleLenders.length > 0 ? (
                  eligibleLenders
                    .slice(0, 5)
                    .map((lender) => <LenderRow key={lender.name} lender={lender} />)
                ) : (
                  <div className="lender-row miss">
                    <strong>No fits at current structure</strong>
                    <span>Adjust down payment, term, backend, or customer inputs.</span>
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="subtitle" style={{ marginBottom: "2mm", fontWeight: 800 }}>
                Watch items
              </div>
              <div className="lender-list">
                {missedLenders.slice(0, 4).map((lender) => (
                  <LenderRow key={lender.name} lender={lender} miss />
                ))}
                {missedLenders.length === 0 && (
                  <div className="lender-row">
                    <strong>No watch items returned</strong>
                    <span>All checked lenders fit the current screen.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="notes">
          <div className="callout">
            <strong>Backend products:</strong> Service contract, GAP, and other backend are editable
            per deal. The amount financed uses the total backend amount shown above.
          </div>
          <div className="callout">
            <strong>Lender fit:</strong> This is a program screen against dealer-entered data. Final
            approval, rate, advance, stipulations, and funding are lender decisions.
          </div>
        </section>

        <footer className="fineprint">
          Estimate only. This is not a retail installment contract, Truth-in-Lending disclosure,
          credit approval, or offer of credit. Taxes, state fees, lender rules, book values, APR,
          term, payment, and product pricing must be verified before contracting. Dealer-internal
          cost, gross, and reserve data are intentionally excluded from this customer worksheet.
        </footer>
      </div>
    </>
  );
};
