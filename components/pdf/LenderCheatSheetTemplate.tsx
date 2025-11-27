import React from "react";
import type { LenderProfile, LenderTier } from "../../types";

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
        width: 297mm; /* A4 Landscape */
        height: 210mm;
        padding: 1cm;
        box-sizing: border-box;
        background-color: white;
        display: flex;
        flex-direction: column;
        position: relative;
    }
    .watermark {
        position: absolute;
        inset: 1cm;
        opacity: 0.03;
        font-size: 120pt;
        font-weight: 800;
        color: #0ea5e9;
        display: flex;
        align-items: center;
        justify-content: center;
        transform: rotate(-10deg);
        pointer-events: none;
        user-select: none;
        z-index: 0;
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5cm;
        padding-bottom: 0.25cm;
        border-bottom: 2px solid #e5e7eb;
        z-index: 1;
    }
    .brand {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .logo {
        width: 32px;
        height: 32px;
        border-radius: 6px;
    }
    .header h1 {
        font-size: 18pt;
        font-weight: 700;
        margin: 0;
        color: #111827;
    }
    .header p {
        font-size: 9pt;
        color: #6b7280;
        margin: 0;
    }
    .table-container {
        flex-grow: 1;
        z-index: 1;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 8.5pt;
    }
    th {
        text-align: left;
        padding: 8px 12px;
        background-color: #f3f4f6;
        color: #374151;
        font-weight: 600;
        border-bottom: 2px solid #e5e7eb;
        text-transform: uppercase;
        font-size: 7.5pt;
        letter-spacing: 0.05em;
    }
    td {
        padding: 8px 12px;
        border-bottom: 1px solid #e5e7eb;
        color: #1f2937;
        vertical-align: middle;
    }
    tr:nth-child(even) {
        background-color: #f9fafb;
    }
    .lender-name {
        font-weight: 700;
        color: #111827;
        font-size: 9.5pt;
    }
    .badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 4px;
        background-color: #e0f2fe;
        color: #0369a1;
        font-size: 7.5pt;
        font-weight: 600;
    }
    .footer {
        margin-top: auto;
        padding-top: 0.5cm;
        border-top: 1px solid #e5e7eb;
        font-size: 8pt;
        color: #9ca3af;
        text-align: center;
        z-index: 1;
    }
`;

// Helper functions for data aggregation
const getTierValueRange = (
  tiers: LenderTier[] | undefined,
  key: keyof LenderTier,
  formatter: (val: number) => string = (v) => v.toString()
): string => {
  if (!tiers || !Array.isArray(tiers)) return "-";
  const values = tiers
    .map((t) => t[key] as number)
    .filter((v) => Number.isFinite(v));
  if (values.length === 0) return "-";
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return formatter(min);
  return `${formatter(min)} - ${formatter(max)}`;
};

const getTierMinMaxRange = (
  tiers: LenderTier[] | undefined,
  minKey: keyof LenderTier,
  maxKey: keyof LenderTier,
  prefix = "",
  suffix = ""
): string => {
  if (!tiers || !Array.isArray(tiers)) return "-";
  const minValues = tiers
    .map((t) => t[minKey] as number)
    .filter((v) => Number.isFinite(v));
  const maxValues = tiers
    .map((t) => t[maxKey] as number)
    .filter((v) => Number.isFinite(v));

  if (minValues.length === 0 && maxValues.length === 0) return "-";

  const overallMin = minValues.length > 0 ? Math.min(...minValues) : null;
  const overallMax = maxValues.length > 0 ? Math.max(...maxValues) : null;

  const format = (v: number | null) => (v !== null ? v.toLocaleString() : "");

  if (overallMin !== null && overallMax === null)
    return `${prefix}${format(overallMin)}${suffix}+`;
  if (overallMin === null && overallMax !== null)
    return `< ${prefix}${format(overallMax)}${suffix}`;
  if (overallMin !== null && overallMax !== null) {
    if (overallMin === overallMax)
      return `${prefix}${format(overallMin)}${suffix}`;
    return `${prefix}${format(overallMin)} - ${prefix}${format(
      overallMax
    )}${suffix}`;
  }
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

  const aggregatedData = safeProfiles.map((profile) => ({
    ...profile,
    ficoRange: getTierMinMaxRange(profile.tiers, "minFico", "maxFico"),
    yearRange: getTierMinMaxRange(profile.tiers, "minYear", "maxYear"),
    mileageRange: getTierMinMaxRange(profile.tiers, "minMileage", "maxMileage"),
    ltvRange: getTierValueRange(profile.tiers, "maxLtv", (v) => `${v}%`),
    incomeDisplay: profile.minIncome
      ? `$${profile.minIncome.toLocaleString()}+`
      : "-",
  }));

  return el(
    "div",
    { className: "page" },
    el("div", { className: "watermark" }, "OSHIP"),
    el("style", null, styles),
    el(
      "header",
      { className: "header" },
      el(
        "div",
        { className: "brand" },
        el("img", {
          className: "logo",
          src: `data:image/svg+xml,${logoSvg}`,
          alt: "OSHIP",
        }),
        el("div", null, el("h1", null, "Lender Cheat Sheet"))
      ),
      el("p", null, `Generated: ${new Date().toLocaleDateString()}`)
    ),
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
            el("th", { style: { width: "20%" } }, "Lender"),
            el("th", { style: { width: "12%" } }, "FICO Range"),
            el("th", { style: { width: "10%" } }, "Max LTV"),
            el("th", { style: { width: "12%" } }, "Book Source"),
            el("th", { style: { width: "12%" } }, "Years"),
            el("th", { style: { width: "14%" } }, "Max Miles"),
            el("th", { style: { width: "20%" } }, "Min Income")
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
                    colSpan: 7,
                    style: { textAlign: "center", padding: "2cm" },
                  },
                  "No lender profiles available."
                )
              )
            : aggregatedData.map((p) =>
                el(
                  "tr",
                  { key: p.id || p.name },
                  el(
                    "td",
                    null,
                    el("div", { className: "lender-name" }, p.name)
                  ),
                  el("td", null, p.ficoRange),
                  el("td", null, p.ltvRange),
                  el(
                    "td",
                    null,
                    el(
                      "span",
                      { className: "badge" },
                      p.bookValueSource || "Trade"
                    )
                  ),
                  el("td", null, p.yearRange),
                  el("td", null, p.mileageRange),
                  el("td", null, p.incomeDisplay)
                )
              )
        )
      )
    ),
    el(
      "footer",
      { className: "footer" },
      "Confidential - For Internal Use Only. Refer to official rate sheets for full guidelines."
    )
  );
};
