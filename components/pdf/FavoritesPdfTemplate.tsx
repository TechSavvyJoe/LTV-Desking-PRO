import React from "react";
import type { DealPdfData, Settings, LenderEligibilityStatus } from "../../types";
import {
  formatCurrency,
  formatCurrencyExact,
  formatNumber,
  formatPercentage,
} from "../common/TableCell";

const el = React.createElement;
const logoSvg = encodeURIComponent(
  `<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="96" height="96" rx="18" fill="url(#g)"/><path d="M26 49c0-10.5 8.5-19 19-19h6c10.5 0 19 8.5 19 19s-8.5 19-19 19h-6c-10.5 0-19-8.5-19-19Z" stroke="white" stroke-width="6"/><path d="M32 49c0-7.2 5.8-13 13-13h6c7.2 0 13 5.8 13 13s-5.8 13-13 13h-6c-7.2 0-13-5.8-13-13Z" stroke="white" stroke-width="6" opacity="0.6"/><defs><linearGradient id="g" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse"><stop stop-color="#0ea5e9"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`
);

const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body {
        font-family: 'Inter', sans-serif;
        margin: 0;
        padding: 0;
        background-color: #fff;
        color: #1f2937;
        -webkit-print-color-adjust: exact;
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
        color: #0ea5e9;
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
    .logo {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background: linear-gradient(135deg, #0ea5e9, #6366f1);
    }
    .header h1 { font-size: 18pt; font-weight: 700; margin: 0; color: #111827; }
    .header p { font-size: 9pt; color: #4b5563; margin: 0; text-align: right; }
    .vehicle-counter {
        background: #e0f2fe;
        color: #075985;
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
        background: linear-gradient(135deg, #dbeafe, #bfdbfe);
        border-radius: 10px;
        text-align: center;
        box-shadow: 0 6px 12px rgba(59,130,246,0.18);
    }
    .payment-summary .label { font-size: 10pt; color: #1e40af; }
    .payment-summary .value { font-size: 20pt; font-weight: 700; color: #1e3a8a; }

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
    .cover-hero img { width: 56px; margin-bottom: 8px; }
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
        text-transform: uppercase;
    }
    .overview-table .text-right { text-align: right; }
    .overview-table .vehicle-name { font-weight: 600; color: #111827; font-size: 9pt; }
    .overview-table .vehicle-sub { font-size: 7.5pt; color: #6b7280; }
    .overview-table .strong { font-weight: 700; color: #1e3a8a; }
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

const InfoListItem = (label: string, value: React.ReactNode) =>
  el(
    "li",
    null,
    el("span", { className: "label" }, label),
    el("span", { className: "value" }, value)
  );

const FinancialsRow = (label: string, value: string, isTotal = false, isSeparator = false) => {
  let className = "";
  if (isTotal) className = "total-row";
  else if (isSeparator) className = "separator-row";
  return el(
    "tr",
    { className },
    el("td", { className: "label" }, label),
    el("td", { className: "value" }, value)
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

  return el(
    "div",
    { className: "page" },
    el("div", { className: "watermark" }, "ESTIMATE"),
    el(
      "div",
      { className: "cover-hero" },
      el("img", { src: `data:image/svg+xml,${logoSvg}`, alt: "LTV Desking PRO" }),
      el("h1", null, "Vehicle Deal Comparison"),
      el(
        "p",
        null,
        `${deals.length} favorited vehicle${deals.length === 1 ? "" : "s"} · ${eligibleCount} with possible lender fit${eligibleCount === 1 ? "" : "s"}`
      ),
      el(
        "p",
        { style: { fontSize: "8.5pt", color: "#9ca3af", marginTop: "2px" } },
        `Generated ${new Date().toLocaleDateString()}`
      )
    ),
    el(
      "div",
      { className: "customer-card" },
      el(
        "div",
        { className: "field" },
        el("div", { className: "label" }, "Customer"),
        el("div", { className: "value" }, customerName || "—")
      ),
      el(
        "div",
        { className: "field" },
        el("div", { className: "label" }, "Salesperson"),
        el("div", { className: "value" }, salespersonName || "—")
      ),
      el(
        "div",
        { className: "field" },
        el("div", { className: "label" }, "Credit Score (est.)"),
        el("div", { className: "value" }, creditScore ?? "—")
      ),
      el(
        "div",
        { className: "field" },
        el("div", { className: "label" }, "Down Payment"),
        el("div", { className: "value" }, formatCurrency(downPayment))
      ),
      el(
        "div",
        { className: "field" },
        el("div", { className: "label" }, "Loan Term"),
        el("div", { className: "value" }, `${loanTerm} mo`)
      ),
      el(
        "div",
        { className: "field" },
        el("div", { className: "label" }, "APR"),
        // A cleared APR arrives as "" (typed-around via `as number`). Guard like
        // every other APR site so the cover page doesn't crash the whole PDF. [G5]
        el("div", { className: "value" }, typeof apr === "number" ? `${apr.toFixed(2)}%` : "—")
      )
    ),
    el("h2", { className: "section-title" }, "Vehicles in this Report"),
    el(
      "table",
      { className: "overview-table" },
      el(
        "thead",
        null,
        el(
          "tr",
          null,
          el("th", { style: { width: "5%" } }, "#"),
          el("th", { style: { width: "30%" } }, "Vehicle"),
          el("th", { className: "text-right" }, "Price"),
          el("th", { className: "text-right" }, "Payment"),
          el("th", { className: "text-right" }, "OTD LTV"),
          el("th", { className: "text-right" }, "Lenders"),
          el("th", null, "Status")
        )
      ),
      el(
        "tbody",
        null,
        ...deals.map((deal, idx) => {
          const eligible = countEligible(deal.lenderEligibility);
          return el(
            "tr",
            { key: deal.vehicle?.vin || idx },
            el("td", null, String(idx + 1)),
            el(
              "td",
              null,
              el("div", { className: "vehicle-name" }, deal.vehicle?.vehicle || "Unknown Vehicle"),
              el(
                "div",
                { className: "vehicle-sub" },
                `Stock ${deal.vehicle?.stock || "—"} · ${formatNumber(deal.vehicle?.mileage || 0)} mi`
              )
            ),
            el("td", { className: "text-right" }, formatCurrency(deal.vehicle?.price)),
            el(
              "td",
              { className: "text-right strong" },
              formatCurrency(deal.vehicle?.monthlyPayment)
            ),
            el("td", { className: "text-right" }, formatPercentage(deal.vehicle?.otdLtv)),
            el("td", { className: "text-right" }, `${eligible}`),
            el(
              "td",
              null,
              el(
                "span",
                {
                  className: `badge ${eligible > 0 ? "badge-eligible" : "badge-noeligible"}`,
                },
                // ✓/✗ glyphs keep the distinction on B&W laser printouts. [G69]
                eligible > 0 ? "✓ Possible fit" : "✗ No fit"
              )
            )
          );
        })
      )
    ),
    el(
      "div",
      { className: "footer" },
      el(
        "p",
        null,
        "Each vehicle's full deal details follow on the next pages. All figures are estimates and subject to lender approval."
      )
    )
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
  const totalDown = dealData.downPayment + netTradeIn;
  const safeEligibility = Array.isArray(lenderEligibility) ? lenderEligibility : [];
  const eligibleLenders = safeEligibility.filter((l) => l && l.eligible);

  return el(
    "div",
    { className: "page" },
    el("div", { className: "watermark" }, "ESTIMATE"),
    el(
      "header",
      { className: "header" },
      el(
        "div",
        { className: "brand" },
        el("img", {
          src: `data:image/svg+xml,${logoSvg}`,
          alt: "LTV Desking PRO",
          style: { width: "34px", height: "34px" },
        }),
        el(
          "div",
          null,
          el("h1", null, vehicle?.vehicle || "Vehicle"),
          el(
            "div",
            { className: "vehicle-counter" },
            `Vehicle ${index + 1} of ${total} · ${customerName || "Customer"}`
          )
        )
      ),
      el(
        "div",
        { style: { textAlign: "right" } },
        el("p", null, `Date: ${new Date().toLocaleDateString()}`),
        dealData?.notes && el("p", { style: { marginTop: "4px" } }, `Notes: ${dealData.notes}`)
      )
    ),
    el(
      "div",
      { className: "content" },
      el(
        "div",
        { className: "grid" },
        el(
          "div",
          null,
          el("h2", { className: "section-title" }, "Vehicle Details"),
          el(
            "ul",
            { className: "info-list" },
            InfoListItem("Vehicle", el("strong", null, vehicle?.vehicle)),
            InfoListItem("Stock #", vehicle?.stock),
            InfoListItem("VIN", vehicle?.vin),
            InfoListItem("Mileage", formatNumber(vehicle?.mileage)),
            // Dealer-entered book values — never imply a licensed feed. [G26/G80]
            InfoListItem("Book Value (Trade)", formatCurrency(vehicle?.jdPower)),
            InfoListItem("Book Value (Retail)", formatCurrency(vehicle?.jdPowerRetail))
          )
        ),
        el(
          "div",
          null,
          el("h2", { className: "section-title" }, "Customer & Deal Terms"),
          el(
            "ul",
            { className: "info-list" },
            InfoListItem("Customer", customerName || "N/A"),
            InfoListItem("Salesperson", salespersonName || "N/A"),
            InfoListItem("Credit Score (est.)", customerFilters?.creditScore || "N/A"),
            InfoListItem("Loan Term", `${dealData?.loanTerm} Months`),
            // Blank APR arrives as "" — guard the toFixed crash. [G5]
            InfoListItem(
              "Est. Interest Rate",
              typeof dealData?.interestRate === "number"
                ? `${dealData.interestRate.toFixed(2)}% APR`
                : "—"
            )
            // Front-End Gross removed: dealer-internal profit never prints on
            // customer paper. [G1]
          )
        )
      ),
      el(
        "div",
        null,
        el("h2", { className: "section-title" }, "Financial Breakdown"),
        el(
          "table",
          { className: "financials-table" },
          el(
            "tbody",
            null,
            FinancialsRow("Selling Price", formatCurrencyExact(vehicle?.price)),
            FinancialsRow("Doc Fee", `+ ${formatCurrencyExact(settings.docFee)}`),
            FinancialsRow("CVR Fee", `+ ${formatCurrencyExact(settings.cvrFee)}`),
            FinancialsRow("State/Title Fees", `+ ${formatCurrencyExact(dealData?.stateFees)}`),
            FinancialsRow("Sales Tax (est.)", `+ ${formatCurrencyExact(vehicle?.salesTax)}`),
            FinancialsRow(
              "Total OTD Price (est.)",
              formatCurrencyExact(vehicle?.baseOutTheDoorPrice),
              true
            ),
            FinancialsRow(
              "Cash Down",
              `- ${formatCurrencyExact(dealData?.downPayment)}`,
              false,
              true
            ),
            // Explicit rollover line instead of "- -$3,000". [G21]
            netTradeIn >= 0
              ? FinancialsRow("Net Trade-In", `- ${formatCurrencyExact(netTradeIn)}`)
              : FinancialsRow(
                  "Negative Equity (added to amount financed)",
                  `+ ${formatCurrencyExact(Math.abs(netTradeIn))}`
                ),
            FinancialsRow(
              "Sub-Total",
              formatCurrencyExact(
                typeof vehicle?.baseOutTheDoorPrice === "number"
                  ? vehicle.baseOutTheDoorPrice - totalDown
                  : "Error"
              ),
              true
            ),
            FinancialsRow(
              "Backend Products",
              `+ ${formatCurrencyExact(dealData?.backendProducts)}`,
              false,
              true
            ),
            FinancialsRow(
              "Total Amount to Finance (est.)",
              formatCurrencyExact(vehicle?.amountToFinance),
              true
            )
          )
        )
      ),
      el(
        "div",
        { className: "payment-summary" },
        el("div", { className: "label" }, "Estimated Monthly Payment"),
        el("div", { className: "value" }, formatCurrencyExact(vehicle?.monthlyPayment)),
        el(
          "div",
          { style: { fontSize: "8pt", color: "#1e40af", marginTop: "4px" } },
          typeof dealData?.interestRate === "number"
            ? `Estimate at ${dealData.interestRate.toFixed(2)}% APR for ${dealData?.loanTerm} months — not an offer of credit`
            : "Estimate — enter a rate for payment terms; not an offer of credit"
        )
      ),
      el(
        "div",
        { className: "lender-section" },
        el(
          "h2",
          { className: "section-title" },
          `Preliminary Lender Fits (${eligibleLenders.length} of ${safeEligibility.length}) — verify with lender`
        ),
        eligibleLenders.length > 0
          ? el(
              "div",
              { className: "lender-list" },
              ...eligibleLenders
                .slice(0, 9)
                .map((lender) =>
                  el(
                    "div",
                    { key: lender.name, className: "lender-item" },
                    el("p", { className: "name" }, lender.name),
                    el("p", { className: "tier" }, lender.matchedTier?.name || "Possible fit")
                  )
                ),
              eligibleLenders.length > 9 &&
                el(
                  "div",
                  {
                    key: "more",
                    className: "lender-item",
                    style: {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#f3f4f6",
                      borderStyle: "dashed",
                    },
                  },
                  el(
                    "p",
                    {
                      style: {
                        fontSize: "8.5pt",
                        color: "#6b7280",
                        fontStyle: "italic",
                        margin: 0,
                      },
                    },
                    `+ ${eligibleLenders.length - 9} more possible fits`
                  )
                )
            )
          : el(
              "div",
              { className: "no-lender-banner" },
              "No preliminary lender fits for this vehicle with current customer info (credit, income, or LTV screens)."
            )
      )
    ),
    el(
      "footer",
      { className: "footer" },
      el(
        "p",
        null,
        "This worksheet is a preliminary estimate for discussion only. It is not a contract, not an " +
          "offer or extension of credit, and not a Truth-in-Lending disclosure. Lender fits are a " +
          "preliminary screen against dealer-entered program data, not credit decisions. All figures " +
          "are estimates; final pricing, taxes, fees, APR, and payment are subject to lender credit " +
          "approval and final contract documents. Book values are entered by the dealership."
      )
    )
  );
};

export const FavoritesPdfTemplate: React.FC<{ deals: DealPdfData[]; settings: Settings }> = ({
  deals,
  settings,
}) => {
  const safeDeals = Array.isArray(deals) ? deals.filter(Boolean) : [];
  if (safeDeals.length === 0) {
    return el(
      "div",
      { className: "page" },
      el("style", null, styles),
      el("h1", null, "No favorited vehicles to report.")
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

  return el(
    React.Fragment,
    null,
    el("style", null, styles),
    el(CoverPage, {
      deals: safeDeals,
      customerName,
      salespersonName,
      creditScore,
      loanTerm,
      apr,
      downPayment,
    }),
    ...safeDeals.map((deal, idx) =>
      el(VehiclePage, {
        key: deal.vehicle?.vin || idx,
        data: deal,
        settings,
        index: idx,
        total: safeDeals.length,
      })
    )
  );
};
