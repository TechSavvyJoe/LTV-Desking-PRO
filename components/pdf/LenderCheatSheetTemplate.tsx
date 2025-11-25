import React from 'react';
import type { LenderProfile, LenderTier } from '../../types';

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
        font-size: 7pt; /* Smaller base font for dense table */
    }
    .page {
        width: 297mm; /* A4 Landscape */
        height: 210mm;
        padding: 1cm;
        box-sizing: border-box;
        background-color: white;
        display: flex;
        flex-direction: column;
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5cm;
        padding-bottom: 0.5cm;
        border-bottom: 2px solid #374151;
    }
    .header h1 {
        font-size: 16pt;
        font-weight: 700;
        margin: 0;
    }
    .header p {
        font-size: 9pt;
        color: #4b5563;
        margin: 0;
    }
    .content {
        flex-grow: 1;
        overflow: hidden; /* Prevent content from breaking page layout */
    }
    .cheat-sheet-table {
        width: 100%;
        border-collapse: collapse;
    }
    .cheat-sheet-table th, .cheat-sheet-table td {
        border: 1px solid #e5e7eb;
        padding: 6px 8px;
        text-align: left;
        vertical-align: top;
    }
    .cheat-sheet-table th {
        background-color: #f9fafb;
        font-weight: 600;
        color: #374151;
        font-size: 8pt;
    }
    .cheat-sheet-table tr:nth-child(even) {
        background-color: #f9fafb;
    }
    .lender-name {
        font-weight: 700;
        font-size: 10pt;
        color: #111827;
    }
    .book-source {
        font-size: 7pt;
        font-weight: 500;
        padding: 2px 6px;
        border-radius: 4px;
        background-color: #e5e7eb;
        display: inline-block;
        margin-top: 4px;
    }
    .notes-list {
        margin: 0;
        padding-left: 14px;
        list-style: disc;
        line-height: 1.4;
    }
    .footer {
        margin-top: auto;
        padding-top: 0.5cm;
        border-top: 1px solid #e5e7eb;
        font-size: 8pt;
        color: #6b7280;
        text-align: center;
    }
