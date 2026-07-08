import React, { useMemo } from "react";
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

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b"];

const PaymentBreakdownChartBase: React.FC<DealChartsProps> = ({ dealData, activeVehicle }) => {
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

    // Fees are typically included in Amount to Finance, but let's break out "Upfront Fees" if possible
    // For this simple chart, we'll show Principal vs Interest
    // We can also add "Taxes" if they are separate, but usually they are rolled in.
    // Let's stick to Principal vs Interest for the loan itself.

    return [
      { name: "Principal", value: principal },
      { name: "Interest", value: totalInterest > 0 ? totalInterest : 0 },
    ];
  }, [dealData, activeVehicle]);

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
            fill="#8884d8"
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) =>
              new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(typeof value === "number" ? value : Number(value ?? 0))
            }
            contentStyle={{
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              borderRadius: "8px",
              border: "none",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            }}
          />
          <Legend verticalAlign="bottom" height={36} />
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
            <BarChart
              data={data}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: "transparent" }}
                formatter={(value) =>
                  new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(typeof value === "number" ? value : Number(value ?? 0))
                }
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.9)",
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                }}
              />
              <Bar dataKey="payment" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Monthly Payment" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export const LenderComparisonChart = React.memo(LenderComparisonChartBase);
LenderComparisonChart.displayName = "LenderComparisonChart";
