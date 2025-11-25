
import React from 'react';
import type { DealPdfData, Settings } from '../../types';
import { formatCurrency, formatNumber, formatPercentage } from '../common/TableCell';

const el = React.createElement;

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
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding-bottom: 0.5cm;
        border-bottom: 2px solid #374151;
    }
    .header h1 {
        font-size: 18pt;
        font-weight: 700;
        margin: 0;
        color: #111827;
    }
    .header p {
        font-size: 9pt;
        color: #4b5563;
        margin: 0;
        text-align: right;
    }
    .content {
        flex-grow: 1;
        padding: 0.75cm 0;
    }
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
    .financials-table .separator-row td { border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 4px; }
    .financials-table .total-row td { font-weight: 700; border-top: 2px solid #4b5563; padding-top: 8px; font-size: 10pt; }
    
    .lender-section { margin-top: 0.75cm; }
    .lender-list {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.5cm;
    }
    .lender-item {
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-left: 4px solid #10b981;
        border-radius: 4px;
        padding: 0.4cm;
    }
    .lender-item .name { font-weight: 600; font-size: 9pt; }
    .lender-item .tier { font-size: 8pt; color: #6b7280; }
    
    .payment-summary {
        margin: 0.75cm 0;
        padding: 0.5cm;
        background-color: #dbeafe;
        border-radius: 6px;
        text-align: center;
    }
    .payment-summary .label { font-size: 10pt; color: #1e40af; }
    .payment-summary .value { font-size: 20pt; font-weight: 700; color: #1e3a8a; }
    
    .footer {
        margin-top: auto;
        padding-top: 0.5cm;
        border-top: 1px solid #e5e7eb;
        font-size: 8pt;
        color: #6b7280;
    }
    .signature-lines {
        margin-top: 1.5cm;
        display: flex;
        justify-content: space-between;
        gap: 2cm;
    }
    .signature-box {
        flex-grow: 1;
        border-top: 1px solid #374151;
        padding-top: 5px;
        font-size: 9pt;
        font-weight: 500;
    }
`;

const InfoListItem = (label: string, value: React.ReactNode) => el('li', null, el('span', { className: 'label' }, label), el('span', { className: 'value' }, value));

const FinancialsRow = (label: string, value: string, isTotal = false, isSeparator = false) => {
    let className = '';
    if (isTotal) className = 'total-row';
    else if (isSeparator) className = 'separator-row';
    return el('tr', { className },
        el('td', { className: 'label' }, label),
        el('td', { className: 'value' }, value)
    );
};

export const PdfTemplate: React.FC<DealPdfData & { settings: Settings }> = ({ vehicle, dealData, customerFilters, customerName, salespersonName, lenderEligibility, settings }) => {
    const netTradeIn = dealData.tradeInValue - dealData.tradeInPayoff;
    const totalDown = dealData.downPayment + netTradeIn;

    // Defensive check to prevent crash if lenderEligibility is undefined
    const safeEligibility = Array.isArray(lenderEligibility) ? lenderEligibility : [];
    const eligibleLenders = safeEligibility.filter(l => l && l.eligible);

    return el(React.Fragment, null,
        el('style', null, styles),
        el('div', { className: 'page' },
            el('header', { className: 'header' },
                el('div', null,
                    el('h1', null, 'Vehicle Purchase Proposal'),
                    el('p', { style: { fontSize: '10pt', color: '#374151' } }, 'Your Dealership Name Here')
                ),
                el('div', { style: { textAlign: 'right', fontSize: '9pt', color: '#4b5563' } },
                    el('p', null, `Date: ${new Date().toLocaleDateString()}`),
                    dealData.notes && el('p', { style: { marginTop: '4px' } }, `Notes: ${dealData.notes}`)
                )
            ),
            el('div', { className: 'content' },
                el('div', { className: 'grid' },
                    el('div', { className: 'vehicle-info' },
                        el('h2', { className: 'section-title' }, 'Vehicle Details'),
                        el('ul', { className: 'info-list' },
                            InfoListItem('Vehicle', el('strong', null, vehicle.vehicle)),
                            InfoListItem('Stock #', vehicle.stock),
                            InfoListItem('VIN', vehicle.vin),
                            InfoListItem('Mileage', formatNumber(vehicle.mileage)),
                            InfoListItem('JD Power (Trade)', formatCurrency(vehicle.jdPower)),
                            InfoListItem('JD Power (Retail)', formatCurrency(vehicle.jdPowerRetail))
                        )
                    ),
                    el('div', { className: 'customer-info' },
                        el('h2', { className: 'section-title' }, 'Customer & Deal Terms'),
                        el('ul', { className: 'info-list' },
                            InfoListItem('Customer', customerName || 'N/A'),
                            InfoListItem('Salesperson', salespersonName || 'N/A'),
                            InfoListItem('Credit Score', customerFilters.creditScore || 'N/A'),
                            InfoListItem('Loan Term', `${dealData.loanTerm} Months`),
                            InfoListItem('Interest Rate', `${dealData.interestRate.toFixed(2)}% APR`),
                            InfoListItem('Front-End Gross', formatCurrency(vehicle.frontEndGross))
                        )
                    )
                ),
                el('div', { className: 'financials' },
                    el('h2', { className: 'section-title' }, 'Financial Breakdown'),
                    el('table', { className: 'financials-table' },
                        el('tbody', null,
                            FinancialsRow('Selling Price', formatCurrency(vehicle.price)),
                            FinancialsRow('Doc Fee', `+ ${formatCurrency(settings.docFee)}`),
                            FinancialsRow('CVR Fee', `+ ${formatCurrency(settings.cvrFee)}`),
                            FinancialsRow('State/Title Fees', `+ ${formatCurrency(dealData.stateFees)}`),
                            FinancialsRow('Sales Tax', `+ ${formatCurrency(vehicle.salesTax)}`),
                            FinancialsRow('Total OTD Price', formatCurrency(vehicle.baseOutTheDoorPrice), true, false),
                            FinancialsRow('Cash Down', `- ${formatCurrency(dealData.downPayment)}`, false, true),
                            FinancialsRow('Net Trade-In', `- ${formatCurrency(netTradeIn)}`),
                            FinancialsRow('Sub-Total', formatCurrency(typeof vehicle.baseOutTheDoorPrice === 'number' ? vehicle.baseOutTheDoorPrice - totalDown : 'Error'), true, false),
                            FinancialsRow('Backend Products', `+ ${formatCurrency(dealData.backendProducts)}`, false, true),
                            FinancialsRow('Total Amount to Finance', formatCurrency(vehicle.amountToFinance), true, false)
                        )
                    )
                ),
                el('div', { className: 'payment-summary' },
                    el('div', { className: 'label' }, 'Estimated Monthly Payment'),
                    el('div', { className: 'value' }, formatCurrency(vehicle.monthlyPayment))
                ),
                el('div', { className: 'lender-section' },
                    el('h2', { className: 'section-title' }, 'Eligible Lenders'),
                    el('div', { className: 'lender-list' },
                        eligibleLenders.length > 0
                            ? eligibleLenders.map(lender => el('div', { key: lender.name, className: 'lender-item' },
                                el('p', { className: 'name' }, lender.name),
                                el('p', { className: 'tier' }, lender.matchedTier?.name || 'Eligible')
                            ))
                            : el('p', { style: { color: '#6b7280' } }, 'No eligible lenders found with current customer info.')
                    )
                )
            ),
            el('footer', { className: 'footer' },
                el('p', null, 'This is a preliminary proposal and not a final contract. All figures are estimates and subject to lender approval.'),
                el('div', { className: 'signature-lines' },
                    el('div', { className: 'signature-box' }, 'Customer Signature'),
                    el('div', { className: 'signature-box' }, 'Salesperson Signature')
                )
            )
        )
    );
};
