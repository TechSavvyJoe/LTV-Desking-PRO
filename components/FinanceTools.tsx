import React, { useState, useMemo, useEffect } from "react";
import {
  calculateMonthlyPayment,
  calculateLoanAmount,
} from "../services/calculator";
import { formatCurrency } from "./common/TableCell";
import * as Icons from "./common/Icons";
import { DealData, CalculatedVehicle } from "../types";

// --- Shared UI Components ---
const InputGroup: React.FC<{
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
}> = ({ label, children, htmlFor }) => (
  <div className="flex flex-col">
    <label
      htmlFor={htmlFor}
      className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
    >
      {label}
    </label>
    {children}
  </div>
);

const StyledInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200 ease-in-out text-slate-900 dark:text-slate-100 shadow-sm"
  />
);

const StyledSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200 ease-in-out text-slate-900 dark:text-slate-100 shadow-sm"
  />
);

const ResultDisplay = ({
  label,
  value,
  valueColorClass = "text-blue-600 dark:text-blue-400",
  subLabel,
}: {
  label: string;
  value: string | React.ReactNode;
  valueColorClass?: string;
  subLabel?: string;
}) => (
  <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
    <div className="flex flex-col">
      <span className="font-medium text-slate-700 dark:text-slate-300 text-sm">
        {label}
      </span>
      {subLabel && (
        <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {subLabel}
        </span>
      )}
    </div>
    <span className={`font-bold text-xl ${valueColorClass}`}>{value}</span>
  </div>
);

interface FinanceToolsProps {
  scratchPadNotes: string;
  setScratchPadNotes: (notes: string) => void;
  dealData?: DealData;
  activeVehicle?: CalculatedVehicle | null;
}

type ToolTab =
  | "reserve"
  | "payment"
  | "budget"
  | "compare"
  | "qualify"
  | "max"
  | "warranty"
  | "notes";

