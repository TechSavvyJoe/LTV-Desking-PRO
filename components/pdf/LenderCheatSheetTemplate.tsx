import React from "react";
import type { LenderProfile, LenderTier } from "../../types";

/* Internal staff reference (it prints lender buy rates), never customer
   paper. Same paper system as PdfTemplate.tsx: light tokens only, one sans
   family with tabular numerals, rules instead of fills, no network font
   import, selectors scoped under .lcs-pdf so the <style> tag cannot restyle
   the live app while the PDF renders off-screen.

   Geometry: generateLenderCheatSheetPdf captures a 279.4mm-wide container and
   slices it every 215.9mm (US Letter landscape). Each .lcs-page is exactly
   that size and holds a fixed number of single-line rows, so long lender
   lists continue on further pages instead of being clipped. Height budget
   per page ≈ 169mm of a 195.9mm content box at ROWS_PER_PAGE. */
const FONT_STACK = `"Geist Sans", Inter, ui-sans-serif, system-ui, sans-serif`;

const ROWS_PER_PAGE = 18;
const EMPTY = "—";

const styles = `
  .lcs-pdf,
  .lcs-pdf * {
    box-sizing: border-box;
  }
  .lcs-pdf {
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
  .lcs-pdf h1,
  .lcs-pdf p { margin: 0; }
  .lcs-pdf .lcs-page {
    width: 279.4mm;
    height: 215.9mm;
    padding: 10mm 11mm;
    display: flex;
    flex-direction: column;
    gap: 5mm;
    background: #ffffff;
    break-after: page;
  }
  .lcs-pdf .lcs-page:last-child {
    break-after: auto;
  }
  .lcs-pdf .lcs-page > * {
    flex-shrink: 0;
  }
  .lcs-pdf .topbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8mm;
    align-items: start;
    padding-bottom: 4mm;
    border-bottom: 1px solid #111827;
  }
  .lcs-pdf .brand {
    display: flex;
    align-items: flex-start;
    gap: 3mm;
  }
  .lcs-pdf .mark {
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
  .lcs-pdf h1 {
    font-size: 20pt;
    font-weight: 600;
    line-height: 1.15;
    letter-spacing: -0.01em;
  }
  .lcs-pdf .subtitle {
    margin-top: 1mm;
    color: #4b5563;
  }
  .lcs-pdf .meta {
    color: #4b5563;
    font-size: 9pt;
    line-height: 1.4;
    text-align: right;
  }
  .lcs-pdf table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .lcs-pdf th {
    padding: 0 2mm 1.2mm 0;
    border-bottom: 1px solid #111827;
    color: #4b5563;
    font-size: 9pt;
    font-weight: 600;
    text-align: right;
    vertical-align: bottom;
    white-space: nowrap;
  }
  .lcs-pdf td {
    padding: 1.1mm 2mm 1.1mm 0;
    border-bottom: 1px solid #e5e7eb;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lcs-pdf th:last-child,
  .lcs-pdf td:last-child {
    padding-right: 0;
  }
  .lcs-pdf .text {
    text-align: left;
  }
  .lcs-pdf .lender-name {
    font-weight: 500;
  }
  .lcs-pdf .ltv {
    font-weight: 600;
  }
  .lcs-pdf .empty-row td {
    padding: 20mm 0;
    color: #4b5563;
    text-align: center;
    white-space: normal;
  }
  .lcs-pdf .page-footer {
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
  .lcs-pdf .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 1mm 6mm;
  }
  .lcs-pdf .page-number {
    white-space: nowrap;
  }
`;

const COLUMNS: { label: string; width: string; text?: boolean }[] = [
  { label: "Lender", width: "16%", text: true },
  { label: "FICO", width: "8%" },
  { label: "Model years", width: "9%" },
  { label: "Max miles", width: "7%" },
  { label: "Max term", width: "7%" },
  { label: "FE LTV", width: "8%" },
  { label: "OTD LTV", width: "8%" },
  { label: "Book", width: "6%", text: true },
  { label: "Backend", width: "8%" },
  { label: "Buy rate", width: "8%" },
  { label: "Min income", width: "9%" },
  { label: "Max PTI", width: "6%" },
];

// Helper functions for data aggregation
const getTierValue = (
  tiers: LenderTier[] | undefined,
  key: keyof LenderTier,
  mode: "max" | "min" | "range" = "max",
  formatter: (val: number) => string = (v) => v.toString()
): string => {
  if (!tiers || !Array.isArray(tiers)) return EMPTY;
  const values = tiers.map((t) => t[key] as number).filter((v) => Number.isFinite(v));
  if (values.length === 0) return EMPTY;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (mode === "max") return formatter(max);
  if (mode === "min") return formatter(min);
  if (min === max) return formatter(min);
  return `${formatter(min)}–${formatter(max)}`;
};

const getFicoRange = (tiers: LenderTier[] | undefined): string => {
  if (!tiers || !Array.isArray(tiers)) return EMPTY;
  const mins = tiers.map((t) => t.minFico).filter((v): v is number => Number.isFinite(v));
  const maxs = tiers.map((t) => t.maxFico).filter((v): v is number => Number.isFinite(v));
  if (mins.length === 0 && maxs.length === 0) return EMPTY;
  const overallMin = mins.length > 0 ? Math.min(...mins) : null;
  const overallMax = maxs.length > 0 ? Math.max(...maxs) : null;
  if (overallMin !== null && overallMax !== null && overallMin !== overallMax)
    return `${overallMin}–${overallMax}`;
  if (overallMin !== null) return `${overallMin}+`;
  if (overallMax !== null) return `≤${overallMax}`;
  return EMPTY;
};

