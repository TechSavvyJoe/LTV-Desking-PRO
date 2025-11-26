import React from "react";
import type { LenderProfile, LenderTier } from "../../types";

const el = React.createElement;
const logoSvg = encodeURIComponent(`<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="96" height="96" rx="18" fill="url(#g)"/><path d="M26 49c0-10.5 8.5-19 19-19h6c10.5 0 19 8.5 19 19s-8.5 19-19 19h-6c-10.5 0-19-8.5-19-19Z" stroke="white" stroke-width="6"/><path d="M32 49c0-7.2 5.8-13 13-13h6c7.2 0 13 5.8 13 13s-5.8 13-13 13h-6c-7.2 0-13-5.8-13-13Z" stroke="white" stroke-width="6" opacity="0.6"/><defs><linearGradient id="g" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse"><stop stop-color="#0ea5e9"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`);

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
        padding: 0.8cm;
        box-sizing: border-box;
        background-color: white;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
    }
    .watermark {
        position: absolute;
        inset: 1cm;
        opacity: 0.04;
        font-size: 82pt;
        font-weight: 800;
        color: #0ea5e9;
        letter-spacing: 4px;
        transform: rotate(-16deg);
        pointer-events: none;
        user-select: none;
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.35cm;
        padding-bottom: 0.35cm;
        border-bottom: 2px solid #374151;
    }
    .brand {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .logo {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: linear-gradient(135deg, #0ea5e9, #6366f1);
        color: white;
        font-weight: 800;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        letter-spacing: -0.5px;
        box-shadow: 0 6px 14px rgba(14,165,233,0.25);
        font-size: 11pt;
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
        column-count: 3;
        column-gap: 8px;
        padding-top: 6px;
    }
    .card {
        break-inside: avoid;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 6px 7px;
        margin-bottom: 8px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 4px;
    }
    .lender-name {
        font-weight: 700;
        font-size: 9pt;
        color: #111827;
        margin: 0;
        padding: 0;
    }
    .badge {
        font-size: 6.5pt;
        font-weight: 600;
        padding: 2px 5px;
        border-radius: 4px;
        background-color: #e5e7eb;
    }
    .row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 8px;
        margin-bottom: 4px;
        line-height: 1.35;
    }
    .label {
        font-weight: 600;
        color: #374151;
    }
    .value {
        color: #111827;
    }
    .programs {
        font-size: 6.5pt;
        color: #1f2937;
        line-height: 1.25;
        margin-top: 4px;
    }
    .footer {
        margin-top: 4px;
        padding-top: 4px;
        border-top: 1px solid #e5e7eb;
        font-size: 7pt;
        color: #6b7280;
        text-align: center;
    }
`;

// Helper functions for data aggregation
const getTierValueRange = (
  tiers: LenderTier[] | undefined,
  key: keyof LenderTier,
  formatter: (val: number) => string = (v) => v.toString()
): string => {
  if (!tiers || !Array.isArray(tiers)) return "N/A";
  const values = tiers
    .map((t) => t[key] as number)
    .filter((v) => Number.isFinite(v));
  if (values.length === 0) return "N/A";
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
  if (!tiers || !Array.isArray(tiers)) return "N/A";
  const minValues = tiers
    .map((t) => t[minKey] as number)
    .filter((v) => Number.isFinite(v));
  const maxValues = tiers
    .map((t) => t[maxKey] as number)
    .filter((v) => Number.isFinite(v));

  if (minValues.length === 0 && maxValues.length === 0) return "N/A";

  const overallMin = minValues.length > 0 ? Math.min(...minValues) : null;
  const overallMax = maxValues.length > 0 ? Math.max(...maxValues) : null;

  const format = (v: number | null) => (v !== null ? v.toLocaleString() : "");

  if (overallMin !== null && overallMax === null)
    return `${prefix}${format(overallMin)}${suffix}+`;
  if (overallMin === null && overallMax !== null)
    return `Up to ${prefix}${format(overallMax)}${suffix}`;
  if (overallMin !== null && overallMax !== null) {
    if (overallMin === overallMax)
      return `${prefix}${format(overallMin)}${suffix}`;
    return `${prefix}${format(overallMin)} - ${prefix}${format(
      overallMax
    )}${suffix}`;
  }
  return "N/A";
};

interface LenderCheatSheetTemplateProps {
  profiles: LenderProfile[];
}

const summarizeTiers = (tiers: LenderTier[] | undefined): string[] => {
  if (!tiers || !Array.isArray(tiers) || tiers.length === 0)
    return ["No tiers defined"];
  return tiers.map((t) => {
    const parts: string[] = [];
    if (Number.isFinite(t.minFico) || Number.isFinite(t.maxFico)) {
      if (Number.isFinite(t.minFico) && Number.isFinite(t.maxFico))
        parts.push(`FICO ${t.minFico}-${t.maxFico}`);
      else if (Number.isFinite(t.minFico)) parts.push(`FICO ≥ ${t.minFico}`);
      else if (Number.isFinite(t.maxFico)) parts.push(`FICO ≤ ${t.maxFico}`);
    }
    if (Number.isFinite(t.minYear) || Number.isFinite(t.maxYear)) {
      const minY = Number.isFinite(t.minYear) ? t.minYear : "any";
      const maxY = Number.isFinite(t.maxYear) ? t.maxYear : "newer";
      parts.push(`Years ${minY}-${maxY}`);
    }
    if (Number.isFinite(t.maxMileage))
      parts.push(`≤${Number(t.maxMileage).toLocaleString()} mi`);
    if (Number.isFinite(t.maxLtv)) parts.push(`LTV ${t.maxLtv}%`);
    if (Number.isFinite(t.maxTerm)) parts.push(`Term ≤${t.maxTerm}`);
    if (
      Number.isFinite(t.minAmountFinanced) ||
      Number.isFinite(t.maxAmountFinanced)
    ) {
      const minA = Number.isFinite(t.minAmountFinanced)
        ? `$${Number(t.minAmountFinanced).toLocaleString()}`
        : "";
      const maxA = Number.isFinite(t.maxAmountFinanced)
        ? `$${Number(t.maxAmountFinanced).toLocaleString()}`
        : "";
      const label =
        minA && maxA
          ? `${minA}-${maxA}`
          : minA || (maxA ? `Up to ${maxA}` : "");
      if (label) parts.push(`Fin ${label}`);
    }
    return `${t.name || "Tier"}: ${parts.join(" • ") || "See sheet"}`;
  });
};

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
    termRange: getTierValueRange(profile.tiers, "maxTerm", (v) => `${v}mo`),
    amountRange: getTierMinMaxRange(
      profile.tiers,
      "minAmountFinanced",
      "maxAmountFinanced",
      "$"
    ),
    tierSummary: summarizeTiers(profile.tiers),
    tierSummaryText: summarizeTiers(profile.tiers).join(" | "),
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
        el("img", { className: "logo", src: `data:image/svg+xml,${logoSvg}`, alt: "OSHIP" }),
        el("div", null, el("h1", null, "OSHIP Lender Cheat Sheet"))
      ),
      el("p", null, `Generated on: ${new Date().toLocaleDateString()}`)
    ),
    el(
      "div",
      { className: "content" },
      aggregatedData.length === 0
        ? el("div", { className: "card" }, "No lender profiles available.")
        : aggregatedData.map((p) =>
            el(
              "div",
              { key: p.id || p.name, className: "card" },
              el(
                "div",
                { className: "card-header" },
                el("div", { className: "lender-name" }, p.name),
                el(
                  "span",
                  { className: "badge" },
                  `Book: ${p.bookValueSource || "Trade"}`
                )
              ),
              el(
                "div",
                { className: "row" },
                el("span", { className: "label" }, "Income:"),
                el(
                  "span",
                  { className: "value" },
                  p.minIncome ? `$${p.minIncome.toLocaleString()}` : "N/A"
                ),
                el("span", { className: "label" }, "PTI:"),
                el(
                  "span",
                  { className: "value" },
                  p.maxPti ? `${p.maxPti}%` : "N/A"
                )
              ),
              el(
                "div",
                { className: "row" },
                el("span", { className: "label" }, "FICO:"),
                el("span", { className: "value" }, p.ficoRange),
                el("span", { className: "label" }, "Years:"),
                el("span", { className: "value" }, p.yearRange)
              ),
              el(
                "div",
                { className: "row" },
                el("span", { className: "label" }, "Mileage:"),
                el("span", { className: "value" }, p.mileageRange),
                el("span", { className: "label" }, "LTV:"),
                el("span", { className: "value" }, p.ltvRange),
                el("span", { className: "label" }, "Term:"),
                el("span", { className: "value" }, p.termRange)
              ),
              el(
                "div",
                { className: "row" },
                el("span", { className: "label" }, "Fin Amt:"),
                el("span", { className: "value" }, p.amountRange)
              ),
              el(
                "div",
                { className: "programs" },
                p.tierSummaryText || "No tiers defined"
              )
            )
          )
    ),
    el(
      "footer",
      { className: "footer" },
      "This is a summary for quick reference only. Please refer to the official lender rate sheets for complete and current guidelines."
    )
  );
};
