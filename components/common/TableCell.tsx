
import React from 'react';
import CopyToClipboard from './CopyToClipboard';

export const formatCurrency = (value: any): string => {
  if (typeof value !== 'number') return String(value);
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatPercentage = (value: any): string => {
  if (typeof value !== 'number') return String(value);
  return `${Math.round(value)}%`;
};

export const formatNumber = (value: any): string => {
  if (typeof value !== 'number') return String(value);
  return value.toLocaleString();
};


interface LtvCellProps {
  value: number | 'Error' | 'N/A';
}
export const LtvCell: React.FC<LtvCellProps> = ({ value }) => {
  if (typeof value !== 'number') {
    return <span className="text-red-500 font-semibold">{value}</span>;
  }
  let colorClass = 'text-orange-400';
  if (value < 80) colorClass = 'text-green-400';
  else if (value <= 100) colorClass = 'text-blue-400';
  else if (value <= 120) colorClass = 'text-yellow-400';

  return (
    <CopyToClipboard valueToCopy={value}>
      <span className={`font-bold ${colorClass}`}>{formatPercentage(value)}</span>
    </CopyToClipboard>
  );
};

export const OtdLtvCell: React.FC<LtvCellProps> = ({ value }) => {
  if (typeof value !== 'number') {
    return <span className="text-red-500 font-semibold">{value}</span>;
  }
  let colorClass = 'text-red-500';
  if (value < 90) colorClass = 'text-green-500';
  else if (value <= 110) colorClass = 'text-blue-500';
  else if (value <= 130) colorClass = 'text-yellow-500';

  return (
    <CopyToClipboard valueToCopy={value}>
      <span className={`font-bold ${colorClass}`}>{formatPercentage(value)}</span>
    </CopyToClipboard>
  );
};

interface GrossCellProps {
  value: number | 'Error' | 'N/A';
}
export const GrossCell: React.FC<GrossCellProps> = ({ value }) => {
    const isNegative = typeof value === 'number' && value < 0;
    const colorClass = isNegative 
        ? 'text-red-400 bg-red-900/30' 
        : 'text-green-400 bg-green-900/30';
    
    return (
      <CopyToClipboard valueToCopy={value}>
        <span className={`inline-block px-2 py-0.5 rounded-md font-bold text-xs ${colorClass}`}>
          {formatCurrency(value)}
        </span>
      </CopyToClipboard>
    );
};

interface PaymentCellProps {
    value: number | 'Error' | 'N/A';
}
export const PaymentCell: React.FC<PaymentCellProps> = ({value}) => (
    <CopyToClipboard valueToCopy={value}>
      <span className="font-bold text-green-400">{formatCurrency(value)}</span>
    </CopyToClipboard>
);