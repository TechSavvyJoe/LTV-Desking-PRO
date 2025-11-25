
import React, { useState, useMemo } from 'react';
import { calculateMonthlyPayment } from '../services/calculator';
import { formatCurrency } from './common/TableCell';

// Re-using styles from other components for consistency
const InputGroup: React.FC<{ label: string; children: React.ReactNode; htmlFor?: string; }> = ({ label, children, htmlFor }) => (
  <div className="flex flex-col">
    <label htmlFor={htmlFor} className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
    {children}
  </div>
);

const StyledInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:text-slate-200" />
);

const StyledSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:text-slate-200" />
);


const LoanCalculator: React.FC = () => {
    const [loanAmount, setLoanAmount] = useState<number | ''>(20000);
    const [interestRate, setInterestRate] = useState<number | ''>(8.0);
    const [loanTerm, setLoanTerm] = useState<number>(60);

    const monthlyPayment = useMemo(() => {
        const principal = Number(loanAmount);
        const rate = Number(interestRate);
        const term = Number(loanTerm);

        if (principal > 0 && rate >= 0 && term > 0) {
            return calculateMonthlyPayment(principal, rate, term);
        }
        return 0;
    }, [loanAmount, interestRate, loanTerm]);

    return (
        <div className="mt-10 p-6 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg h-full">
            <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-200 mb-4">Loan Calculator</h3>
            <div className="space-y-4">
                <InputGroup label="Loan Amount ($)" htmlFor="calcLoanAmount">
                    <StyledInput 
                        type="number" 
                        id="calcLoanAmount" 
                        value={loanAmount} 
                        onChange={(e) => setLoanAmount(e.target.value === '' ? '' : Number(e.target.value))} 
                        min="0" 
                        placeholder="e.g., 20000" 
                    />
                </InputGroup>
                <InputGroup label="Interest Rate (APR %)" htmlFor="calcInterestRate">
                    <StyledInput 
                        type="number" 
                        id="calcInterestRate" 
                        value={interestRate} 
                        onChange={(e) => setInterestRate(e.target.value === '' ? '' : Number(e.target.value))} 
                        min="0" 
                        step="0.1"
                        placeholder="e.g., 7.5"
                    />
                </InputGroup>
                <InputGroup label="Loan Term (Months)" htmlFor="calcLoanTerm">
                    <StyledSelect id="calcLoanTerm" value={loanTerm} onChange={(e) => setLoanTerm(Number(e.target.value))}>
                        <option value="36">36</option>
                        <option value="48">48</option>
                        <option value="60">60</option>
                        <option value="72">72</option>
                        <option value="84">84</option>
                    </StyledSelect>
                </InputGroup>
                <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-700">
                     <div className="flex justify-between items-center p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-md">
                        <span className="font-bold text-lg text-indigo-700 dark:text-indigo-400">Monthly Payment</span>
                        <span className="font-bold text-lg text-indigo-700 dark:text-indigo-400">
                            {formatCurrency(monthlyPayment)}
                        </span>
                     </div>
                </div>
            </div>
        </div>
    );
};

export default LoanCalculator;
