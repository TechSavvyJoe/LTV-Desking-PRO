import React from "react";
import type { DealPdfData, Settings, LenderEligibilityStatus } from "../../types";
import { getRebateBreakdown, getTransactionFees } from "../../services/calculator";
import {
  formatCurrency,
  formatCurrencyExact,
  formatNumber,
  formatPercentage,
} from "../common/TableCell";

/* Print styling follows PdfTemplate.tsx (the deal-sheet reference): emerald
   brand family, "LTV" mark tile instead of a logo image, no box-shadows
   (they print as gray smudges), and a local font stack — no render-time
   Google Fonts import, so PDF generation has no network dependency. */
const styles = `
    body {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        padding: 0;
        background-color: #fff;
        color: #1f2937;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        font-size: 9pt;
    }
    .page {
        width: 210mm;
        height: 297mm;
        padding: 1cm;
        box-sizing: border-box;
        background-color: white;
        display: flex;
        flex-direction: column;
        position: relative;
        page-break-after: always;
    }
    .page:last-child { page-break-after: auto; }
    .watermark {
        position: absolute;
        inset: 1cm;
        opacity: 0.04;
        font-size: 72pt;
        font-weight: 800;
        color: #059669;
        letter-spacing: 4px;
        transform: rotate(-18deg);
        pointer-events: none;
        user-select: none;
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding-bottom: 0.5cm;
        border-bottom: 2px solid #374151;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .mark {
        width: 34px;
        height: 34px;
        border-radius: 9px;
        background: #34d399;
        color: #07120e;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10pt;
        font-weight: 900;
        letter-spacing: 0;
        flex-shrink: 0;
    }
    .mark--lg {
        width: 56px;
        height: 56px;
        border-radius: 14px;
        font-size: 15pt;
        margin: 0 auto 8px auto;
    }
    .header h1 { font-size: 18pt; font-weight: 700; margin: 0; color: #111827; }
    .header p { font-size: 9pt; color: #4b5563; margin: 0; text-align: right; }
    .vehicle-counter {
        background: #d1fae5;
        color: #065f46;
        padding: 4px 10px;
        border-radius: 99px;
        font-size: 9pt;
        font-weight: 600;
        display: inline-block;
        margin-top: 4px;
    }
    .content { flex-grow: 1; padding: 0.75cm 0; }
    .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75cm;
        margin-bottom: 0.75cm;
    }
    .section-title {
        font-size: 11pt;
        font-weight: 600;
        margin: 0 0 0.4cm 0;
        padding-bottom: 0.2cm;
        border-bottom: 1px solid #e5e7eb;
        color: #111827;
    }
    .info-list { margin: 0; padding: 0; list-style: none; }
    .info-list li {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 9pt;
    }
    .info-list .label { color: #6b7280; }
    .info-list .value { font-weight: 500; color: #1f2937; }

    .financials-table { width: 100%; border-collapse: collapse; }
    .financials-table td { padding: 5px 0; font-size: 9pt; }
    .financials-table .label { color: #6b7280; }
    .financials-table .value { text-align: right; font-weight: 500; }
    .financials-table .separator-row td { border-top: 1px solid #e5e7eb; padding-top: 8px; }
    .financials-table .total-row td { font-weight: 700; border-top: 2px solid #4b5563; padding-top: 8px; font-size: 10pt; }

    .payment-summary {
        margin: 0.5cm 0;
        padding: 0.4cm;
        background: #ecfdf5;
        border: 1px solid #d1fae5;
        border-radius: 10px;
        text-align: center;
    }
    .payment-summary .label { font-size: 10pt; color: #047857; }
    .payment-summary .value { font-size: 20pt; font-weight: 700; color: #064e3b; }

    .lender-section { margin-top: 0.5cm; }
    .lender-list {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.4cm;
    }
    .lender-item {
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-left: 4px solid #10b981;
        border-radius: 4px;
        padding: 0.35cm;
        page-break-inside: avoid;
    }
    .lender-item .name { font-weight: 600; font-size: 9pt; margin: 0; }
    .lender-item .tier { font-size: 7.5pt; color: #6b7280; margin: 2px 0 0 0; }
    .lender-item.no-match { border-left-color: #ef4444; opacity: 0.7; }
    .no-lender-banner {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
        padding: 0.4cm;
        border-radius: 6px;
        font-size: 9pt;
        text-align: center;
    }

    .footer {
        margin-top: auto;
        padding-top: 0.4cm;
        border-top: 1px solid #e5e7eb;
        font-size: 8pt;
        color: #6b7280;
    }

    /* Cover page */
    .cover-hero {
        text-align: center;
        padding: 1.5cm 0 1cm 0;
        border-bottom: 2px solid #374151;
        margin-bottom: 0.75cm;
    }
    .cover-hero h1 { font-size: 22pt; font-weight: 700; margin: 0; color: #111827; }
    .cover-hero p { font-size: 10pt; color: #4b5563; margin: 6px 0 0 0; }
    .customer-card {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.4cm 0.75cm;
        padding: 0.5cm;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        margin-bottom: 0.5cm;
    }
    .customer-card .field .label { font-size: 7.5pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .customer-card .field .value { font-size: 10pt; font-weight: 600; color: #111827; }

    .overview-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
    .overview-table th, .overview-table td {
        border-bottom: 1px solid #e5e7eb;
        padding: 8px 6px;
        text-align: left;
        vertical-align: middle;
    }
    .overview-table th {
        background-color: #f9fafb;
        font-weight: 600;
        color: #4b5563;
        font-size: 7.5pt;
        text-transform: none;
    }
    .overview-table .text-right { text-align: right; }
    .overview-table .vehicle-name { font-weight: 600; color: #111827; font-size: 9pt; }
    .overview-table .vehicle-sub { font-size: 7.5pt; color: #6b7280; }
    .overview-table .strong { font-weight: 700; color: #064e3b; }
    .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 99px;
        font-size: 7.5pt;
        font-weight: 600;
    }
    .badge-eligible { background: #dcfce7; color: #166534; }
    .badge-noeligible { background: #fee2e2; color: #991b1b; }
`;

