import React, { useState, useMemo, lazy, Suspense } from "react";
import { calculateMonthlyPayment, calculateLoanAmount } from "../services/calculator";
import { formatCurrency } from "./common/TableCell";
import * as Icons from "./common/Icons";
import { DealData, CalculatedVehicle, LenderProfile, FilterData } from "../types";
import { DocumentScanner } from "./DocumentScanner";

// Lazy load heavy chart components (recharts) so the library is only fetched
// when the Analytics tab is opened inside the already-lazy FinanceTools.
// This further splits recharts out of the FinanceTools chunk for better perf.
const PaymentBreakdownChart = lazy(() =>
  import("./DealCharts").then((m) => ({ default: m.PaymentBreakdownChart }))
);
const LenderComparisonChart = lazy(() =>
  import("./DealCharts").then((m) => ({ default: m.LenderComparisonChart }))
);

// Hoisted + memoized presentational components (were defined inside FinanceTools
// causing fresh function identities on every render of the tools panel).
const InputGroup: React.FC<{
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
}> = React.memo(({ label, children, htmlFor }) => (
  <div className="flex flex-col">
    <label htmlFor={htmlFor} className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">
      {label}
    </label>
    {children}
  </div>
));

const StyledInput = React.memo((props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className="w-full px-3 py-2 text-sm bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded focus:outline-none placeholder-[var(--color-text-subtle)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-subtle)] transition-colors duration-[var(--duration-fast)] text-[var(--color-text)] disabled:opacity-50"
  />
));

const StyledSelect = React.memo((props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className="w-full px-3 py-2 text-sm bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded focus:outline-none text-[var(--color-text)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-subtle)] transition-colors duration-[var(--duration-fast)]"
  />
));

const ResultDisplay = React.memo(
  ({
    label,
    value,
    valueColorClass = "text-[var(--color-primary)]",
    subLabel,
  }: {
    label: string;
    value: string | React.ReactNode;
    valueColorClass?: string;
    subLabel?: string;
  }) => (
    <div className="flex justify-between items-center p-4 bg-[var(--color-bg)] rounded-md border border-[var(--color-border)]">
      <div className="flex flex-col">
        <span className="font-medium text-[var(--color-text)] text-sm">{label}</span>
        {subLabel && (
          <span className="text-xs text-[var(--color-text-muted)] mt-0.5">{subLabel}</span>
        )}
      </div>
      <span className={`font-semibold text-xl tabular-nums ${valueColorClass}`}>{value}</span>
    </div>
  )
);

type ToolTab =
  | "reserve"
  | "payment"
  | "budget"
  | "compare"
  | "qualify"
  | "max"
  | "warranty"
  | "notes"
  | "analytics";

