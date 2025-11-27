import React from "react";
import CopyToClipboard from "./CopyToClipboard";

export const formatCurrency = (value: number | string | undefined): string => {
  if (
    value === undefined ||
    value === null ||
    value === "N/A" ||
    value === "Error"
  )
    return "N/A";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num)
    ? "N/A"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(num);
};

export const formatPercentage = (
  value: number | string | undefined,
  decimals: number = 2
): string => {
  if (
    value === undefined ||
    value === null ||
    value === "N/A" ||
    value === "Error"
  )
    return "N/A";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num) ? "N/A" : `${num.toFixed(decimals)}%`;
};

export const formatNumber = (value: number | string | undefined): string => {
  if (
    value === undefined ||
    value === null ||
    value === "N/A" ||
    value === "Error"
  )
    return "N/A";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num) ? "N/A" : num.toLocaleString();
};

interface LtvCellProps {
  value: number | "Error" | "N/A";
}
export const LtvCell: React.FC<LtvCellProps> = ({ value }) => {
  if (typeof value !== "number") {
    return <span className="text-red-500 font-semibold">{value}</span>;
  }
  let colorClass = "text-orange-400";
  if (value < 80) colorClass = "text-green-400";
  else if (value <= 100) colorClass = "text-blue-400";
  else if (value <= 120) colorClass = "text-yellow-400";

  return (
    <CopyToClipboard valueToCopy={value}>
      <span className={`font-bold ${colorClass}`}>
        {formatPercentage(value, 0)}
      </span>
    </CopyToClipboard>
  );
};

export const OtdLtvCell: React.FC<LtvCellProps> = ({ value }) => {
  if (typeof value !== "number") {
    return <span className="text-red-500 font-semibold">{value}</span>;
  }
  let colorClass = "text-red-500";
  if (value < 90) colorClass = "text-green-500";
  else if (value <= 110) colorClass = "text-blue-500";
  else if (value <= 130) colorClass = "text-yellow-500";

  return (
    <CopyToClipboard valueToCopy={value}>
      <span className={`font-bold ${colorClass}`}>
        {formatPercentage(value, 0)}
      </span>
    </CopyToClipboard>
  );
};

interface GrossCellProps {
  value: number | "Error" | "N/A";
}
export const GrossCell: React.FC<GrossCellProps> = ({ value }) => {
  const isNegative = typeof value === "number" && value < 0;
  const colorClass = isNegative
    ? "text-red-400 bg-red-900/30"
    : "text-green-400 bg-green-900/30";

  return (
    <CopyToClipboard valueToCopy={value}>
      <span
        className={`inline-block px-2 py-0.5 rounded-md font-bold text-xs ${colorClass}`}
      >
        {formatCurrency(value)}
      </span>
    </CopyToClipboard>
  );
};

interface PaymentCellProps {
  value: number | "Error" | "N/A";
}
export const PaymentCell: React.FC<PaymentCellProps> = ({ value }) => (
  <CopyToClipboard valueToCopy={value}>
    <span className="font-bold text-green-400">{formatCurrency(value)}</span>
  </CopyToClipboard>
);
