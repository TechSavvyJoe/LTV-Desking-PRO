import React from "react";
import type { LenderProfile, LenderTier } from "../../types";

const el = React.createElement;
const logoSvg = encodeURIComponent(
  `<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="96" height="96" rx="18" fill="url(#g)"/><path d="M26 49c0-10.5 8.5-19 19-19h6c10.5 0 19 8.5 19 19s-8.5 19-19 19h-6c-10.5 0-19-8.5-19-19Z" stroke="white" stroke-width="6"/><path d="M32 49c0-7.2 5.8-13 13-13h6c7.2 0 13 5.8 13 13s-5.8 13-13 13h-6c-7.2 0-13-5.8-13-13Z" stroke="white" stroke-width="6" opacity="0.6"/><defs><linearGradient id="g" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse"><stop stop-color="#0ea5e9"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`
);

const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; }
    body {
        font-family: 'Inter', -apple-system, sans-serif;
        margin: 0;
        padding: 0;
        background-color: #fff;
        color: #1f2937;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        font-size: 7pt;
    }
    .page {
        width: 297mm;
        height: 210mm;
        padding: 8mm;
        display: flex;
        flex-direction: column;
        position: relative;
        overflow: hidden;
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 4mm;
        border-bottom: 2px solid #3b82f6;
        margin-bottom: 3mm;
    }
    .brand {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .logo { width: 24px; height: 24px; border-radius: 4px; }
    .header h1 {
        font-size: 14pt;
        font-weight: 700;
        margin: 0;
        background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }
    .meta { font-size: 7pt; color: #6b7280; text-align: right; }
    .meta strong { color: #374151; }
    
    .table-container { flex-grow: 1; overflow: hidden; }
    
    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 6.5pt;
        table-layout: fixed;
    }
    th {
        padding: 4px 3px;
        background: linear-gradient(135deg, #1e40af 0%, #4338ca 100%);
        color: white;
        font-weight: 600;
        font-size: 5.5pt;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        white-space: nowrap;
        text-align: center;
    }
    th:first-child { text-align: left; padding-left: 6px; }
    td {
        padding: 3px 3px;
        border-bottom: 1px solid #e5e7eb;
        text-align: center;
        vertical-align: middle;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    td:first-child { text-align: left; padding-left: 6px; }
    tr:nth-child(even) { background-color: #f8fafc; }
    tr:hover { background-color: #eff6ff; }
    
    .lender-name {
        font-weight: 700;
        font-size: 7pt;
        color: #1e40af;
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .highlight { 
        color: #059669; 
        font-weight: 600; 
    }
    .badge {
        display: inline-block;
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 5.5pt;
        font-weight: 600;
    }
    .badge-trade { background-color: #dcfce7; color: #166534; }
    .badge-retail { background-color: #fef3c7; color: #92400e; }
    .badge-na { background-color: #f3f4f6; color: #6b7280; }
    
    .footer {
        margin-top: auto;
        padding-top: 3mm;
        border-top: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        font-size: 6pt;
        color: #9ca3af;
    }
    .legend {
        display: flex;
        gap: 12px;
    }
    .legend-item { display: flex; align-items: center; gap: 3px; }
    .legend-dot { width: 6px; height: 6px; border-radius: 50%; }
`;

// Helper functions for data aggregation
const getTierValue = (
  tiers: LenderTier[] | undefined,
  key: keyof LenderTier,
  mode: "max" | "min" | "range" = "max",
  formatter: (val: number) => string = (v) => v.toString()
): string => {
  if (!tiers || !Array.isArray(tiers)) return "-";
  const values = tiers
    .map((t) => t[key] as number)
    .filter((v) => Number.isFinite(v));
  if (values.length === 0) return "-";
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (mode === "max") return formatter(max);
  if (mode === "min") return formatter(min);
  if (min === max) return formatter(min);
  return `${formatter(min)}-${formatter(max)}`;
};

const getFicoRange = (tiers: LenderTier[] | undefined): string => {
  if (!tiers || !Array.isArray(tiers)) return "-";
  const mins = tiers
    .map((t) => t.minFico)
    .filter((v): v is number => Number.isFinite(v));
  const maxs = tiers
    .map((t) => t.maxFico)
    .filter((v): v is number => Number.isFinite(v));
  if (mins.length === 0 && maxs.length === 0) return "-";
  const overallMin = mins.length > 0 ? Math.min(...mins) : null;
  const overallMax = maxs.length > 0 ? Math.max(...maxs) : null;
  if (overallMin !== null && overallMax !== null && overallMin !== overallMax)
    return `${overallMin}-${overallMax}`;
  if (overallMin !== null) return `${overallMin}+`;
  if (overallMax !== null) return `≤${overallMax}`;
  return "-";
};

const getYearRange = (tiers: LenderTier[] | undefined): string => {
  if (!tiers || !Array.isArray(tiers)) return "-";
  const mins = tiers
    .map((t) => t.minYear)
    .filter((v): v is number => Number.isFinite(v));
  const maxs = tiers
    .map((t) => t.maxYear)
    .filter((v): v is number => Number.isFinite(v));
  if (mins.length === 0 && maxs.length === 0) return "-";
  const overallMin = mins.length > 0 ? Math.min(...mins) : null;
  const overallMax = maxs.length > 0 ? Math.max(...maxs) : null;
  if (overallMin !== null && overallMax !== null && overallMin !== overallMax)
    return `${overallMin}-${overallMax}`;
  if (overallMin !== null) return `${overallMin}+`;
  if (overallMax !== null) return `≤${String(overallMax).slice(-2)}`;
  return "-";
};

interface LenderCheatSheetTemplateProps {
  profiles: LenderProfile[];
}

export const LenderCheatSheetTemplate: React.FC<
  LenderCheatSheetTemplateProps
> = ({ profiles }) => {
  const safeProfiles = Array.isArray(profiles)
    ? profiles.filter((p) => p && typeof p === "object")
    : [];

  // Sort by lender name for easy lookup
  const sortedProfiles = [...safeProfiles].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );

  const aggregatedData = sortedProfiles.map((profile) => ({
    ...profile,
    ficoRange: getFicoRange(profile.tiers),
    yearRange: getYearRange(profile.tiers),
    maxMileage: getTierValue(profile.tiers, "maxMileage", "max", (v) =>
      v >= 1000 ? `${Math.round(v / 1000)}K` : String(v)
    ),
    maxTerm: getTierValue(profile.tiers, "maxTerm", "max", (v) => `${v}mo`),
    // LTV fields - prioritize specific fields, fall back to maxLtv
    frontEndLtv:
      getTierValue(profile.tiers, "frontEndLtv", "max", (v) => `${v}%`) !== "-"
        ? getTierValue(profile.tiers, "frontEndLtv", "max", (v) => `${v}%`)
        : getTierValue(profile.tiers, "maxLtv", "max", (v) => `${v}%`),
    otdLtv:
      getTierValue(profile.tiers, "otdLtv", "max", (v) => `${v}%`) !== "-"
        ? getTierValue(profile.tiers, "otdLtv", "max", (v) => `${v}%`)
        : "-",
    maxBackend: getTierValue(profile.tiers, "maxBackend", "max", (v) =>
      v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`
    ),
    baseRate: getTierValue(
      profile.tiers,
      "baseInterestRate",
      "min",
      (v) => `${v.toFixed(2)}%`
    ),
    incomeDisplay: profile.minIncome
      ? `$${profile.minIncome.toLocaleString()}`
      : "-",
    ptiDisplay: profile.maxPti ? `${profile.maxPti}%` : "-",
  }));

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return el(
    "div",
    { className: "page" },
    el("style", null, styles),

    // Header
    el(
      "header",
      { className: "header" },
      el(
        "div",
        { className: "brand" },
        el("img", {
          className: "logo",
          src: `data:image/svg+xml,${logoSvg}`,
          alt: "LTV Desking PRO",
        }),
        el("h1", null, "Lender Quick Reference")
      ),
      el(
        "div",
        { className: "meta" },
        el(
          "div",
          null,
          el("strong", null, `${sortedProfiles.length}`),
          " Lenders"
        ),
        el("div", null, dateStr)
      )
    ),

    // Main Table
    el(
      "div",
      { className: "table-container" },
      el(
        "table",
        null,
        el(
          "thead",
          null,
          el(
            "tr",
            null,
            el("th", { style: { width: "13%" } }, "Lender"),
            el("th", { style: { width: "8%" } }, "FICO"),
            el("th", { style: { width: "8%" } }, "Years"),
            el("th", { style: { width: "7%" } }, "Miles"),
            el("th", { style: { width: "6%" } }, "Term"),
            el("th", { style: { width: "8%" } }, "FE LTV"),
            el("th", { style: { width: "8%" } }, "OTD LTV"),
            el("th", { style: { width: "7%" } }, "Book"),
            el("th", { style: { width: "8%" } }, "Backend"),
            el("th", { style: { width: "8%" } }, "Buy Rate"),
            el("th", { style: { width: "9%" } }, "Min Inc"),
            el("th", { style: { width: "7%" } }, "Max PTI")
          )
        ),
        el(
          "tbody",
          null,
          aggregatedData.length === 0
            ? el(
                "tr",
                null,
                el(
                  "td",
                  {
                    colSpan: 12,
                    style: { textAlign: "center", padding: "20mm" },
                  },
                  "No lender profiles available. Upload rate sheets to populate."
                )
              )
            : aggregatedData.map((p) =>
                el(
                  "tr",
                  { key: p.id || p.name },
                  el(
                    "td",
                    null,
                    el(
                      "div",
                      { className: "lender-name", title: p.name },
                      p.name
                    )
                  ),
                  el("td", null, p.ficoRange),
                  el("td", null, p.yearRange),
                  el("td", null, p.maxMileage),
                  el("td", null, p.maxTerm),
                  el("td", { className: "highlight" }, p.frontEndLtv),
                  el("td", { className: "highlight" }, p.otdLtv),
                  el(
                    "td",
                    null,
                    el(
                      "span",
                      {
                        className: `badge badge-${(
                          p.bookValueSource || "trade"
                        ).toLowerCase()}`,
                      },
                      (p.bookValueSource || "Trade").charAt(0)
                    )
                  ),
                  el("td", null, p.maxBackend),
                  el("td", null, p.baseRate),
                  el("td", null, p.incomeDisplay),
                  el("td", null, p.ptiDisplay)
                )
              )
        )
      )
    ),

    // Footer with legend
    el(
      "footer",
      { className: "footer" },
      el(
        "div",
        { className: "legend" },
        el("span", null, "FE = Front-End LTV (before products)"),
        el("span", null, "OTD = Out-The-Door LTV (total)"),
        el("span", null, "T = Trade Book | R = Retail Book")
      ),
      el(
        "div",
        null,
        "Confidential • Verify with official rate sheets • LTV Desking PRO"
      )
    )
  );
};