// --- Sidebar Navigation Items ---
const NAV_ITEMS: { id: ToolTab; label: string; icon: React.ReactNode }[] = [
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
    id: "analytics",
    label: "Analytics",
    icon: <Icons.ChartPieIcon className="w-5 h-5" />,
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

interface FinanceToolsProps {
  scratchPadNotes: string;
  setScratchPadNotes: (notes: string) => void;
  dealData?: DealData;
  activeVehicle?: CalculatedVehicle | null;
  // Optional: provided by FloatingToolsPanel (ToolProps); used by the
  // lender comparison chart so it reflects real dealer-entered programs.
  lenderProfiles?: LenderProfile[];
  customerFilters?: FilterData;
}

const FinanceTools: React.FC<FinanceToolsProps> = ({
  scratchPadNotes,
  setScratchPadNotes,
  dealData,
  activeVehicle,
  lenderProfiles,
  customerFilters,
}) => {
  const [activeTab, setActiveTab] = useState<ToolTab>("reserve");

  // --- Defaults from Props ---
  const defaultPrice = typeof activeVehicle?.price === "number" ? activeVehicle.price : 30000;
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

  // --- Document Scanner State ---
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const handleSyncToDeal = () => {
    if (!dealData || !activeVehicle) return;
    const price = typeof activeVehicle.price === "number" ? activeVehicle.price : 30000;
    // A cleared APR arrives as "" at runtime (the DealData type lies). The old
    // code string-concatenated it: "" + 2 → "2" → a fabricated 2% sell rate fed
    // into the reserve calc. Skip rate syncing when no real rate exists. [C-modals]
    const rawRate = dealData.interestRate as number | "";
    const rate = typeof rawRate === "number" && Number.isFinite(rawRate) ? rawRate : null;
    const term = dealData.loanTerm;

    // Sync the financed amount, not the sticker price, into the reserve calc —
    // reserve is earned on the amount financed.
    const principal =
      typeof activeVehicle.amountToFinance === "number" ? activeVehicle.amountToFinance : price;

    setResAmount(principal);
    if (rate !== null) {
      setBuyRate(rate);
      setSellRate(rate + 2);
      setPayRate(rate);
      setBudgetRate(rate);
      setCompRate(rate);
    }
    setResTerm(term);

    setPayAmount(price);
    setPayTerm(term);

    setBudgetTerm(term);

    setCompAmount(price);
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
      return { totalReserve: 0, dealerSplit: 0, flatFee: 0, sellBelowBuy: false };

    const paymentBuy = calculateMonthlyPayment(principal, buy, t);
    const paymentSell = calculateMonthlyPayment(principal, sell, t);

    if (typeof paymentBuy !== "number" || typeof paymentSell !== "number")
      return { totalReserve: 0, dealerSplit: 0, flatFee: 0, sellBelowBuy: false };

    // Selling below the buy rate yields a negative reserve, which is never a real
    // structure — surface it as a warning rather than displaying a misleading
    // negative dollar figure.
    const sellBelowBuy = sell < buy;
    const rawReserve = (paymentSell - paymentBuy) * t;
    const totalReserve = sellBelowBuy ? 0 : rawReserve;
    const dealerSplit = totalReserve * (split / 100);
    const flatFee = principal * (flat / 100);

    return { totalReserve, dealerSplit, flatFee, sellBelowBuy };
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

  // Use the module-scope navigation items (includes Analytics tab)
  const navItems = NAV_ITEMS;

  return (
    <div className="flex min-h-[600px] rounded-lg overflow-hidden shadow-sm bg-[var(--color-bg)] border border-[var(--color-border)]">
      {/* Sidebar */}
      <div className="w-64 bg-[var(--color-bg-subtle)] border-r border-[var(--color-border)] flex flex-col">
        <div className="p-4 border-b border-[var(--color-border)]">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Finance tools</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Calculators & utilities</p>
        </div>
        <nav className="flex-1 p-2 space-y-1" aria-label="Finance tools">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              role="tab"
              aria-selected={activeTab === item.id}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors duration-[var(--duration-fast)] ${
                activeTab === item.id
                  ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        {dealData && (
          <div className="p-4 border-t border-[var(--color-border)]">
            <button
              onClick={handleSyncToDeal}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text)] transition-colors duration-[var(--duration-fast)]"
            >
              <Icons.ArrowPathIcon className="w-3.5 h-3.5" />
              Reset to active deal
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-transparent">
        <div className="flex-1 p-6">
          <div className="max-w-2xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-[var(--color-text)]">
                {navItems.find((n) => n.id === activeTab)?.label}
              </h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                {activeTab === "reserve" && "Calculate dealer reserve and splits."}
                {activeTab === "payment" && "Estimate monthly payments."}
                {activeTab === "budget" && "Find max loan from monthly budget."}
                {activeTab === "compare" && "Compare terms side-by-side."}
                {activeTab === "qualify" && "Check payment-to-income ratio."}
                {activeTab === "max" && "Calculate max approval amount."}
                {activeTab === "warranty" && "Analyze warranty value."}
                {activeTab === "notes" && "Deal specific notes."}
                {activeTab === "analytics" && "Visual deal analysis."}
              </p>
            </div>
            {activeTab === "analytics" && dealData && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="p-4 bg-[var(--color-bg-subtle)] rounded-md border border-[var(--color-border)]">
                  <h4 className="font-semibold text-[var(--color-text)] mb-4">Payment breakdown</h4>
                  <Suspense
                    fallback={
                      <div className="h-64 flex items-center justify-center text-[var(--color-text-muted)] text-sm">
                        Loading chart…
                      </div>
                    }
                  >
                    <PaymentBreakdownChart
                      dealData={dealData}
                      activeVehicle={activeVehicle || null}
                    />
                  </Suspense>
                </div>
                <div className="p-4 bg-[var(--color-bg-subtle)] rounded-md border border-[var(--color-border)]">
                  <h4 className="font-semibold text-[var(--color-text)] mb-4">
                    Matched lender payments (est.)
                  </h4>
                  <Suspense
                    fallback={
                      <div className="h-64 flex items-center justify-center text-[var(--color-text-muted)] text-sm">
                        Loading chart…
                      </div>
                    }
                  >
                    <LenderComparisonChart
                      dealData={dealData}
                      activeVehicle={activeVehicle || null}
                      lenderProfiles={lenderProfiles}
                      customerFilters={customerFilters}
                    />
                  </Suspense>
                </div>
              </div>
            )}
            {activeTab === "reserve" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InputGroup label="Amount Financed ($)" htmlFor="reserve-amount">
                    <StyledInput
                      id="reserve-amount"
                      aria-label="Reserve amount financed"
                      type="number"
                      value={resAmount}
                      onChange={(e) =>
                        setResAmount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Term (Mo)" htmlFor="reserve-term">
                    <StyledSelect
                      id="reserve-term"
                      aria-label="Reserve term"
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
                  <InputGroup label="Buy Rate (%)" htmlFor="reserve-buy-rate">
                    <StyledInput
                      id="reserve-buy-rate"
                      aria-label="Reserve buy rate"
                      type="number"
                      step="0.01"
                      value={buyRate}
                      onChange={(e) =>
                        setBuyRate(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Sell Rate (%)" htmlFor="reserve-sell-rate">
                    <StyledInput
                      id="reserve-sell-rate"
                      aria-label="Reserve sell rate"
                      type="number"
                      step="0.01"
                      value={sellRate}
                      onChange={(e) =>
                        setSellRate(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Split (%)" htmlFor="reserve-split-percent">
                    <StyledInput
                      id="reserve-split-percent"
                      aria-label="Reserve split percent"
                      type="number"
                      value={splitPercent}
                      onChange={(e) =>
                        setSplitPercent(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Flat Fee Comparison (%)" htmlFor="reserve-flat-percent">
                    <StyledInput
                      id="reserve-flat-percent"
                      aria-label="Reserve flat fee comparison percent"
                      type="number"
                      step="0.1"
                      value={flatPercent}
                      onChange={(e) =>
                        setFlatPercent(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                </div>

                <div className="space-y-3 pt-4 border-t border-[var(--color-border)]">
                  <ResultDisplay
                    label="Total reserve"
                    value={formatCurrency(reserveStats.totalReserve)}
                    valueColorClass="text-[var(--color-text)]"
                  />
                  {reserveStats.sellBelowBuy && (
                    <p role="alert" className="text-xs font-medium text-[var(--color-warning)]">
                      Sell rate is below the buy rate — reserve would be negative. Reserve shown as
                      $0.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div
                      className={`p-4 rounded-md border transition-colors ${
                        reserveStats.dealerSplit >= reserveStats.flatFee
                          ? "bg-[var(--color-success-subtle)] border-[var(--color-success)]/30"
                          : "bg-[var(--color-bg-subtle)] border-[var(--color-border)]"
                      }`}
                    >
                      <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
                        Split ({splitPercent}%)
                      </p>
                      <p
                        className={`text-2xl font-semibold tabular-nums ${
                          reserveStats.dealerSplit >= reserveStats.flatFee
                            ? "text-[var(--color-success)]"
                            : "text-[var(--color-text)]"
                        }`}
                      >
                        {formatCurrency(reserveStats.dealerSplit)}
                      </p>
                    </div>
                    <div
                      className={`p-4 rounded-md border transition-colors ${
                        reserveStats.flatFee > reserveStats.dealerSplit
                          ? "bg-[var(--color-success-subtle)] border-[var(--color-success)]/30"
                          : "bg-[var(--color-bg-subtle)] border-[var(--color-border)]"
                      }`}
                    >
                      <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
                        Flat ({flatPercent}%)
                      </p>
                      <p
                        className={`text-2xl font-semibold tabular-nums ${
                          reserveStats.flatFee > reserveStats.dealerSplit
                            ? "text-[var(--color-success)]"
                            : "text-[var(--color-text)]"
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
                  <InputGroup label="Loan Amount ($)" htmlFor="payment-loan-amount">
                    <StyledInput
                      id="payment-loan-amount"
                      aria-label="Payment loan amount"
                      type="number"
                      value={payAmount}
                      onChange={(e) =>
                        setPayAmount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <div className="grid grid-cols-2 gap-6">
                    <InputGroup label="Interest Rate (%)" htmlFor="payment-interest-rate">
                      <StyledInput
                        id="payment-interest-rate"
                        aria-label="Payment interest rate"
                        type="number"
                        step="0.1"
                        value={payRate}
                        onChange={(e) =>
                          setPayRate(e.target.value === "" ? "" : Number(e.target.value))
                        }
                      />
                    </InputGroup>
                    <InputGroup label="Term (Mo)" htmlFor="payment-term">
                      <StyledSelect
                        id="payment-term"
                        aria-label="Payment term"
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
                <div className="pt-6 border-t border-[var(--color-border)]">
                  <ResultDisplay
                    label="Monthly payment"
                    value={formatCurrency(paymentResult)}
                    valueColorClass="text-[var(--color-success)] text-3xl"
                  />
                </div>
              </div>
            )}
            {activeTab === "budget" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <InputGroup label="Max Monthly Payment ($)" htmlFor="budget-max-payment">
                  <StyledInput
                    id="budget-max-payment"
                    aria-label="Budget maximum monthly payment"
                    type="number"
                    value={budgetPmt}
                    onChange={(e) =>
                      setBudgetPmt(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </InputGroup>
                <div className="grid grid-cols-2 gap-6">
                  <InputGroup label="Interest Rate (%)" htmlFor="budget-interest-rate">
                    <StyledInput
                      id="budget-interest-rate"
                      aria-label="Budget interest rate"
                      type="number"
                      step="0.1"
                      value={budgetRate}
                      onChange={(e) =>
                        setBudgetRate(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Term (Mo)" htmlFor="budget-term">
                    <StyledSelect
                      id="budget-term"
                      aria-label="Budget term"
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
                <InputGroup label="Cash Down ($)" htmlFor="budget-cash-down">
                  <StyledInput
                    id="budget-cash-down"
                    aria-label="Budget cash down"
                    type="number"
                    value={budgetDown}
                    onChange={(e) =>
                      setBudgetDown(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </InputGroup>
                <div className="space-y-3 pt-6 border-t border-[var(--color-border)]">
                  <ResultDisplay
                    label="Max loan amount"
                    value={formatCurrency(budgetResult.maxLoan)}
                    valueColorClass="text-[var(--color-primary)]"
                  />
                  <ResultDisplay
                    label="Max OTD price"
                    subLabel="(Loan + down)"
                    value={formatCurrency(budgetResult.maxPrice)}
                    valueColorClass="text-[var(--color-success)]"
                  />
                </div>
              </div>
            )}
            {activeTab === "compare" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InputGroup label="Loan Amount ($)" htmlFor="compare-loan-amount">
                    <StyledInput
                      id="compare-loan-amount"
                      aria-label="Compare loan amount"
                      type="number"
                      value={compAmount}
                      onChange={(e) =>
                        setCompAmount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Interest Rate (%)" htmlFor="compare-interest-rate">
                    <StyledInput
                      id="compare-interest-rate"
                      aria-label="Compare interest rate"
                      type="number"
                      step="0.1"
                      value={compRate}
                      onChange={(e) =>
                        setCompRate(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-4">
                  {compareResults.map((res) => (
                    <div
                      key={res.term}
                      className="p-3 bg-[var(--color-bg-subtle)] rounded-md border border-[var(--color-border)] text-center"
                    >
                      <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
                        {res.term} months
                      </p>
                      <p className="text-lg font-semibold tabular-nums text-[var(--color-text)]">
                        {formatCurrency(res.payment)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === "qualify" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <InputGroup label="Monthly Payment ($)" htmlFor="qualify-payment">
                  <StyledInput
                    id="qualify-payment"
                    aria-label="Qualify monthly payment"
                    type="number"
                    value={qualPmt}
                    onChange={(e) =>
                      setQualPmt(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </InputGroup>
                <InputGroup label="Monthly Income ($)" htmlFor="qualify-income">
                  <div className="flex gap-2">
                    <StyledInput
                      id="qualify-income"
                      aria-label="Qualify monthly income"
                      type="number"
                      value={qualIncome}
                      onChange={(e) =>
                        setQualIncome(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                    <button
                      onClick={() => setIsScannerOpen(true)}
                      className="p-2 bg-[var(--color-bg-subtle)] text-[var(--color-primary)] rounded border border-[var(--color-border)] hover:bg-[var(--color-primary-subtle)] transition-colors duration-[var(--duration-fast)]"
                      title="Scan pay stub"
                      aria-label="Scan pay stub"
                    >
                      <Icons.CameraIcon className="w-5 h-5" />
                    </button>
                  </div>
                </InputGroup>
                {isScannerOpen && (
                  <DocumentScanner
                    onIncomeExtracted={(income) => {
                      setQualIncome(income);
                      setIsScannerOpen(false);
                    }}
                    onClose={() => setIsScannerOpen(false)}
                  />
                )}
                <InputGroup label="Max PTI Limit (%)" htmlFor="qualify-pti-limit">
                  <StyledInput
                    id="qualify-pti-limit"
                    aria-label="Qualify max PTI limit"
                    type="number"
                    value={qualLimit}
                    onChange={(e) =>
                      setQualLimit(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </InputGroup>
                <div className="pt-6 border-t border-[var(--color-border)]">
                  <ResultDisplay
                    label="PTI ratio"
                    value={`${qualifyResult.ratio.toFixed(1)}%`}
                    valueColorClass={
                      qualifyResult.status === "Qualified"
                        ? "text-[var(--color-success)]"
                        : "text-[var(--color-danger)]"
                    }
                    subLabel={qualifyResult.status}
                  />
                </div>
              </div>
            )}
            {activeTab === "max" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <InputGroup label="Bank Approval Amount ($)" htmlFor="max-approval-amount">
                  <StyledInput
                    id="max-approval-amount"
                    aria-label="Maximum approval amount"
                    type="number"
                    value={maxAppAmount}
                    onChange={(e) =>
                      setMaxAppAmount(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </InputGroup>
                <div className="grid grid-cols-2 gap-6">
                  <InputGroup label="Tax Rate (%)" htmlFor="max-tax-rate">
                    <StyledInput
                      id="max-tax-rate"
                      aria-label="Maximum approval tax rate"
                      type="number"
                      step="0.1"
                      value={maxAppTax}
                      onChange={(e) =>
                        setMaxAppTax(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Est. Fees ($)" htmlFor="max-fees">
                    <StyledInput
                      id="max-fees"
                      aria-label="Maximum approval estimated fees"
                      type="number"
                      value={maxAppFees}
                      onChange={(e) =>
                        setMaxAppFees(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <InputGroup label="Cash Down ($)" htmlFor="max-cash-down">
                    <StyledInput
                      id="max-cash-down"
                      aria-label="Maximum approval cash down"
                      type="number"
                      value={maxAppDown}
                      onChange={(e) =>
                        setMaxAppDown(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Trade Equity ($)" htmlFor="max-trade-equity">
                    <StyledInput
                      id="max-trade-equity"
                      aria-label="Maximum approval trade equity"
                      type="number"
                      value={maxAppTradeEq}
                      onChange={(e) =>
                        setMaxAppTradeEq(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                </div>
                <div className="pt-6 border-t border-[var(--color-border)]">
                  <ResultDisplay
                    label="Max vehicle price"
                    value={formatCurrency(maxApprovalResult)}
                    valueColorClass="text-[var(--color-success)]"
                    subLabel="Before tax & fees"
                  />
                </div>
              </div>
            )}
            {activeTab === "warranty" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="grid grid-cols-2 gap-6">
                  <InputGroup label="Warranty Cost / Month ($)" htmlFor="warranty-cost-month">
                    <StyledInput
                      id="warranty-cost-month"
                      aria-label="Warranty cost per month"
                      type="number"
                      value={warrCostMo}
                      onChange={(e) =>
                        setWarrCostMo(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Loan Term (Mo)" htmlFor="warranty-term">
                    <StyledSelect
                      id="warranty-term"
                      aria-label="Warranty loan term"
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
                <InputGroup label="Est. Total Repair Cost ($)" htmlFor="warranty-repair-cost">
                  <StyledInput
                    id="warranty-repair-cost"
                    aria-label="Estimated total repair cost"
                    type="number"
                    value={warrRepairCost}
                    onChange={(e) =>
                      setWarrRepairCost(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    placeholder="e.g. 4000 (Engine/Trans)"
                  />
                </InputGroup>

                <div className="pt-6 border-t border-[var(--color-border)] space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-[var(--color-text-muted)]">Total warranty cost</span>
                      <span className="text-[var(--color-text)]">
                        {formatCurrency(warrantyAnalysis.totalWarrantyCost)}
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--color-bg-muted)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-primary)] rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (warrantyAnalysis.totalWarrantyCost /
                              (warrantyAnalysis.totalWarrantyCost + Number(warrRepairCost))) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-[var(--color-text-muted)]">Est. repair risk</span>
                      <span className="text-[var(--color-text)]">
                        {formatCurrency(Number(warrRepairCost))}
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--color-bg-muted)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-danger)] rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (Number(warrRepairCost) /
                              (warrantyAnalysis.totalWarrantyCost + Number(warrRepairCost))) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-md border ${
                      warrantyAnalysis.isPositive
                        ? "bg-[var(--color-success-subtle)] border-[var(--color-success)]/30"
                        : "bg-[var(--color-warning-subtle)] border-[var(--color-warning)]/30"
                    }`}
                  >
                    <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
                      Potential savings
                    </p>
                    <p
                      className={`text-2xl font-semibold tabular-nums ${
                        warrantyAnalysis.isPositive
                          ? "text-[var(--color-success)]"
                          : "text-[var(--color-warning)]"
                      }`}
                    >
                      {formatCurrency(warrantyAnalysis.potentialSavings)}
                    </p>
                    <p className="text-xs mt-1 opacity-80 text-[var(--color-text-muted)]">
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
                  id="finance-tools-notes"
                  aria-label="Finance tools notes"
                  className="flex-1 w-full p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-subtle)] resize-none font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-subtle)] min-h-[400px] transition-colors duration-[var(--duration-fast)]"
                  placeholder="Type your notes here..."
                  value={scratchPadNotes}
                  onChange={(e) => setScratchPadNotes(e.target.value)}
                />
                <p className="mt-3 text-xs text-[var(--color-text-muted)] flex items-center gap-1">
                  <Icons.CheckCircleIcon className="w-3 h-3 text-[var(--color-success)]" />
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
