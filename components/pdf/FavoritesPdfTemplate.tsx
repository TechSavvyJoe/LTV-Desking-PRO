
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
        font-size: 8pt;
    }
    .page {
        width: 210mm;
        height: 297mm;
        padding: 1cm;
        box-sizing: border-box;
        background-color: white;
        position: relative;
    }
    .watermark {
        position: absolute;
        inset: 1cm;
        opacity: 0.04;
        font-size: 70pt;
        font-weight: 800;
        color: #0ea5e9;
        letter-spacing: 3px;
        transform: rotate(-18deg);
        pointer-events: none;
        user-select: none;
    }
    .header {
        text-align: center;
        margin-bottom: 0.75cm;
    }
    .header h1 {
        font-size: 16pt;
        font-weight: 700;
        margin: 0 0 8px 0;
    }
    .header p {
        font-size: 9pt;
        color: #4b5563;
        margin: 0 auto;
        border-top: 1px solid #e5e7eb;
        border-bottom: 1px solid #e5e7eb;
        padding: 8px 0;
        max-width: 90%;
    }
    .header strong { color: #374151; }
    
    .summary-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 8pt;
    }
    .summary-table th, .summary-table td {
        border-bottom: 1px solid #e5e7eb;
        padding: 8px 4px;
        text-align: left;
        vertical-align: middle;
    }
    .summary-table th {
        background-color: #f9fafb;
        font-weight: 600;
        color: #4b5563;
        font-size: 7pt;
        text-transform: uppercase;
    }
    .summary-table .vehicle-name {
        font-weight: 600;
        font-size: 9pt;
        color: #111827;
    }
    .summary-table .vehicle-details {
        font-size: 7.5pt;
        color: #6b7280;
    }
    .summary-table .lender-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }
    .summary-table .lender-list li {
        background-color: #e0e7ff;
        color: #3730a3;
        padding: 2px 6px;
        border-radius: 99px;
        font-size: 7pt;
        font-weight: 500;
    }
    .text-right { text-align: right; }
    .strong { font-weight: 600; color: #1e3a8a; }
`;

export const FavoritesPdfTemplate: React.FC<{ deals: DealPdfData[], settings: Settings }> = ({ deals }) => {
    // Defensive check for deals array
    const safeDeals = Array.isArray(deals) ? deals : [];
    const mainDealInfo = safeDeals[0];

    return el('div', { className: 'page' },
        el('style', null, styles),
        el('div', { className: 'watermark' }, 'OSHIP'),
        el('header', { className: 'header' },
            el('h1', null, 'OSHIP Vehicle Comparison Report'),
            mainDealInfo && el('p', null, 
                `Customer: `, el('strong', null, mainDealInfo.customerName || 'N/A'), ` | `,
                `Salesperson: `, el('strong', null, mainDealInfo.salespersonName || 'N/A'), ` | `,
                `Credit Score: `, el('strong', null, (mainDealInfo.customerFilters && mainDealInfo.customerFilters.creditScore) || 'N/A'), ` | `,
                `Down Payment: `, el('strong', null, formatCurrency(mainDealInfo.dealData?.downPayment || 0)), ` | `,
                `Term: `, el('strong', null, `${mainDealInfo.dealData?.loanTerm || 0}mo`), ` @ `, el('strong', null, `${mainDealInfo.dealData?.interestRate || 0}% APR`)
            )
        ),
        el('table', { className: 'summary-table' },
            el('thead', null,
                el('tr', null,
                    el('th', { style: { width: '28%' } }, 'Vehicle'),
                    el('th', { className: 'text-right' }, 'Price'),
                    el('th', { className: 'text-right' }, 'Amt. to Fin.'),
                    el('th', { className: 'text-right' }, 'Payment'),
                    el('th', { className: 'text-right' }, 'OTD LTV'),
                    el('th', { style: { width: '25%' } }, 'Eligible Lenders')
                )
            ),
            el('tbody', null,
                ...safeDeals.map(deal => {
                    // Extra defensive checks for nested objects
                    const eligibility = Array.isArray(deal?.lenderEligibility) ? deal.lenderEligibility : [];
                    const eligibleBanks = eligibility.filter(l => l && l.eligible);

                    return el('tr', { key: deal.vehicle?.vin || Math.random().toString() },
                        el('td', null, 
                            el('div', { className: 'vehicle-name' }, deal.vehicle?.vehicle || 'Unknown Vehicle'),
                            el('div', { className: 'vehicle-details' }, `Stock: ${deal.vehicle?.stock || 'N/A'} | Miles: ${formatNumber(deal.vehicle?.mileage || 0)}`)
                        ),
                        el('td', { className: 'text-right' }, formatCurrency(deal.vehicle?.price)),
                        el('td', { className: 'text-right strong' }, formatCurrency(deal.vehicle?.amountToFinance)),
                        el('td', { className: 'text-right strong' }, formatCurrency(deal.vehicle?.monthlyPayment)),
                        el('td', { className: 'text-right strong' }, formatPercentage(deal.vehicle?.otdLtv)),
                        el('td', null, 
                             el('ul', { className: 'lender-list' },
                                eligibleBanks.length > 0
                                    ? eligibleBanks.map(lender => el('li', { key: lender.name }, lender.name))
                                    : el('li', { style: { background: 'none', color: '#9ca3af' } }, 'None')
                             )
                        )
                    );
                })
            )
        )
    );
};
