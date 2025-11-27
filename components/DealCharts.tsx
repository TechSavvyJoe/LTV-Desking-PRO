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
import { DealData, CalculatedVehicle } from "../types";
import { calculateMonthlyPayment } from "../services/calculator";

interface DealChartsProps {
  dealData: DealData;
  activeVehicle: CalculatedVehicle | null;
}

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b"];

export const PaymentBreakdownChart: React.FC<DealChartsProps> = ({
  dealData,
  activeVehicle,
}) => {
  const data = useMemo(() => {
    if (!activeVehicle) return [];

    const principal =
      typeof activeVehicle.amountToFinance === "number"
        ? activeVehicle.amountToFinance
        : 0;
    const interestRate = dealData.interestRate || 0;
    const term = dealData.loanTerm || 72;

    const monthlyPayment = calculateMonthlyPayment(
      principal,
      interestRate,
      term
    );

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
      <div className="flex items-center justify-center h-64 text-slate-400">
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
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) =>
              new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(value)
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

export const LenderComparisonChart: React.FC<DealChartsProps> = ({
  dealData,
  activeVehicle,
}) => {
  // Mock data for now - in a real app, this would come from the LenderMatcher service
  const data = useMemo(() => {
    if (!activeVehicle) return [];

    // Simulate a few lenders with different rates/terms
    return [
      { name: "Chase", rate: 6.99, payment: 550 },
      { name: "Ally", rate: 7.49, payment: 565 },
      { name: "Wells", rate: 7.99, payment: 580 },
      { name: "CapOne", rate: 8.49, payment: 595 },
    ];
  }, [activeVehicle]);

  if (!activeVehicle) return null;

  return (
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
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="#e2e8f0"
          />
          <XAxis dataKey="name" axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: "transparent" }}
            contentStyle={{
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              borderRadius: "8px",
              border: "none",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            }}
          />
          <Bar
            dataKey="payment"
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
            name="Monthly Payment"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