`;

// Helper functions for data aggregation
const getTierValueRange = (tiers: LenderTier[] | undefined, key: keyof LenderTier, formatter: (val: number) => string = v => v.toString()): string => {
    if (!tiers || !Array.isArray(tiers)) return 'N/A';
    const values = tiers
        .map(t => t[key] as number)
        .filter(v => Number.isFinite(v));
    if (values.length === 0) return 'N/A';
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return formatter(min);
    return `${formatter(min)} - ${formatter(max)}`;
};

const getTierMinMaxRange = (tiers: LenderTier[] | undefined, minKey: keyof LenderTier, maxKey: keyof LenderTier, prefix = '', suffix = ''): string => {
    if (!tiers || !Array.isArray(tiers)) return 'N/A';
    const minValues = tiers.map(t => t[minKey] as number).filter(v => Number.isFinite(v));
    const maxValues = tiers.map(t => t[maxKey] as number).filter(v => Number.isFinite(v));
    
    if (minValues.length === 0 && maxValues.length === 0) return 'N/A';

    const overallMin = minValues.length > 0 ? Math.min(...minValues) : null;
    const overallMax = maxValues.length > 0 ? Math.max(...maxValues) : null;

    const format = (v: number | null) => v !== null ? v.toLocaleString() : '';

    if (overallMin !== null && overallMax === null) return `${prefix}${format(overallMin)}${suffix}+`;
    if (overallMin === null && overallMax !== null) return `Up to ${prefix}${format(overallMax)}${suffix}`;
    if (overallMin !== null && overallMax !== null) {
        if (overallMin === overallMax) return `${prefix}${format(overallMin)}${suffix}`;
        return `${prefix}${format(overallMin)} - ${prefix}${format(overallMax)}${suffix}`;
    }
    return 'N/A';
};

interface LenderCheatSheetTemplateProps {
    profiles: LenderProfile[];
}

const summarizeTiers = (tiers: LenderTier[] | undefined): string[] => {
    if (!tiers || !Array.isArray(tiers) || tiers.length === 0) return ['No tiers defined'];
    return tiers.slice(0, 5).map(t => {
        const parts: string[] = [];
        if (Number.isFinite(t.minFico) || Number.isFinite(t.maxFico)) {
            if (Number.isFinite(t.minFico) && Number.isFinite(t.maxFico)) parts.push(`FICO ${t.minFico}-${t.maxFico}`);
            else if (Number.isFinite(t.minFico)) parts.push(`FICO ≥ ${t.minFico}`);
            else if (Number.isFinite(t.maxFico)) parts.push(`FICO ≤ ${t.maxFico}`);
        }
        if (Number.isFinite(t.minYear) || Number.isFinite(t.maxYear)) {
            const minY = Number.isFinite(t.minYear) ? t.minYear : 'any';
            const maxY = Number.isFinite(t.maxYear) ? t.maxYear : 'newer';
            parts.push(`Years ${minY}-${maxY}`);
        }
        if (Number.isFinite(t.maxMileage)) parts.push(`≤${Number(t.maxMileage).toLocaleString()} mi`);
        if (Number.isFinite(t.maxLtv)) parts.push(`LTV ${t.maxLtv}%`);
        if (Number.isFinite(t.maxTerm)) parts.push(`Term ≤${t.maxTerm}`);
        if (Number.isFinite(t.minAmountFinanced) || Number.isFinite(t.maxAmountFinanced)) {
            const minA = Number.isFinite(t.minAmountFinanced) ? `$${Number(t.minAmountFinanced).toLocaleString()}` : '';
            const maxA = Number.isFinite(t.maxAmountFinanced) ? `$${Number(t.maxAmountFinanced).toLocaleString()}` : '';
            const label = minA && maxA ? `${minA}-${maxA}` : (minA || (maxA ? `Up to ${maxA}` : ''));
            if (label) parts.push(`Fin ${label}`);
        }
        return `${t.name || 'Tier'}: ${parts.join(' • ') || 'See sheet'}`;
    });
};

export const LenderCheatSheetTemplate: React.FC<LenderCheatSheetTemplateProps> = ({ profiles }) => {
    const safeProfiles = Array.isArray(profiles) ? profiles.filter(p => p && typeof p === 'object') : [];

    const aggregatedData = safeProfiles.map(profile => ({
        ...profile,
        ficoRange: getTierMinMaxRange(profile.tiers, 'minFico', 'maxFico'),
        yearRange: getTierMinMaxRange(profile.tiers, 'minYear', 'maxYear'),
        mileageRange: getTierMinMaxRange(profile.tiers, 'minMileage', 'maxMileage'),
        ltvRange: getTierValueRange(profile.tiers, 'maxLtv', v => `${v}%`),
        termRange: getTierValueRange(profile.tiers, 'maxTerm', v => `${v}mo`),
        amountRange: getTierMinMaxRange(profile.tiers, 'minAmountFinanced', 'maxAmountFinanced', '$'),
        tierSummary: summarizeTiers(profile.tiers)
    }));

    return el('div', { className: 'page' },
        el('style', null, styles),
        el('header', { className: 'header' },
            el('h1', null, 'Lender Program Cheat Sheet'),
            el('p', null, `Generated on: ${new Date().toLocaleDateString()}`)
        ),
        el('div', { className: 'content' },
            el('table', { className: 'cheat-sheet-table' },
                el('thead', null,
                    el('tr', null,
                        el('th', { style: { width: '18%' } }, 'Lender'),
                        el('th', { style: { width: '10%' } }, 'FICO Range'),
                        el('th', { style: { width: '10%' } }, 'Year Range'),
                        el('th', { style: { width: '12%' } }, 'Mileage'),
                        el('th', { style: { width: '10%' } }, 'Max LTV'),
                        el('th', { style: { width: '10%' } }, 'Max Term'),
                        el('th', { style: { width: '12%' } }, 'Fin. Amount'),
                        el('th', null, 'Key Requirements')
                    )
                ),
                el('tbody', null,
                    aggregatedData.length === 0
                        ? el('tr', null,
                            el('td', { colSpan: 8, style: { textAlign: 'center', padding: '12px', color: '#6b7280' } }, 'No lender profiles available.'))
                        : aggregatedData.map(p => el('tr', { key: p.id || p.name },
                            el('td', null,
                                el('div', { className: 'lender-name' }, p.name),
                                el('div', { className: 'book-source' }, `Book: ${p.bookValueSource || 'Trade'}`)
                            ),
                            el('td', null, p.ficoRange),
                            el('td', null, p.yearRange),
                            el('td', null, p.mileageRange),
                            el('td', null, p.ltvRange),
                            el('td', null, p.termRange),
                            el('td', null, p.amountRange),
                            el('td', null,
                                el('ul', { className: 'notes-list' },
                                    p.minIncome ? el('li', null, `Min Income: $${p.minIncome.toLocaleString()}`) : null,
                                    p.maxPti ? el('li', null, `Max PTI: ${p.maxPti}%`) : null,
                                    ...p.tierSummary.map((note, idx) => el('li', { key: `${p.id || p.name}-tier-${idx}` }, note))
                                )
                            )
                        ))
                )
            )
        ),
        el('footer', { className: 'footer' },
             'This is a summary for quick reference only. Please refer to the official lender rate sheets for complete and current guidelines.'
        )
    );
};