const getYearRange = (tiers: LenderTier[] | undefined): string => {
  if (!tiers || !Array.isArray(tiers)) return EMPTY;
  const mins = tiers.map((t) => t.minYear).filter((v): v is number => Number.isFinite(v));
  const maxs = tiers.map((t) => t.maxYear).filter((v): v is number => Number.isFinite(v));
  if (mins.length === 0 && maxs.length === 0) return EMPTY;
  const overallMin = mins.length > 0 ? Math.min(...mins) : null;
  const overallMax = maxs.length > 0 ? Math.max(...maxs) : null;
  if (overallMin !== null && overallMax !== null && overallMin !== overallMax)
    return `${overallMin}–${overallMax}`;
  if (overallMin !== null) return `${overallMin}+`;
  if (overallMax !== null) return `≤${overallMax}`;
  return EMPTY;
};

const percent = (v: number): string => `${v}%`;

const aggregate = (profile: LenderProfile) => {
  const frontEndLtv = getTierValue(profile.tiers, "frontEndLtv", "max", percent);
  return {
    key: profile.id || profile.name,
    name: profile.name,
    ficoRange: getFicoRange(profile.tiers),
    yearRange: getYearRange(profile.tiers),
    maxMileage: getTierValue(profile.tiers, "maxMileage", "max", (v) =>
      v >= 1000 ? `${Math.round(v / 1000)}K` : String(v)
    ),
    maxTerm: getTierValue(profile.tiers, "maxTerm", "max", (v) => `${v} mo`),
    // LTV fields - prioritize specific fields, fall back to maxLtv
    frontEndLtv:
      frontEndLtv !== EMPTY ? frontEndLtv : getTierValue(profile.tiers, "maxLtv", "max", percent),
    otdLtv: getTierValue(profile.tiers, "otdLtv", "max", percent),
    book: profile.bookValueSource || "Trade",
    maxBackend: getTierValue(profile.tiers, "maxBackend", "max", (v) =>
      v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`
    ),
    baseRate: getTierValue(profile.tiers, "baseInterestRate", "min", (v) => `${v.toFixed(2)}%`),
    incomeDisplay: profile.minIncome ? `$${profile.minIncome.toLocaleString()}` : EMPTY,
    ptiDisplay: profile.maxPti ? `${profile.maxPti}%` : EMPTY,
  };
};

const paginate = <T,>(rows: T[], size: number): T[][] => {
  if (rows.length === 0) return [[]];
  const pages: T[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    pages.push(rows.slice(start, start + size));
  }
  return pages;
};

interface LenderCheatSheetTemplateProps {
  profiles: LenderProfile[];
}

export const LenderCheatSheetTemplate: React.FC<LenderCheatSheetTemplateProps> = ({ profiles }) => {
  const safeProfiles = Array.isArray(profiles)
    ? profiles.filter((p) => p && typeof p === "object")
    : [];

  // Sort by lender name for easy lookup
  const sortedProfiles = [...safeProfiles].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );
  const pages = paginate(sortedProfiles.map(aggregate), ROWS_PER_PAGE);

  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const lenderCount = `${sortedProfiles.length} lender${sortedProfiles.length === 1 ? "" : "s"}`;

  return (
    <div className="lcs-pdf">
      <style>{styles}</style>
      {pages.map((rows, pageIndex) => (
        <section className="lcs-page" key={pageIndex}>
          <header className="topbar">
            <div className="brand">
              <div className="mark" role="img" aria-label="LTV Desking PRO">
                LTV
              </div>
              <div>
                <h1>Lender quick reference</h1>
                <p className="subtitle">{lenderCount}</p>
              </div>
            </div>
            <div className="meta">{dateStr}</div>
          </header>

          <table>
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.label}
                    className={column.text ? "text" : undefined}
                    style={{ width: column.width }}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={COLUMNS.length}>
                    No lender profiles available. Upload rate sheets to populate.
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.key}>
                    <td className="text lender-name" title={p.name}>
                      {p.name}
                    </td>
                    <td>{p.ficoRange}</td>
                    <td>{p.yearRange}</td>
                    <td>{p.maxMileage}</td>
                    <td>{p.maxTerm}</td>
                    <td className="ltv">{p.frontEndLtv}</td>
                    <td className="ltv">{p.otdLtv}</td>
                    <td className="text">{p.book}</td>
                    <td>{p.maxBackend}</td>
                    <td>{p.baseRate}</td>
                    <td>{p.incomeDisplay}</td>
                    <td>{p.ptiDisplay}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <footer className="page-footer">
            <div className="legend">
              <span>FE LTV = front-end LTV (before products)</span>
              <span>OTD LTV = out-the-door LTV (total)</span>
              <span>Confidential. Verify with official rate sheets.</span>
              <span>LTV Desking PRO</span>
            </div>
            <span className="page-number">{`Page ${pageIndex + 1} of ${pages.length}`}</span>
          </footer>
        </section>
      ))}
    </div>
  );
};
