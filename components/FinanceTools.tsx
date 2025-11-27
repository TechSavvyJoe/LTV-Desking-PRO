import React, { useState, useMemo } from "react";
import {
  calculateMonthlyPayment,
  calculateLoanAmount,
} from "../services/calculator";
import { formatCurrency } from "./common/TableCell";
import * as Icons from "./common/Icons";

// --- Shared UI Components (Local for now to avoid refactoring FloatingToolsPanel yet) ---
const InputGroup: React.FC<{
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
}> = ({ label, children, htmlFor }) => (
  <div className="flex flex-col">
    <label
      htmlFor={htmlFor}
      className="mb-1.5 text-sm font-medium text-slate-500 dark:text-slate-300"
    >
      {label}
    </label>
    {children}
  </div>
);

const StyledInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className="w-full px-3 py-2 text-base bg-transparent border border-slate-300 dark:border-slate-700 rounded-lg placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-0 transition-colors duration-200 ease-in-out text-slate-900 dark:text-slate-100"
  />
);

const StyledSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className="w-full px-3 py-2 text-base bg-slate-50 dark:bg-black border border-slate-300 dark:border-slate-700 rounded-lg placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-0 transition-colors duration-200 ease-in-out text-slate-900 dark:text-slate-100"
  />
);

const ResultDisplay = ({
  label,
  value,
  valueColorClass = "text-blue-500",
  subLabel,
}: {
  label: string;
  value: string | React.ReactNode;
  valueColorClass?: string;
  subLabel?: string;
}) => (
  <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
    <div className="flex flex-col">
      <span className="font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>
      {subLabel && (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {subLabel}
        </span>
      )}
    </div>
    <span className={`font-bold text-lg ${valueColorClass}`}>{value}</span>
  </div>
);

interface FinanceToolsProps {
  scratchPadNotes: string;
  setScratchPadNotes: (notes: string) => void;
  defaultAmountFinanced?: number;
  defaultInterestRate?: number;
  defaultTerm?: number;
}

