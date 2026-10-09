import React, { useEffect, useMemo, useState } from "react";
import { DealData, CalculatedVehicle, LenderProfile, FilterData } from "../types";
import { calculateMonthlyPayment } from "../services/calculator";
import { lenderFitForVehicle } from "../services/lenderFit";
import { holdIncompleteFits } from "../services/dealAssessment";
import { EmptyState } from "./common/states";
import * as Icons from "./common/Icons";

interface DealChartsProps {
  dealData: DealData;
  activeVehicle: CalculatedVehicle | null;
}

interface LenderComparisonChartProps extends DealChartsProps {
  lenderProfiles?: LenderProfile[];
  customerFilters?: FilterData;
}

// ---------------------------------------------------------------------------
// Resolve theme tokens for the SVG and refresh when the theme changes.
// ---------------------------------------------------------------------------

interface ChartPalette {
  primary: string;
  success: string;
  warning: string;
  danger: string;
  text: string;
  muted: string;
  subtle: string;
  border: string;
  surface: string;
}

// Mirrors the light :root tokens in index.css — only used before the
// stylesheet has resolved (SSR / very first paint).
const FALLBACK_PALETTE: ChartPalette = {
  primary: "#4f46e5",
  success: "#15803d",
  warning: "#b45309",
  danger: "#b91c1c",
  text: "#111827",
  muted: "#4b5563",
  subtle: "#6b7280",
  border: "rgba(17, 24, 39, 0.12)",
  surface: "#ffffff",
};

const readPalette = (): ChartPalette => {
  if (typeof window === "undefined" || typeof document === "undefined") return FALLBACK_PALETTE;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string): string =>
    cs.getPropertyValue(name).trim() || fallback;
  return {
    primary: v("--color-primary", FALLBACK_PALETTE.primary),
    success: v("--color-success", FALLBACK_PALETTE.success),
    warning: v("--color-warning", FALLBACK_PALETTE.warning),
    danger: v("--color-danger", FALLBACK_PALETTE.danger),
    text: v("--color-text", FALLBACK_PALETTE.text),
    muted: v("--color-text-muted", FALLBACK_PALETTE.muted),
    subtle: v("--color-text-subtle", FALLBACK_PALETTE.subtle),
    border: v("--color-border-strong", FALLBACK_PALETTE.border),
    surface: v("--color-bg", FALLBACK_PALETTE.surface),
  };
};