const FinanceTools: React.FC<FinanceToolsProps> = ({
  scratchPadNotes,
  setScratchPadNotes,
  dealData,
  activeVehicle,
}) => {
  const [activeTab, setActiveTab] = useState<ToolTab>("reserve");

  // --- Defaults from Props ---
  const defaultPrice =
    typeof activeVehicle?.price === "number" ? activeVehicle.price : 30000;
  const defaultRate = dealData?.interestRate || 7.99;
  const defaultTermVal = dealData?.loanTerm || 72;

  // --- Reserve Calculator State ---
  const [resAmount, setResAmount] = useState<number | "">(defaultPrice);
  const [buyRate, setBuyRate] = useState<number | "">(defaultRate);
  const [sellRate, setSellRate] = useState<number | "">(defaultRate + 2);
  const [resTerm, setResTerm] = useState<number>(defaultTermVal);
  const [splitPercent, setSplitPercent] = useState<number | "">(70);
  const [flatPercent, setFlatPercent] = useState<number | "">(2.0);

  // --- Payment Calculator State ---
  const [payAmount, setPayAmount] = useState<number | "">(defaultPrice);
  const [payRate, setPayRate] = useState<number | "">(defaultRate);
  const [payTerm, setPayTerm] = useState<number>(defaultTermVal);

  // --- Budget Calculator State ---
  const [budgetPmt, setBudgetPmt] = useState<number | "">(450);
  const [budgetRate, setBudgetRate] = useState<number | "">(defaultRate);
  const [budgetTerm, setBudgetTerm] = useState<number>(defaultTermVal);
  const [budgetDown, setBudgetDown] = useState<number | "">(2000);

  // --- Compare State ---
  const [compAmount, setCompAmount] = useState<number | "">(defaultPrice);
  const [compRate, setCompRate] = useState<number | "">(defaultRate);

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

  // --- Warranty Analysis State ---
  const [warrCostMo, setWarrCostMo] = useState<number | "">(40);
  const [warrTerm, setWarrTerm] = useState<number>(60);
  const [warrRepairCost, setWarrRepairCost] = useState<number | "">(4000);

  // --- Sync with Deal Data Effect ---
  useEffect(() => {
    if (dealData && activeVehicle) {
      const price =
        typeof activeVehicle.price === "number" ? activeVehicle.price : 30000;
      const rate = dealData.interestRate;
      const term = dealData.loanTerm;

      // Only update if values are significantly different (simple check)
      // or just update on mount/change. For now, let's provide a manual sync button
      // to avoid overwriting user's scratchpad work unexpectedly.
      // BUT, for initial load, it's good.
    }
  }, [dealData, activeVehicle]);

  const handleSyncToDeal = () => {
    if (!dealData || !activeVehicle) return;
    const price =
      typeof activeVehicle.price === "number" ? activeVehicle.price : 30000;
    const rate = dealData.interestRate;
    const term = dealData.loanTerm;

    setResAmount(price);
    setBuyRate(rate);
    setSellRate(rate + 2);
    setResTerm(term);

    setPayAmount(price);
    setPayRate(rate);
    setPayTerm(term);

    setBudgetRate(rate);
    setBudgetTerm(term);

    setCompAmount(price);
    setCompRate(rate);
  };

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

    const maxPrice = maxLoan + down;
    return { maxLoan, maxPrice };
  }, [budgetPmt, budgetRate, budgetTerm, budgetDown]);

  const compareResults = useMemo(() => {
    const p = Number(compAmount) || 0;
    const r = Number(compRate) || 0;
    const terms = [24, 36, 48, 54, 60, 66, 72, 75, 84];
    return terms.map((t) => ({
      term: t,
      payment: calculateMonthlyPayment(p, r, t),
    }));
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

    const totalCash = approval + down + tradeEq;
    const taxableAmount = totalCash - fees;
    const maxPrice = taxableAmount / (1 + tax / 100);

    return maxPrice > 0 ? maxPrice : 0;
  }, [maxAppAmount, maxAppTax, maxAppFees, maxAppDown, maxAppTradeEq]);

  const warrantyAnalysis = useMemo(() => {
    const costMo = Number(warrCostMo) || 0;
    const term = Number(warrTerm) || 0;
    const repairCost = Number(warrRepairCost) || 0;

    const totalWarrantyCost = costMo * term;
    const potentialSavings = repairCost - totalWarrantyCost;
    const isPositive = potentialSavings > 0;

    return { totalWarrantyCost, potentialSavings, isPositive };
  }, [warrCostMo, warrTerm, warrRepairCost]);

  // --- Sidebar Navigation Items ---
  const navItems: { id: ToolTab; label: string; icon: React.ReactNode }[] = [
    {
      id: "reserve",
      label: "Reserve",
      icon: <Icons.ReceiptPercentIcon className="w-5 h-5" />,
    },
    {
      id: "payment",
      label: "Payment",
      icon: <Icons.CalculatorIcon className="w-5 h-5" />,
    },
    {
      id: "budget",
      label: "Budget",
      icon: <Icons.BanknotesIcon className="w-5 h-5" />,
    },
    {
      id: "compare",
      label: "Compare",
      icon: <Icons.DocumentDuplicateIcon className="w-5 h-5" />,
    },
    {
      id: "qualify",
      label: "Qualify",
      icon: <Icons.ShieldCheckIcon className="w-5 h-5" />,
    },
    {
      id: "max",
      label: "Max App",
      icon: <Icons.ChartIcon className="w-5 h-5" />,
    },
    {
      id: "warranty",
      label: "Warranty",
      icon: <Icons.WrenchToolIcon className="w-5 h-5" />,
    },
    {
      id: "notes",
      label: "Notes",
      icon: <Icons.PencilIcon className="w-5 h-5" />,
    },
  ];

  return (
    <div className="flex h-full bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
      {/* Sidebar */}
      <div className="w-64 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Finance Tools
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Calculators & Utilities
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === item.id
                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        {dealData && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={handleSyncToDeal}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
            >
              <Icons.ArrowPathIcon className="w-3.5 h-3.5" />
              Reset to Active Deal
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {navItems.find((n) => n.id === activeTab)?.label}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {activeTab === "reserve" &&
                  "Calculate dealer reserve and splits."}
                {activeTab === "payment" && "Estimate monthly payments."}
                {activeTab === "budget" && "Find max loan from monthly budget."}
                {activeTab === "compare" && "Compare terms side-by-side."}
                {activeTab === "qualify" && "Check Payment-to-Income ratio."}
                {activeTab === "max" && "Calculate max approval amount."}
                {activeTab === "warranty" && "Analyze warranty value."}
                {activeTab === "notes" && "Deal specific notes."}
              </p>
            </div>

            {activeTab === "reserve" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  <InputGroup label="Term (Mo)">
                    <StyledSelect
                      value={resTerm}
                      onChange={(e) => setResTerm(Number(e.target.value))}
                    >
                      {[36, 48, 54, 60, 66, 72, 75, 84].map((t) => (
                        <option key={t} value={t}>
                          {t} Months
                        </option>
                      ))}
                    </StyledSelect>
                  </InputGroup>
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
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <ResultDisplay
                    label="Total Reserve"
                    value={formatCurrency(reserveStats.totalReserve)}
                    valueColorClass="text-slate-900 dark:text-white"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <div
                      className={`p-4 rounded-xl border transition-colors ${
                        reserveStats.dealerSplit >= reserveStats.flatFee
                          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                          : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        Split ({splitPercent}%)
                      </p>
                      <p
                        className={`text-2xl font-bold ${
                          reserveStats.dealerSplit >= reserveStats.flatFee
                            ? "text-green-600 dark:text-green-400"
                            : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {formatCurrency(reserveStats.dealerSplit)}
                      </p>
                    </div>
                    <div
                      className={`p-4 rounded-xl border transition-colors ${
                        reserveStats.flatFee > reserveStats.dealerSplit
                          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                          : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        Flat ({flatPercent}%)
                      </p>
                      <p
                        className={`text-2xl font-bold ${
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
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="grid grid-cols-1 gap-6">
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
                  <div className="grid grid-cols-2 gap-6">
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
                        {[36, 48, 60, 72, 84].map((t) => (
                          <option key={t} value={t}>
                            {t} Months
                          </option>
                        ))}
                      </StyledSelect>
                    </InputGroup>
                  </div>
                </div>
                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <ResultDisplay
                    label="Monthly Payment"
                    value={formatCurrency(paymentResult)}
                    valueColorClass="text-green-600 dark:text-green-400 text-3xl"
                  />
                </div>
              </div>
            )}

            {activeTab === "budget" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
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
                <div className="grid grid-cols-2 gap-6">
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
                      {[36, 48, 54, 60, 66, 72, 75, 84].map((t) => (
                        <option key={t} value={t}>
                          {t} Months
                        </option>
                      ))}
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
                <div className="space-y-3 pt-6 border-t border-slate-100 dark:border-slate-800">
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

            {activeTab === "compare" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InputGroup label="Loan Amount ($)">
                    <StyledInput
                      type="number"
                      value={compAmount}
                      onChange={(e) =>
                        setCompAmount(
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Interest Rate (%)">
                    <StyledInput
                      type="number"
                      step="0.1"
                      value={compRate}
                      onChange={(e) =>
                        setCompRate(
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                    />
                  </InputGroup>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-4">
                  {compareResults.map((res) => (
                    <div
                      key={res.term}
                      className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-center"
                    >
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        {res.term} Months
                      </p>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">
                        {formatCurrency(res.payment)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "qualify" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <InputGroup label="Monthly Payment ($)">
                  <StyledInput
                    type="number"
                    value={qualPmt}
                    onChange={(e) =>
                      setQualPmt(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                  />
                </InputGroup>
                <InputGroup label="Monthly Income ($)">
                  <StyledInput
                    type="number"
                    value={qualIncome}
                    onChange={(e) =>
                      setQualIncome(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                  />
                </InputGroup>
                <InputGroup label="Max PTI Limit (%)">
                  <StyledInput
                    type="number"
                    value={qualLimit}
                    onChange={(e) =>
                      setQualLimit(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                  />
                </InputGroup>
                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <ResultDisplay
                    label="PTI Ratio"
                    value={`${qualifyResult.ratio.toFixed(1)}%`}
                    valueColorClass={
                      qualifyResult.status === "Qualified"
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }
                    subLabel={qualifyResult.status}
                  />
                </div>
              </div>
            )}

            {activeTab === "max" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <InputGroup label="Bank Approval Amount ($)">
                  <StyledInput
                    type="number"
                    value={maxAppAmount}
                    onChange={(e) =>
                      setMaxAppAmount(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                  />
                </InputGroup>
                <div className="grid grid-cols-2 gap-6">
                  <InputGroup label="Tax Rate (%)">
                    <StyledInput
                      type="number"
                      step="0.1"
                      value={maxAppTax}
                      onChange={(e) =>
                        setMaxAppTax(
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Est. Fees ($)">
                    <StyledInput
                      type="number"
                      value={maxAppFees}
                      onChange={(e) =>
                        setMaxAppFees(
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                    />
                  </InputGroup>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <InputGroup label="Cash Down ($)">
                    <StyledInput
                      type="number"
                      value={maxAppDown}
                      onChange={(e) =>
                        setMaxAppDown(
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Trade Equity ($)">
                    <StyledInput
                      type="number"
                      value={maxAppTradeEq}
                      onChange={(e) =>
                        setMaxAppTradeEq(
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                    />
                  </InputGroup>
                </div>
                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <ResultDisplay
                    label="Max Vehicle Price"
                    value={formatCurrency(maxApprovalResult)}
                    valueColorClass="text-green-600 dark:text-green-400"
                    subLabel="Before Tax & Fees"
                  />
                </div>
              </div>
            )}

            {activeTab === "warranty" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="grid grid-cols-2 gap-6">
                  <InputGroup label="Warranty Cost / Month ($)">
                    <StyledInput
                      type="number"
                      value={warrCostMo}
                      onChange={(e) =>
                        setWarrCostMo(
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Loan Term (Mo)">
                    <StyledSelect
                      value={warrTerm}
                      onChange={(e) => setWarrTerm(Number(e.target.value))}
                    >
                      {[36, 48, 60, 72, 84].map((t) => (
                        <option key={t} value={t}>
                          {t} Months
                        </option>
                      ))}
                    </StyledSelect>
                  </InputGroup>
                </div>
                <InputGroup label="Est. Total Repair Cost ($)">
                  <StyledInput
                    type="number"
                    value={warrRepairCost}
                    onChange={(e) =>
                      setWarrRepairCost(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    placeholder="e.g. 4000 (Engine/Trans)"
                  />
                </InputGroup>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-slate-600 dark:text-slate-400">
                        Total Warranty Cost
                      </span>
                      <span className="text-slate-900 dark:text-white">
                        {formatCurrency(warrantyAnalysis.totalWarrantyCost)}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (warrantyAnalysis.totalWarrantyCost /
                              (warrantyAnalysis.totalWarrantyCost +
                                Number(warrRepairCost))) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-slate-600 dark:text-slate-400">
                        Est. Repair Risk
                      </span>
                      <span className="text-slate-900 dark:text-white">
                        {formatCurrency(Number(warrRepairCost))}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (Number(warrRepairCost) /
                              (warrantyAnalysis.totalWarrantyCost +
                                Number(warrRepairCost))) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-xl border ${
                      warrantyAnalysis.isPositive
                        ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                        : "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800"
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Potential Savings
                    </p>
                    <p
                      className={`text-2xl font-bold ${
                        warrantyAnalysis.isPositive
                          ? "text-green-600 dark:text-green-400"
                          : "text-orange-600 dark:text-orange-400"
                      }`}
                    >
                      {formatCurrency(warrantyAnalysis.potentialSavings)}
                    </p>
                    <p className="text-xs mt-1 opacity-80">
                      {warrantyAnalysis.isPositive
                        ? "It's cheaper to protect the vehicle."
                        : "Warranty cost exceeds estimated repairs."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "notes" && (
              <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
                <textarea
                  className="flex-1 w-full p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none font-mono text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 min-h-[400px]"
                  placeholder="Type your notes here..."
                  value={scratchPadNotes}
                  onChange={(e) => setScratchPadNotes(e.target.value)}
                />
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Icons.CheckCircleIcon className="w-3 h-3 text-green-500" />
                  Notes are automatically saved with the deal.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinanceTools;
