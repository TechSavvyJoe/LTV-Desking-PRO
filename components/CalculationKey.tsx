
import React from 'react';

const CalculationKey: React.FC = () => {
  const calculations = [
    { title: "MI Sales Tax", formula: "Calculated as (Price - Trade-In Value + Doc Fee + CVR Fee) * 6%." },
    { title: "Base OTD Price", formula: "Price + All Fees (Taxed & Untaxed) + Sales Tax." },
    { title: "Amount to Finance", formula: "Base OTD Price + Backend Products - Total Down (Cash + Net Trade Equity)." },
    { title: "Front End LTV %", formula: "(Base OTD Price - Total Down) / JD Power. Excludes backend products." },
    { title: "OTD LTV %", formula: "Total Amount to Finance / JD Power. Includes backend products." },
    { title: "Monthly Payment", formula: "Standard loan formula using Total Amount to Finance, Term, and APR." },
    { title: "Front-End Gross", formula: "Price - Unit Cost (if available)." },
  ];

  return (
    <div className="mt-10 p-4 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">Calculation Key</h3>
      <ul className="list-disc list-inside space-y-2 text-sm text-slate-600 dark:text-slate-300">
        {calculations.map(calc => (
          <li key={calc.title}>
            <strong className="text-slate-900 dark:text-slate-100">{calc.title}:</strong> {calc.formula}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CalculationKey;
