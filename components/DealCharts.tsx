import React, { useEffect, useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { DealData, CalculatedVehicle, LenderProfile, FilterData } from "../types";
import { calculateMonthlyPayment } from "../services/calculator";
import { checkBankEligibility } from "../services/lenderMatcher";
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
// Theme plumbing. Recharts renders SVG and needs literal color strings — it
// cannot consume `var(--color-*)`. We resolve the design tokens from the
// document at render time and re-resolve when the theme class on <html>
// flips, so charts follow dark/light instead of bleeding light-mode hex into
// dark mode. [takeover-P1 #15]
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

/** Recharts' JS entrance animations are not covered by the CSS reduced-motion reset. */
const usePrefersReducedMotion = (): boolean => {
  const [reduce, setReduce] = useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduce;
};

const formatUsd = (value: unknown): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    typeof value === "number" ? value : Number(value ?? 0)
  );

const formatUsdCompact = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const tooltipStyle = (p: ChartPalette): React.CSSProperties => ({
  backgroundColor: p.surface,
  color: p.text,
  borderRadius: 8,
  border: `1px solid ${p.border}`,
  boxShadow: "0 4px 14px rgba(0, 0, 0, 0.18)",
  fontSize: 12,
});

const PaymentBreakdownChartBase: React.FC<DealChartsProps> = ({ dealData, activeVehicle }) => {
  const palette = useChartPalette();
  const reduceMotion = usePrefersReducedMotion();

  const data = useMemo(() => {
    if (!activeVehicle) return [];

    const principal =
      typeof activeVehicle.amountToFinance === "number" ? activeVehicle.amountToFinance : 0;
    const interestRate = dealData.interestRate || 0;
    const term = dealData.loanTerm || 72;

    const monthlyPayment = calculateMonthlyPayment(principal, interestRate, term);

    if (monthlyPayment === "Error") {
      return [
        { name: "Principal", value: principal },
        { name: "Interest", value: 0 },
      ];
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

  // Principal = brand green (the money that becomes the car); interest = amber
  // (cost of financing). Two hues that remain distinguishable for common CVD.
  const sliceColors = [palette.primary, palette.warning];

  if (!activeVehicle)
    return (
      <div className="flex items-center justify-center h-64 text-[var(--color-text-subtle)]">
        No vehicle selected
      </div>
    );

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            fill={palette.primary}
            stroke={palette.surface}
            paddingAngle={5}
            dataKey="value"
            isAnimationActive={!reduceMotion}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={sliceColors[index % sliceColors.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatUsd(value)}
            contentStyle={tooltipStyle(palette)}
            itemStyle={{ color: palette.text }}
            labelStyle={{ color: palette.muted }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            wrapperStyle={{ color: palette.muted, fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
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
  const reduceMotion = usePrefersReducedMotion();

  // Real data: run each dealer-entered lender program through the eligibility
  // matcher and chart the estimated payment for programs that actually fit.
  const data = useMemo(() => {
    if (!activeVehicle) return [];

    const principal = activeVehicle.amountToFinance;
    if (typeof principal !== "number" || !Number.isFinite(principal)) return [];

    const dealWithFilters = { ...dealData, ...customerFilters };

    return lenderProfiles
      .filter((profile): profile is LenderProfile => Boolean(profile))
      .flatMap((profile) => {
        const result = checkBankEligibility(activeVehicle, dealWithFilters, profile);
        if (!result.eligible || !result.matchedTier) return [];

        const { baseInterestRate, rateAdder } = result.matchedTier;
        if (typeof baseInterestRate !== "number" || !Number.isFinite(baseInterestRate)) return [];

        const rate =
          baseInterestRate +
          (typeof rateAdder === "number" && Number.isFinite(rateAdder) ? rateAdder : 0);

        const payment = calculateMonthlyPayment(principal, rate, dealData.loanTerm);
        if (typeof payment !== "number" || !Number.isFinite(payment)) return [];

        return [{ name: profile.name, rate, payment }];
      })
      .sort((a, b) => a.payment - b.payment)
      .slice(0, MAX_CHARTED_LENDERS);
  }, [dealData, activeVehicle, lenderProfiles, customerFilters]);

  if (!activeVehicle) return null;

  return (
    <div className="w-full">
      <p className="text-xs text-[var(--color-text-muted)] mb-2">
        Based on dealer-entered programs — verify with lender.
      </p>
      {data.length === 0 ? (
        <div className="h-64">
          <EmptyState
            icon={<Icons.BuildingLibraryIcon className="w-full h-full" />}
            title="No fitting lender programs"
            description="No lender programs match this deal's structure yet."
          />
        </div>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 16, left: 4, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.border} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: palette.subtle, fontSize: 11 }}
              />
              {/* A labeled Y axis so magnitudes are readable without hover
                  (keyboard/touch users, and length is the most accurately
                  read encoding). */}
              <YAxis
                width={64}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatUsdCompact(v)}
                tick={{ fill: palette.subtle, fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: "transparent" }}
                formatter={(value) => formatUsd(value)}
                contentStyle={tooltipStyle(palette)}
                itemStyle={{ color: palette.text }}
                labelStyle={{ color: palette.muted }}
              />
              <Bar
                dataKey="payment"
                fill={palette.primary}
                radius={[4, 4, 0, 0]}
                name="Monthly Payment"
                isAnimationActive={!reduceMotion}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export const LenderComparisonChart = React.memo(LenderComparisonChartBase);
LenderComparisonChart.displayName = "LenderComparisonChart";