/** Design tokens resolved to concrete colors; tracks the <html> theme class. */
const useChartPalette = (): ChartPalette => {
  const [palette, setPalette] = useState<ChartPalette>(readPalette);
  useEffect(() => {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => setPalette(readPalette()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return palette;
};

const formatUsd = (value: unknown): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    typeof value === "number" ? value : Number(value ?? 0)
  );

const PaymentBreakdownChartBase: React.FC<DealChartsProps> = ({ dealData, activeVehicle }) => {
  const palette = useChartPalette();

  const data = useMemo(() => {
    if (!activeVehicle) return [];

    const principal =
      typeof activeVehicle.amountToFinance === "number" ? activeVehicle.amountToFinance : 0;
    const interestRate = dealData.interestRate;
    const term = Math.floor(dealData.loanTerm);
    if (
      typeof interestRate !== "number" ||
      !Number.isFinite(interestRate) ||
      interestRate < 0 ||
      !Number.isFinite(term) ||
      term <= 0 ||
      !Number.isFinite(principal) ||
      principal <= 0
    )
      return [];

    const monthlyPayment = calculateMonthlyPayment(principal, interestRate, term);

    if (monthlyPayment === "Error") {
      return [];
    }

    const totalCost = monthlyPayment * term;
    const totalInterest = totalCost - principal;

    // Fees/taxes are already rolled into Amount to Finance, so the loan itself
    // decomposes cleanly into principal vs. interest.
    return [
      { name: "Principal", value: principal },
      { name: "Interest", value: totalInterest > 0 ? totalInterest : 0 },
    ];
  }, [dealData, activeVehicle]);

  if (!activeVehicle)
    return (
      <div className="flex items-center justify-center h-64 text-[var(--color-text-subtle)]">
        Select a vehicle on the desk to see loan costs.
      </div>
    );
  if (data.length === 0)
    return (
      <div className="flex items-center justify-center h-64 text-[var(--color-text-subtle)]">
        Enter an amount financed, interest rate and term to see loan costs.
      </div>
    );

  const principal = data[0]!.value;
  const interest = data[1]!.value;
  const total = principal + interest;
  const circumference = 2 * Math.PI * 46;
  const interestArc = total > 0 ? (interest / total) * circumference : 0;
  return (
    <div className="grid gap-5 sm:grid-cols-[140px_1fr] items-center py-3">
      <svg
        viewBox="0 0 120 120"
        className="w-36 h-36 mx-auto"
        role="img"
        aria-label={`Loan costs: ${formatUsd(principal)} principal and ${formatUsd(interest)} estimated interest`}
      >
        <circle cx="60" cy="60" r="46" fill="none" stroke={palette.primary} strokeWidth="14" />
        <circle
          cx="60"
          cy="60"
          r="46"
          fill="none"
          stroke={palette.warning}
          strokeWidth="14"
          strokeDasharray={`${interestArc} ${circumference}`}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="57" textAnchor="middle" fill={palette.text} fontSize="18" fontWeight="700">
          {Math.round((interest / total) * 100)}%
        </text>
        <text x="60" y="73" textAnchor="middle" fill={palette.muted} fontSize="10">
          interest share
        </text>
      </svg>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt>Financed principal</dt>
          <dd className="font-semibold tabular-nums">{formatUsd(principal)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Estimated interest</dt>
          <dd className="font-semibold tabular-nums" style={{ color: palette.warning }}>
            {formatUsd(interest)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 pt-3 border-t border-[var(--color-border)]">
          <dt>Total loan payments</dt>
          <dd className="font-semibold tabular-nums">{formatUsd(total)}</dd>
        </div>
      </dl>
    </div>
  );
};

export const PaymentBreakdownChart = React.memo(PaymentBreakdownChartBase);
PaymentBreakdownChart.displayName = "PaymentBreakdownChart";

// Stable fallbacks so default props don't churn the useMemo below.
const NO_PROFILES: LenderProfile[] = [];

const EMPTY_FILTERS: FilterData = {
  creditScore: null,
  monthlyIncome: null,
  vehicle: "",
  maxPrice: null,
  maxPayment: null,
  maxMiles: null,
  maxOtdLtv: null,
  vin: "",
};

const MAX_CHARTED_LENDERS = 6;

const LenderComparisonChartBase: React.FC<LenderComparisonChartProps> = ({
  dealData,
  activeVehicle,
  lenderProfiles = NO_PROFILES,
  customerFilters = EMPTY_FILTERS,
}) => {
  const palette = useChartPalette();

  // Real data: run each dealer-entered lender program through the eligibility
  // matcher and chart the estimated payment for programs that actually fit.
  const data = useMemo(() => {
    if (!activeVehicle) return [];

    const principal = activeVehicle.amountToFinance;
    if (typeof principal !== "number" || !Number.isFinite(principal) || principal <= 0) return [];

    const dealWithFilters = { ...dealData, ...customerFilters };

    return holdIncompleteFits(
      lenderFitForVehicle(activeVehicle, dealWithFilters, lenderProfiles),
      customerFilters
    )
      .entries.flatMap((result) => {
        if (!result.eligible || result.status !== "eligible") return [];
        const rate = result.effectiveRate;
        if (typeof rate !== "number" || !Number.isFinite(rate)) return [];

        const payment = calculateMonthlyPayment(principal, rate, dealData.loanTerm);
        if (typeof payment !== "number" || !Number.isFinite(payment)) return [];

        return [{ id: result.lenderId, name: result.name, rate, payment }];
      })
      .sort((a, b) => a.payment - b.payment)
      .slice(0, MAX_CHARTED_LENDERS);
  }, [dealData, activeVehicle, lenderProfiles, customerFilters]);

  if (!activeVehicle)
    return (
      <div className="flex items-center justify-center h-64 text-[var(--color-text-subtle)]">
        Select a vehicle on the desk to compare lender payments.
      </div>
    );

  return (
    <div className="w-full">
      <p className="text-xs text-[var(--color-text-muted)] mb-2">
        Based on dealer-entered programs — verify with lender.
      </p>
      {data.length === 0 ? (
        <div className="h-64">
          <EmptyState
            headingLevel={4}
            icon={<Icons.BuildingLibraryIcon className="w-full h-full" />}
            title={
              lenderProfiles.length === 0 ? "No lender programs yet" : "No checked lender quotes"
            }
            description={
              lenderProfiles.length === 0
                ? "Add lender programs on the Lenders screen to compare payments."
                : "Complete customer inputs and confirm program rules and rates, then review lender results on the desk."
            }
          />
        </div>
      ) : (
        <ol className="space-y-4 py-2" aria-label="Checked lender payment estimates">
          {data.map((quote) => (
            <li key={quote.id} className="space-y-2">
              <div className="flex justify-between gap-3 items-start">
                <div className="min-w-0">
                  <p className="font-semibold text-sm break-words">{quote.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {quote.rate.toFixed(2)}% rate estimate
                  </p>
                </div>
                <p className="font-semibold tabular-nums whitespace-nowrap">
                  {formatUsd(quote.payment)}
                  <span className="text-xs font-normal text-[var(--color-text-muted)]"> /mo</span>
                </p>
              </div>
              <div
                className="h-2 rounded bg-[var(--color-bg-muted)] overflow-hidden"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded"
                  style={{
                    width: `${(quote.payment / Math.max(...data.map((row) => row.payment))) * 100}%`,
                    background: palette.primary,
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export const LenderComparisonChart = React.memo(LenderComparisonChartBase);
LenderComparisonChart.displayName = "LenderComparisonChart";