const BrandMarkTile: React.FC<{ large?: boolean }> = ({ large }) => (
  <div className={large ? "mark mark--lg" : "mark"} role="img" aria-label="LTV Desking PRO">
    LTV
  </div>
);

const InfoListItem: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <li>
    <span className="label">{label}</span>
    <span className="value">{value}</span>
  </li>
);

const FinancialsRow: React.FC<{
  label: string;
  value: string;
  isTotal?: boolean;
  isSeparator?: boolean;
}> = ({ label, value, isTotal = false, isSeparator = false }) => {
  let className = "";
  if (isTotal) className = "total-row";
  else if (isSeparator) className = "separator-row";
  return (
    <tr className={className}>
      <td className="label">{label}</td>
      <td className="value">{value}</td>
    </tr>
  );
};

const countEligible = (eligibility: LenderEligibilityStatus[] | undefined) =>
  Array.isArray(eligibility) ? eligibility.filter((l) => l && l.eligible).length : 0;

const CoverPage: React.FC<{
  deals: DealPdfData[];
  customerName: string;
  salespersonName: string;
  creditScore: number | null;
  loanTerm: number;
  apr: number | null;
  downPayment: number;
}> = ({ deals, customerName, salespersonName, creditScore, loanTerm, apr, downPayment }) => {
  const eligibleCount = deals.filter((d) => countEligible(d.lenderEligibility) > 0).length;

  return (
    <div className="page">
      <div className="watermark">ESTIMATE</div>
      <div className="cover-hero">
        <BrandMarkTile large />
        <h1>Vehicle Deal Comparison</h1>
        <p>
          {`${deals.length} favorited vehicle${deals.length === 1 ? "" : "s"} · ${eligibleCount} with possible lender fit${eligibleCount === 1 ? "" : "s"}`}
        </p>
        <p style={{ fontSize: "8.5pt", color: "#9ca3af", marginTop: "2px" }}>
          {`Generated ${new Date().toLocaleDateString()}`}
        </p>
      </div>
      <div className="customer-card">
        <div className="field">
          <div className="label">Customer</div>
          <div className="value">{customerName || "—"}</div>
        </div>
        <div className="field">
          <div className="label">Salesperson</div>
          <div className="value">{salespersonName || "—"}</div>
        </div>
        <div className="field">
          <div className="label">Credit Score (est.)</div>
          <div className="value">{creditScore ?? "—"}</div>
        </div>
        <div className="field">
          <div className="label">Down Payment</div>
          <div className="value">{formatCurrency(downPayment)}</div>
        </div>
        <div className="field">
          <div className="label">Loan Term</div>
          <div className="value">{`${loanTerm} mo`}</div>
        </div>
        <div className="field">
          <div className="label">APR</div>
          {/* A cleared APR arrives as "" (typed-around via `as number`). Guard like
              every other APR site so the cover page doesn't crash the whole PDF. [G5] */}
          <div className="value">{typeof apr === "number" ? `${apr.toFixed(2)}%` : "—"}</div>
        </div>
      </div>
      <h2 className="section-title">Vehicles in this Report</h2>
      <table className="overview-table">
        <thead>
          <tr>
            <th style={{ width: "5%" }}>#</th>
            <th style={{ width: "30%" }}>Vehicle</th>
            <th className="text-right">Price</th>
            <th className="text-right">Payment</th>
            <th className="text-right">OTD LTV</th>
            <th className="text-right">Lenders</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((deal, idx) => {
            const eligible = countEligible(deal.lenderEligibility);
            return (
              <tr key={deal.vehicle?.vin || idx}>
                <td>{String(idx + 1)}</td>
                <td>
                  <div className="vehicle-name">{deal.vehicle?.vehicle || "Unknown Vehicle"}</div>
                  <div className="vehicle-sub">
                    {`Stock ${deal.vehicle?.stock || "—"} · ${formatNumber(deal.vehicle?.mileage || 0)} mi`}
                  </div>
                </td>
                <td className="text-right">{formatCurrency(deal.vehicle?.price)}</td>
                <td className="text-right strong">
                  {formatCurrency(deal.vehicle?.monthlyPayment)}
                </td>
                <td className="text-right">{formatPercentage(deal.vehicle?.otdLtv)}</td>
                <td className="text-right">{`${eligible}`}</td>
                <td>
                  <span className={`badge ${eligible > 0 ? "badge-eligible" : "badge-noeligible"}`}>
                    {/* ✓/✗ glyphs keep the distinction on B&W laser printouts. [G69] */}
                    {eligible > 0 ? "✓ Possible fit" : "✗ No fit"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="footer">
        <p>
          Each vehicle's full deal details follow on the next pages. All figures are estimates and
          subject to lender approval.
        </p>
      </div>
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
  const safeEligibility = Array.isArray(lenderEligibility) ? lenderEligibility : [];
  const eligibleLenders = safeEligibility.filter(
    (l) => l && l.eligible && (l.status === undefined || l.status === "eligible")
  );
  const pendingLenders = safeEligibility.filter(
    (l) => l && !l.eligible && (l.status === "pending" || (l.uncheckedConstraints?.length ?? 0) > 0)
  );

  return (
    <div className="page">
      <div className="watermark">ESTIMATE</div>
      <header className="header">
        <div className="brand">
          <BrandMarkTile />
          <div>
            <h1>{vehicle?.vehicle || "Vehicle"}</h1>
            <div className="vehicle-counter">
              {`Vehicle ${index + 1} of ${total} · ${customerName || "Customer"}`}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <p>{`Date: ${new Date().toLocaleDateString()}`}</p>
          {dealData?.notes && <p style={{ marginTop: "4px" }}>{`Notes: ${dealData.notes}`}</p>}
        </div>
      </header>
      <div className="content">
        <div className="grid">
          <div>
            <h2 className="section-title">Vehicle Details</h2>
            <ul className="info-list">
              <InfoListItem label="Vehicle" value={<strong>{vehicle?.vehicle}</strong>} />
              <InfoListItem label="Stock #" value={vehicle?.stock} />
              <InfoListItem label="VIN" value={vehicle?.vin} />
              <InfoListItem label="Mileage" value={formatNumber(vehicle?.mileage)} />
              {/* Dealer-entered book values — never imply a licensed feed. [G26/G80] */}
              <InfoListItem label="Book Value (Trade)" value={formatCurrency(vehicle?.jdPower)} />
              <InfoListItem
                label="Book Value (Retail)"
                value={formatCurrency(vehicle?.jdPowerRetail)}
              />
            </ul>
          </div>
          <div>
            <h2 className="section-title">Customer & Deal Terms</h2>
            <ul className="info-list">
              <InfoListItem label="Customer" value={customerName || "N/A"} />
              <InfoListItem label="Salesperson" value={salespersonName || "N/A"} />
              <InfoListItem
                label="Credit Score (est.)"
                value={customerFilters?.creditScore || "N/A"}
              />
              <InfoListItem label="Loan Term" value={`${dealData?.loanTerm} Months`} />
              {/* Blank APR arrives as "" — guard the toFixed crash. [G5] */}
              <InfoListItem
                label="Est. Interest Rate"
                value={
                  typeof dealData?.interestRate === "number"
                    ? `${dealData.interestRate.toFixed(2)}% APR`
                    : "—"
                }
              />
              {/* Front-End Gross removed: dealer-internal profit never prints on
                  customer paper. [G1] */}
            </ul>
          </div>
        </div>
        <div>
          <h2 className="section-title">Financial Breakdown</h2>
          <table className="financials-table">
            <tbody>
              <FinancialsRow label="Selling Price" value={formatCurrencyExact(vehicle?.price)} />
              {rebate.dealerDiscount > 0 && (
                <FinancialsRow
                  label="Dealer Discount / Rebate"
                  value={`- ${formatCurrencyExact(rebate.dealerDiscount)}`}
                />
              )}
              <FinancialsRow label="Doc Fee" value={`+ ${formatCurrencyExact(settings.docFee)}`} />
              <FinancialsRow label="CVR Fee" value={`+ ${formatCurrencyExact(settings.cvrFee)}`} />
              {transactionFees > 0 && (
                <FinancialsRow
                  label="Transaction Fees"
                  value={`+ ${formatCurrencyExact(transactionFees)}`}
                />
              )}
              <FinancialsRow
                label="State/Title Fees"
                value={`+ ${formatCurrencyExact(dealData?.stateFees)}`}
              />
              <FinancialsRow
                label="Sales Tax (est.)"
                value={`+ ${formatCurrencyExact(vehicle?.salesTax)}`}
              />
              <FinancialsRow
                label="Total OTD Price (est.)"
                value={formatCurrencyExact(vehicle?.baseOutTheDoorPrice)}
                isTotal
              />
              <FinancialsRow
                label="Cash Down"
                value={`- ${formatCurrencyExact(dealData?.downPayment)}`}
                isSeparator
              />
              {/* Explicit rollover line instead of "- -$3,000". [G21] */}
              {netTradeIn >= 0 ? (
                <FinancialsRow
                  label="Net Trade-In"
                  value={`- ${formatCurrencyExact(netTradeIn)}`}
                />
              ) : (
                <FinancialsRow
                  label="Negative Equity (added to amount financed)"
                  value={`+ ${formatCurrencyExact(Math.abs(netTradeIn))}`}
                />
              )}
              {rebate.manufacturerRebate > 0 && (
                <FinancialsRow
                  label="Manufacturer Rebate"
                  value={`- ${formatCurrencyExact(rebate.manufacturerRebate)}`}
                />
              )}
              <FinancialsRow
                label="Sub-Total"
                value={formatCurrencyExact(
                  typeof vehicle?.baseOutTheDoorPrice === "number"
                    ? vehicle.baseOutTheDoorPrice - totalDown
                    : "Error"
                )}
                isTotal
              />
              <FinancialsRow
                label="Backend Products"
                value={`+ ${formatCurrencyExact(dealData?.backendProducts)}`}
                isSeparator
              />
              <FinancialsRow
                label="Total Amount to Finance (est.)"
                value={formatCurrencyExact(vehicle?.amountToFinance)}
                isTotal
              />
            </tbody>
          </table>
        </div>
        <div className="payment-summary">
          <div className="label">Estimated Monthly Payment</div>
          <div className="value">{formatCurrencyExact(vehicle?.monthlyPayment)}</div>
          <div style={{ fontSize: "8pt", color: "#047857", marginTop: "4px" }}>
            {typeof dealData?.interestRate === "number"
              ? `Estimate at ${dealData.interestRate.toFixed(2)}% APR for ${dealData?.loanTerm} months — not an offer of credit`
              : "Estimate — enter a rate for payment terms; not an offer of credit"}
          </div>
        </div>
        <div className="lender-section">
          <h2 className="section-title">
            {`Verified Lender Fits (${eligibleLenders.length} of ${safeEligibility.length})`}
          </h2>
          {eligibleLenders.length > 0 ? (
            <div className="lender-list">
              {eligibleLenders.slice(0, 9).map((lender) => (
                <div key={lender.name} className="lender-item">
                  <p className="name">{lender.name}</p>
                  <p className="tier">{lender.matchedTier?.name || "Possible fit"}</p>
                </div>
              ))}
              {eligibleLenders.length > 9 && (
                <div
                  key="more"
                  className="lender-item"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#f3f4f6",
                    borderStyle: "dashed",
                  }}
                >
                  <p
                    style={{
                      fontSize: "8.5pt",
                      color: "#6b7280",
                      fontStyle: "italic",
                      margin: 0,
                    }}
                  >
                    {`+ ${eligibleLenders.length - 9} more possible fits`}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="no-lender-banner">
              No verified lender fits for this vehicle with the current borrower and vehicle
              information.
            </div>
          )}
          {pendingLenders.length > 0 && (
            <div className="no-lender-banner" style={{ marginTop: "8px" }}>
              {`Pending verification (${pendingLenders.length}): ${pendingLenders
                .slice(0, 3)
                .map(
                  (lender) =>
                    `${lender.name} - ${lender.reasons?.[0] || "required information is incomplete"}`
                )
                .join(" ")}`}
            </div>
          )}
        </div>
      </div>
      <footer className="footer">
        <p>
          {"This worksheet is a preliminary estimate for discussion only. It is not a contract, not an " +
            "offer or extension of credit, and not a Truth-in-Lending disclosure. Lender fits are a " +
            "preliminary screen against dealer-entered program data, not credit decisions. Sample and " +
            "incomplete programs are pending and excluded from verified fit counts. All figures " +
            "are estimates; final pricing, taxes, fees, APR, and payment are subject to lender credit " +
            "approval and final contract documents. Book values are entered by the dealership."}
        </p>
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
      <div className="page">
        <style>{styles}</style>
        <h1>No favorited vehicles to report.</h1>
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

  return (
    <>
      <style>{styles}</style>
      <CoverPage
        deals={safeDeals}
        customerName={customerName}
        salespersonName={salespersonName}
        creditScore={creditScore}
        loanTerm={loanTerm}
        apr={apr}
        downPayment={downPayment}
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
    </>
  );
};