const FinanceTools: React.FC<FinanceToolsProps> = ({
  scratchPadNotes,
  setScratchPadNotes,
  defaultAmountFinanced = 30000,
  defaultInterestRate = 7.99,
  defaultTerm = 72,
}) => {
  const [activeTab, setActiveTab] = useState<
    | "reserve"
    | "payment"
    | "budget"
    | "compare"
    | "qualify"
    | "max"
    | "warranty"
    | "notes"
  >("reserve");

  // --- Reserve Calculator State ---
  const [resAmount, setResAmount] = useState<number | "">(
    defaultAmountFinanced
  );
  const [buyRate, setBuyRate] = useState<number | "">(defaultInterestRate);
  const [sellRate, setSellRate] = useState<number | "">(
    defaultInterestRate + 2
  );
  const [resTerm, setResTerm] = useState<number>(defaultTerm);
  const [splitPercent, setSplitPercent] = useState<number | "">(70);
  const [flatPercent, setFlatPercent] = useState<number | "">(2.0);

  // --- Payment Calculator State ---
  const [payAmount, setPayAmount] = useState<number | "">(
    defaultAmountFinanced
  );
  const [payRate, setPayRate] = useState<number | "">(defaultInterestRate);
  const [payTerm, setPayTerm] = useState<number>(defaultTerm);

  // --- Budget Calculator State ---
  const [budgetPmt, setBudgetPmt] = useState<number | "">(450);
  const [budgetRate, setBudgetRate] = useState<number | "">(
    defaultInterestRate
  );
  const [budgetTerm, setBudgetTerm] = useState<number>(defaultTerm);
  const [budgetDown, setBudgetDown] = useState<number | "">(2000);

  // --- Compare State ---
  const [compAmount, setCompAmount] = useState<number | "">(
    defaultAmountFinanced
  );
  const [compRate, setCompRate] = useState<number | "">(defaultInterestRate);

  // --- Qualify (PTI) State ---
  const [qualPmt, setQualPmt] = useState<number | "">(550);
  const [qualIncome, setQualIncome] = useState<number | "">(4000);
  const [qualLimit, setQualLimit] = useState<number | "">(15);

  // --- Max Approval State ---
  const [maxAppAmount, setMaxAppAmount] = useState<number | "">(30000);
  const [maxAppTax, setMaxAppTax] = useState<number | "">(6.0);
  const [maxAppFees, setMaxAppFees] = useState<number | "">(300);
  const [maxAppDown, setMaxAppDown] = useState<number | "">(1000);
  const [maxAppTradeEq, setMaxAppTradeEq] = useState<number | "">(0);

  // --- Warranty Breakeven State ---
  const [warrRepairCost, setWarrRepairCost] = useState<number | "">(2500);
  const [warrCostMo, setWarrCostMo] = useState<number | "">(40);
  const [warrTerm, setWarrTerm] = useState<number>(60);

  // --- Calculations ---
  const reserveStats = useMemo(() => {
    const principal = Number(resAmount) || 0;
    const t = Number(resTerm) || 0;
    const buy = Number(buyRate) || 0;
    const sell = Number(sellRate) || 0;
    const split = Number(splitPercent) || 0;
    const flat = Number(flatPercent) || 0;

    if (principal <= 0 || t <= 0)
      return { totalReserve: 0, dealerSplit: 0, flatFee: 0 };

    const paymentBuy = calculateMonthlyPayment(principal, buy, t);
    const paymentSell = calculateMonthlyPayment(principal, sell, t);

    if (typeof paymentBuy !== "number" || typeof paymentSell !== "number")
      return { totalReserve: 0, dealerSplit: 0, flatFee: 0 };

    const totalReserve = (paymentSell - paymentBuy) * t;
    const dealerSplit = totalReserve * (split / 100);
    const flatFee = principal * (flat / 100);

    return { totalReserve, dealerSplit, flatFee };
  }, [resAmount, buyRate, sellRate, resTerm, splitPercent, flatPercent]);

  const paymentResult = useMemo(() => {
    const p = Number(payAmount) || 0;
    const r = Number(payRate) || 0;
    const t = Number(payTerm) || 0;
    return calculateMonthlyPayment(p, r, t);
  }, [payAmount, payRate, payTerm]);

  const budgetResult = useMemo(() => {
    const pmt = Number(budgetPmt) || 0;
    const r = Number(budgetRate) || 0;
    const t = Number(budgetTerm) || 0;
    const down = Number(budgetDown) || 0;

    const maxLoan = calculateLoanAmount(pmt, r, t);

    if (typeof maxLoan !== "number") return { maxLoan: 0, maxPrice: 0 };

    // Rough estimate: Max Price = Max Loan + Down Payment
    // (Ignoring taxes/fees for a quick "OTD" estimate, or could be "Max Amount Financed")
    const maxPrice = maxLoan + down;

    return { maxLoan, maxPrice };
  }, [budgetPmt, budgetRate, budgetTerm, budgetDown]);

  const compareResults = useMemo(() => {
    const p = Number(compAmount) || 0;
    const r = Number(compRate) || 0;
    return {
      term72: calculateMonthlyPayment(p, r, 72),
      term75: calculateMonthlyPayment(p, r, 75),
      term84: calculateMonthlyPayment(p, r, 84),
    };
  }, [compAmount, compRate]);

  const qualifyResult = useMemo(() => {
    const pmt = Number(qualPmt) || 0;
    const inc = Number(qualIncome) || 0;
    const limit = Number(qualLimit) || 0;
    if (inc <= 0) return { ratio: 0, status: "N/A" };
    const ratio = (pmt / inc) * 100;
    const status = ratio <= limit ? "Qualified" : "Over Limit";
    return { ratio, status };
  }, [qualPmt, qualIncome, qualLimit]);

  const maxApprovalResult = useMemo(() => {
    const approval = Number(maxAppAmount) || 0;
    const tax = Number(maxAppTax) || 0;
    const fees = Number(maxAppFees) || 0;
    const down = Number(maxAppDown) || 0;
    const tradeEq = Number(maxAppTradeEq) || 0;

    // Formula: (Approval + Down + TradeEq - Fees) / (1 + TaxRate)
    const totalCash = approval + down + tradeEq;
    const taxableAmount = totalCash - fees;
    const maxPrice = taxableAmount / (1 + tax / 100);

    return maxPrice > 0 ? maxPrice : 0;
  }, [maxAppAmount, maxAppTax, maxAppFees, maxAppDown, maxAppTradeEq]);

  const warrantyResult = useMemo(() => {
    const repair = Number(warrRepairCost) || 0;
    const cost = Number(warrCostMo) || 0;
    if (cost <= 0) return 0;
    return repair / cost;
  }, [warrRepairCost, warrCostMo]);

  return (
    <div className="flex flex-col h-full">
      {/* Header / Tabs */}
      <div className="flex items-center justify-between mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Finance Tools
        </h3>
        <div className="flex space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg overflow-x-auto">
          {(
            [
              "reserve",
              "payment",
              "budget",
              "compare",
              "qualify",
              "max",
              "warranty",
              "notes",
            ] as const
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                activeTab === tab
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pr-1">
        {activeTab === "reserve" && (
          <div className="space-y-4">
            <InputGroup label="Amount Financed ($)">
              <StyledInput
                type="number"
                value={resAmount}
                onChange={(e) =>
                  setResAmount(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
              />
            </InputGroup>
            <div className="grid grid-cols-2 gap-3">
              <InputGroup label="Buy Rate (%)">
                <StyledInput
                  type="number"
                  step="0.01"
                  value={buyRate}
                  onChange={(e) =>
                    setBuyRate(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                />
              </InputGroup>
              <InputGroup label="Sell Rate (%)">
                <StyledInput
                  type="number"
                  step="0.01"
                  value={sellRate}
                  onChange={(e) =>
                    setSellRate(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                />
              </InputGroup>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InputGroup label="Term (Mo)">
                <StyledSelect
                  value={resTerm}
                  onChange={(e) => setResTerm(Number(e.target.value))}
                >
                  <option value="36">36</option>
                  <option value="48">48</option>
                  <option value="54">54</option>
                  <option value="60">60</option>
                  <option value="66">66</option>
                  <option value="72">72</option>
                  <option value="75">75</option>
                  <option value="84">84</option>
                </StyledSelect>
              </InputGroup>
              <InputGroup label="Split (%)">
                <StyledInput
                  type="number"
                  value={splitPercent}
                  onChange={(e) =>
                    setSplitPercent(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                />
              </InputGroup>
            </div>
            <InputGroup label="Flat Fee Comparison (%)">
              <StyledInput
                type="number"
                step="0.1"
                value={flatPercent}
                onChange={(e) =>
                  setFlatPercent(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
              />
            </InputGroup>

            <div className="pt-4 mt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <ResultDisplay
                label="Total Reserve"
                value={formatCurrency(reserveStats.totalReserve)}
                valueColorClass="text-slate-900 dark:text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <div
                  className={`p-3 rounded-lg border ${
                    reserveStats.dealerSplit >= reserveStats.flatFee
                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                      : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Split ({splitPercent}%)
                  </p>
                  <p
                    className={`text-lg font-bold ${
                      reserveStats.dealerSplit >= reserveStats.flatFee
                        ? "text-green-600 dark:text-green-400"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {formatCurrency(reserveStats.dealerSplit)}
                  </p>
                </div>
                <div
                  className={`p-3 rounded-lg border ${
                    reserveStats.flatFee > reserveStats.dealerSplit
                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                      : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Flat ({flatPercent}%)
                  </p>
                  <p
                    className={`text-lg font-bold ${
                      reserveStats.flatFee > reserveStats.dealerSplit
                        ? "text-green-600 dark:text-green-400"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {formatCurrency(reserveStats.flatFee)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "payment" && (
          <div className="space-y-4">
            <InputGroup label="Loan Amount ($)">
              <StyledInput
                type="number"
                value={payAmount}
                onChange={(e) =>
                  setPayAmount(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
              />
            </InputGroup>
            <InputGroup label="Interest Rate (%)">
              <StyledInput
                type="number"
                step="0.1"
                value={payRate}
                onChange={(e) =>
                  setPayRate(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
              />
            </InputGroup>
            <InputGroup label="Term (Mo)">
              <StyledSelect
                value={payTerm}
                onChange={(e) => setPayTerm(Number(e.target.value))}
              >
                <option value="36">36</option>
                <option value="48">48</option>
                <option value="60">60</option>
                <option value="72">72</option>
                <option value="84">84</option>
              </StyledSelect>
            </InputGroup>
            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
              <ResultDisplay
                label="Monthly Payment"
                value={formatCurrency(paymentResult)}
                valueColorClass="text-green-600 dark:text-green-400"
              />
            </div>
          </div>
        )}

        {activeTab === "budget" && (
          <div className="space-y-4">
            <InputGroup label="Max Monthly Payment ($)">
              <StyledInput
                type="number"
                value={budgetPmt}
                onChange={(e) =>
                  setBudgetPmt(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
              />
            </InputGroup>
            <div className="grid grid-cols-2 gap-3">
              <InputGroup label="Interest Rate (%)">
                <StyledInput
                  type="number"
                  step="0.1"
                  value={budgetRate}
                  onChange={(e) =>
                    setBudgetRate(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                />
              </InputGroup>
              <InputGroup label="Term (Mo)">
                <StyledSelect
                  value={budgetTerm}
                  onChange={(e) => setBudgetTerm(Number(e.target.value))}
                >
                  <option value="36">36</option>
                  <option value="48">48</option>
                  <option value="54">54</option>
                  <option value="60">60</option>
                  <option value="66">66</option>
                  <option value="72">72</option>
                  <option value="75">75</option>
                  <option value="84">84</option>
                </StyledSelect>
              </InputGroup>
            </div>
            <InputGroup label="Cash Down ($)">
              <StyledInput
                type="number"
                value={budgetDown}
                onChange={(e) =>
                  setBudgetDown(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
              />
            </InputGroup>
            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <ResultDisplay
                label="Max Loan Amount"
                value={formatCurrency(budgetResult.maxLoan)}
                valueColorClass="text-blue-600 dark:text-blue-400"
              />
              <ResultDisplay
                label="Max OTD Price"
                subLabel="(Loan + Down)"
                value={formatCurrency(budgetResult.maxPrice)}
                valueColorClass="text-green-600 dark:text-green-400"
              />
            </div>
          </div>
        )}

        {activeTab === "notes" && (
          <div className="h-full flex flex-col">
            <textarea
              className="flex-1 w-full p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none font-mono text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400"
              placeholder="Type your notes here..."
              value={scratchPadNotes}
              onChange={(e) => setScratchPadNotes(e.target.value)}
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Notes are automatically saved with the deal.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinanceTools;
