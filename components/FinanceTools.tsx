import React, { useState, useMemo, useEffect } from "react";
import { calculateMonthlyPayment, calculateLoanAmount } from "../services/calculator";
import { formatCurrency } from "./common/TableCell";
import * as Icons from "./common/Icons";
import { DealData, CalculatedVehicle, LenderProfile, FilterData } from "../types";
import { DocumentScanner } from "./DocumentScanner";
import { useRovingTabs } from "../hooks/useRovingTabs";
// FinanceTools is already a lazy route, including its lightweight native charts.
import { PaymentBreakdownChart, LenderComparisonChart } from "./DealCharts";

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

/** Text marker for the better reserve option, so it isn't signalled by color alone. [aria #31] */
const HigherBadge: React.FC = () => (
  <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold leading-none bg-[var(--color-success)] text-[var(--on-success)]">
    Higher
  </span>
);

/**
 * Screen-reader mirror of the active calculator's result. The visible numbers
 * update on every keystroke; this announces the settled result once typing
 * pauses (~500ms) so a screen reader isn't read every intermediate value.
 * Remounted per tool (keyed by the caller) so switching tools doesn't announce.
 * [aria #13]
 */
const RESULT_ANNOUNCE_DELAY_MS = 500;
const LiveResults: React.FC<{ text: string }> = ({ text }) => {
  const [announced, setAnnounced] = useState(text);
  useEffect(() => {
    if (text === announced) return;
    const id = window.setTimeout(() => setAnnounced(text), RESULT_ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [text, announced]);
  return (
    <output aria-live="polite" aria-atomic="true" className="sr-only">
      {announced}
    </output>
  );
};

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

  // Tracks whether .finance-tools-nav is currently the ≤800px horizontal
  // scrolling row (index.css) so the roving-tabs hook can announce the
  // layout's actual axis instead of a fixed one. [a11y]
  const [isNarrowNav, setIsNarrowNav] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 800px)");
    const syncIsNarrowNav = () => setIsNarrowNav(media.matches);
    syncIsNarrowNav();
    media.addEventListener?.("change", syncIsNarrowNav);
    return () => media.removeEventListener?.("change", syncIsNarrowNav);
  }, []);

  // --- Defaults from Props ---
  const defaultPrice: number | "" = activeVehicle
    ? typeof activeVehicle.amountToFinance === "number" &&
      Number.isFinite(activeVehicle.amountToFinance)
      ? activeVehicle.amountToFinance
      : ""
    : 30000;
  const defaultRate: number | "" = dealData
    ? typeof dealData.interestRate === "number" && Number.isFinite(dealData.interestRate)
      ? dealData.interestRate
      : ""
    : 7.99;
  const defaultTermVal = dealData ? dealData.loanTerm : 72;

  // --- Reserve Calculator State ---
  const [resAmount, setResAmount] = useState<number | "">(defaultPrice);
  const [buyRate, setBuyRate] = useState<number | "">(defaultRate);
  const [sellRate, setSellRate] = useState<number | "">(defaultRate === "" ? "" : defaultRate + 2);
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
    // A cleared APR arrives as "" at runtime (the DealData type lies). The old
    // code string-concatenated it: "" + 2 → "2" → a fabricated 2% sell rate fed
    // into the reserve calc. Clear rates when no real rate exists. [C-modals]
    const rawRate = dealData.interestRate as number | "";
    const rate = typeof rawRate === "number" && Number.isFinite(rawRate) ? rawRate : null;
    const term = dealData.loanTerm;

    // Sync the financed amount, not the sticker price, into the reserve calc —
    // reserve is earned on the amount financed.
    const principal =
      typeof activeVehicle.amountToFinance === "number" &&
      Number.isFinite(activeVehicle.amountToFinance)
        ? activeVehicle.amountToFinance
        : "";

    setResAmount(principal);
    setBuyRate(rate ?? "");
    setSellRate(rate === null ? "" : rate + 2);
    setPayRate(rate ?? "");
    setBudgetRate(rate ?? "");
    setCompRate(rate ?? "");
    setResTerm(term);

    setPayAmount(principal);
    setPayTerm(term);

    setBudgetTerm(term);

    setCompAmount(principal);
  };

  // --- Calculations ---
  const reserveComplete =
    [resAmount, buyRate, sellRate, splitPercent, flatPercent].every(
      (value) => typeof value === "number" && Number.isFinite(value) && value >= 0
    ) &&
    Number(resAmount) > 0 &&
    resTerm > 0 &&
    Number(splitPercent) <= 100 &&
    Number(flatPercent) <= 100;
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
    if (payAmount === "" || payRate === "") return "N/A";
    const p = Number(payAmount) || 0;
    const r = Number(payRate) || 0;
    const t = Number(payTerm) || 0;
    return calculateMonthlyPayment(p, r, t);
  }, [payAmount, payRate, payTerm]);

  const budgetResult = useMemo(() => {
    if (budgetPmt === "" || budgetRate === "")
      return { maxLoan: "N/A" as const, maxPrice: "N/A" as const };
    const pmt = Number(budgetPmt) || 0;
    const r = Number(budgetRate) || 0;
    const t = Number(budgetTerm) || 0;
    const down = Number(budgetDown) || 0;

    const maxLoan = calculateLoanAmount(pmt, r, t);

    if (typeof maxLoan !== "number") return { maxLoan: maxLoan, maxPrice: maxLoan };

    const maxPrice = maxLoan + down;
    return { maxLoan, maxPrice };
  }, [budgetPmt, budgetRate, budgetTerm, budgetDown]);

  const compareResults = useMemo(() => {
    const p = Number(compAmount) || 0;
    const r = Number(compRate) || 0;
    const terms = [24, 36, 48, 54, 60, 66, 72, 75, 84, 96];
    return terms.map((t) => ({
      term: t,
      payment:
        compAmount === "" || compRate === "" ? ("N/A" as const) : calculateMonthlyPayment(p, r, t),
    }));
  }, [compAmount, compRate]);

  const qualifyResult = useMemo(() => {
    const pmt = Number(qualPmt) || 0;
    const inc = Number(qualIncome) || 0;
    const limit = Number(qualLimit) || 0;
    if (
      qualPmt === "" ||
      qualIncome === "" ||
      qualLimit === "" ||
      inc <= 0 ||
      pmt < 0 ||
      limit <= 0 ||
      limit > 100
    )
      return { ratio: null, status: "Inputs needed" };
    const ratio = (pmt / inc) * 100;
    const status = ratio <= limit ? "Within entered PTI limit" : "Over entered PTI limit";
    return { ratio, status };
  }, [qualPmt, qualIncome, qualLimit]);

  const maxApprovalResult = useMemo(() => {
    if (
      [maxAppAmount, maxAppTax, maxAppFees, maxAppDown, maxAppTradeEq].some(
        (value) => value === "" || !Number.isFinite(value)
      ) ||
      Number(maxAppAmount) <= 0 ||
      Number(maxAppTax) < 0 ||
      Number(maxAppTax) > 100 ||
      Number(maxAppFees) < 0 ||
      Number(maxAppDown) < 0
    )
      return "N/A" as const;
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
    if (
      [warrCostMo, warrRepairCost].some(
        (value) => value === "" || !Number.isFinite(value) || Number(value) < 0
      ) ||
      warrTerm <= 0
    )
      return {
        totalWarrantyCost: "N/A" as const,
        potentialSavings: "N/A" as const,
        isPositive: false,
        complete: false,
        costShare: 0,
        repairShare: 0,
      };
    const costMo = Number(warrCostMo) || 0;
    const term = Number(warrTerm) || 0;
    const repairCost = Number(warrRepairCost) || 0;

    const totalWarrantyCost = costMo * term;
    const potentialSavings = repairCost - totalWarrantyCost;
    const isPositive = potentialSavings > 0;

    const combined = totalWarrantyCost + repairCost;
    return {
      totalWarrantyCost,
      potentialSavings,
      isPositive,
      complete: true,
      costShare: combined > 0 ? (totalWarrantyCost / combined) * 100 : 0,
      repairShare: combined > 0 ? (repairCost / combined) * 100 : 0,
    };
  }, [warrCostMo, warrTerm, warrRepairCost]);

  // One-sentence summary of whatever the active tool is showing, for the
  // polite live region. Empty for tools with no computed result. [aria #13]
  const resultSummary = useMemo(() => {
    switch (activeTab) {
      case "reserve":
        if (!reserveComplete)
          return "Complete the amount, rates, split and flat fee to compare estimates.";
        return `Interest spread estimate ${formatCurrency(reserveStats.totalReserve)}. Split ${splitPercent} percent ${formatCurrency(reserveStats.dealerSplit)}. Flat ${flatPercent} percent ${formatCurrency(reserveStats.flatFee)}. ${
          reserveStats.dealerSplit >= reserveStats.flatFee ? "Split" : "Flat"
        } is higher.`;
      case "payment":
        return `Monthly payment ${formatCurrency(paymentResult)}.`;
      case "budget":
        return `Max loan amount ${formatCurrency(budgetResult.maxLoan)}. Max out-the-door price ${formatCurrency(budgetResult.maxPrice)}.`;
      case "compare":
        return compareResults
          .map((r) => `${r.term} months ${formatCurrency(r.payment)}`)
          .join(". ");
      case "qualify":
        return `Payment-to-income ratio ${qualifyResult.ratio?.toFixed(1) ?? "—"} percent. ${qualifyResult.status}.`;
      case "max":
        return `Max vehicle price ${formatCurrency(maxApprovalResult)}, before tax and fees.`;
      case "warranty":
        return `Total warranty cost ${formatCurrency(warrantyAnalysis.totalWarrantyCost)}. Potential savings ${formatCurrency(warrantyAnalysis.potentialSavings)}.`;
      default:
        return "";
    }
  }, [
    activeTab,
    reserveStats,
    reserveComplete,
    splitPercent,
    flatPercent,
    paymentResult,
    budgetResult,
    compareResults,
    qualifyResult,
    maxApprovalResult,
    warrantyAnalysis,
  ]);

  // Use the module-scope navigation items (includes Analytics tab)
  const navItems = NAV_ITEMS;
  const tabKeys = useMemo(() => navItems.map((n) => n.id), [navItems]);
  // WAI-ARIA tabs: roving tabindex + arrow keys, panel linked to its tab.
  // "both" because this tablist is vertical at desktop widths but reflows to
  // a horizontal scrolling row at <=800px (index.css .finance-tools-nav);
  // ariaOrientation announces whichever axis is actually drawn right now,
  // since WAI-ARIA's implicit tablist default ("horizontal") would otherwise
  // misdescribe the desktop layout. [a11y]
  const tabs = useRovingTabs({
    keys: tabKeys,
    active: activeTab,
    onChange: setActiveTab,
    idPrefix: "finance-tools",
    orientation: "both",
    ariaOrientation: isNarrowNav ? "horizontal" : "vertical",
  });

  return (
    <div
      className="finance-tools-shell flex min-h-[600px] overflow-hidden bg-[var(--color-bg)] border border-[var(--color-border)]"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      {/* Sidebar */}
      <div className="finance-tools-sidebar w-64 bg-[var(--color-bg-subtle)] border-r border-[var(--color-border)] flex flex-col">
        <div className="finance-tools-heading p-4 border-b border-[var(--color-border)]">
          <h1 className="text-lg font-semibold text-[var(--color-text)]">Finance tools</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Calculators & utilities</p>
        </div>
        <div
          className="finance-tools-nav flex-1 p-2 space-y-1"
          aria-label="Finance tools"
          {...tabs.getTabListProps()}
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              {...tabs.getTabProps(item.id)}
              className={`finance-tools-tab w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] ${
                activeTab === item.id
                  ? /* on-subtle text token, not primary-on-subtle (≈3.3:1) — WCAG 1.4.3 */
                    "bg-[var(--color-primary-subtle)] text-[var(--color-text)] font-semibold"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
        {dealData && (
          <div className="finance-tools-reset p-4 border-t border-[var(--color-border)]">
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
      <div className="finance-tools-main flex-1 flex flex-col bg-transparent">
        <div className="finance-tools-content flex-1 p-6" {...tabs.getPanelProps(activeTab)}>
          <div className="max-w-2xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-[var(--color-text)]">
                {navItems.find((n) => n.id === activeTab)?.label}
              </h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                {activeTab === "reserve" &&
                  "Compare interest-spread and flat-fee estimates. Actual reserve depends on the lender’s agreement."}
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
            <LiveResults key={activeTab} text={resultSummary} />
            {activeTab === "analytics" && dealData && (
              <div className="space-y-6">
                <div className="p-4 bg-[var(--color-bg-subtle)] rounded-md border border-[var(--color-border)]">
                  <h3 className="font-semibold text-[var(--color-text)] mb-4">Payment breakdown</h3>
                  <PaymentBreakdownChart
                    dealData={dealData}
                    activeVehicle={activeVehicle || null}
                  />
                </div>
                <div className="p-4 bg-[var(--color-bg-subtle)] rounded-md border border-[var(--color-border)]">
                  <h3 className="font-semibold text-[var(--color-text)] mb-4">
                    Matched lender payments (est.)
                  </h3>
                  <LenderComparisonChart
                    dealData={dealData}
                    activeVehicle={activeVehicle || null}
                    lenderProfiles={lenderProfiles}
                    customerFilters={customerFilters}
                  />
                </div>
              </div>
            )}
            {activeTab === "reserve" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InputGroup label="Amount financed ($)" htmlFor="reserve-amount">
                    <StyledInput
                      id="reserve-amount"
                      type="number"
                      value={resAmount}
                      onChange={(e) =>
                        setResAmount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Term (mo)" htmlFor="reserve-term">
                    <StyledSelect
                      id="reserve-term"
                      value={resTerm}
                      onChange={(e) => setResTerm(Number(e.target.value))}
                    >
                      <option value={0} disabled>
                        Select term
                      </option>
                      {[24, 36, 48, 54, 60, 66, 72, 75, 84, 96].map((t) => (
                        <option key={t} value={t}>
                          {t} Months
                        </option>
                      ))}
                    </StyledSelect>
                  </InputGroup>
                  <InputGroup label="Buy rate (%)" htmlFor="reserve-buy-rate">
                    <StyledInput
                      id="reserve-buy-rate"
                      type="number"
                      step="0.01"
                      value={buyRate}
                      onChange={(e) =>
                        setBuyRate(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Sell rate (%)" htmlFor="reserve-sell-rate">
                    <StyledInput
                      id="reserve-sell-rate"
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
                      type="number"
                      value={splitPercent}
                      onChange={(e) =>
                        setSplitPercent(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Flat fee comparison (%)" htmlFor="reserve-flat-percent">
                    <StyledInput
                      id="reserve-flat-percent"
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
                    label="Interest spread estimate"
                    value={formatCurrency(reserveComplete ? reserveStats.totalReserve : "N/A")}
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
                        reserveComplete && reserveStats.dealerSplit >= reserveStats.flatFee
                          ? "bg-[var(--color-success-subtle)] border-[var(--color-success)]/30"
                          : "bg-[var(--color-bg-subtle)] border-[var(--color-border)]"
                      }`}
                    >
                      <p className="text-xs font-medium text-[var(--color-success)] mb-1 flex items-center gap-1.5">
                        Split ({splitPercent}%)
                        {reserveComplete && reserveStats.dealerSplit >= reserveStats.flatFee && (
                          <HigherBadge />
                        )}
                      </p>
                      <p
                        className={`text-2xl font-semibold tabular-nums ${
                          reserveComplete && reserveStats.dealerSplit >= reserveStats.flatFee
                            ? "text-[var(--color-success)]"
                            : "text-[var(--color-text)]"
                        }`}
                      >
                        {formatCurrency(reserveComplete ? reserveStats.dealerSplit : "N/A")}
                      </p>
                    </div>
                    <div
                      className={`p-4 rounded-md border transition-colors ${
                        reserveComplete && reserveStats.flatFee > reserveStats.dealerSplit
                          ? "bg-[var(--color-success-subtle)] border-[var(--color-success)]/30"
                          : "bg-[var(--color-bg-subtle)] border-[var(--color-border)]"
                      }`}
                    >
                      <p className="text-xs font-medium text-[var(--color-success)] mb-1 flex items-center gap-1.5">
                        Flat ({flatPercent}%)
                        {reserveComplete && reserveStats.flatFee > reserveStats.dealerSplit && (
                          <HigherBadge />
                        )}
                      </p>
                      <p
                        className={`text-2xl font-semibold tabular-nums ${
                          reserveComplete && reserveStats.flatFee > reserveStats.dealerSplit
                            ? "text-[var(--color-success)]"
                            : "text-[var(--color-text)]"
                        }`}
                      >
                        {formatCurrency(reserveComplete ? reserveStats.flatFee : "N/A")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === "payment" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6">
                  <InputGroup label="Loan amount ($)" htmlFor="payment-loan-amount">
                    <StyledInput
                      id="payment-loan-amount"
                      type="number"
                      value={payAmount}
                      onChange={(e) =>
                        setPayAmount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <div className="grid grid-cols-2 gap-6">
                    <InputGroup label="Interest rate (%)" htmlFor="payment-interest-rate">
                      <StyledInput
                        id="payment-interest-rate"
                        type="number"
                        step="0.1"
                        value={payRate}
                        onChange={(e) =>
                          setPayRate(e.target.value === "" ? "" : Number(e.target.value))
                        }
                      />
                    </InputGroup>
                    <InputGroup label="Term (mo)" htmlFor="payment-term">
                      <StyledSelect
                        id="payment-term"
                        value={payTerm}
                        onChange={(e) => setPayTerm(Number(e.target.value))}
                      >
                        <option value={0} disabled>
                          Select term
                        </option>
                        {[24, 36, 48, 54, 60, 66, 72, 75, 84, 96].map((t) => (
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
              <div className="space-y-6">
                <InputGroup label="Max monthly payment ($)" htmlFor="budget-max-payment">
                  <StyledInput
                    id="budget-max-payment"
                    type="number"
                    value={budgetPmt}
                    onChange={(e) =>
                      setBudgetPmt(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </InputGroup>
                <div className="grid grid-cols-2 gap-6">
                  <InputGroup label="Interest rate (%)" htmlFor="budget-interest-rate">
                    <StyledInput
                      id="budget-interest-rate"
                      type="number"
                      step="0.1"
                      value={budgetRate}
                      onChange={(e) =>
                        setBudgetRate(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Term (mo)" htmlFor="budget-term">
                    <StyledSelect
                      id="budget-term"
                      value={budgetTerm}
                      onChange={(e) => setBudgetTerm(Number(e.target.value))}
                    >
                      <option value={0} disabled>
                        Select term
                      </option>
                      {[24, 36, 48, 54, 60, 66, 72, 75, 84, 96].map((t) => (
                        <option key={t} value={t}>
                          {t} Months
                        </option>
                      ))}
                    </StyledSelect>
                  </InputGroup>
                </div>
                <InputGroup label="Cash down ($)" htmlFor="budget-cash-down">
                  <StyledInput
                    id="budget-cash-down"
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
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InputGroup label="Loan amount ($)" htmlFor="compare-loan-amount">
                    <StyledInput
                      id="compare-loan-amount"
                      type="number"
                      value={compAmount}
                      onChange={(e) =>
                        setCompAmount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Interest rate (%)" htmlFor="compare-interest-rate">
                    <StyledInput
                      id="compare-interest-rate"
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
              <div className="space-y-6">
                <InputGroup label="Monthly payment ($)" htmlFor="qualify-payment">
                  <StyledInput
                    id="qualify-payment"
                    type="number"
                    value={qualPmt}
                    onChange={(e) =>
                      setQualPmt(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </InputGroup>
                <InputGroup label="Monthly income ($)" htmlFor="qualify-income">
                  <div className="flex gap-2">
                    <StyledInput
                      id="qualify-income"
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
                <InputGroup label="Max PTI limit (%)" htmlFor="qualify-pti-limit">
                  <StyledInput
                    id="qualify-pti-limit"
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
                    value={`${qualifyResult.ratio?.toFixed(1) ?? "—"}%`}
                    valueColorClass={
                      qualifyResult.status === "Within entered PTI limit"
                        ? "text-[var(--color-success)]"
                        : "text-[var(--color-danger)]"
                    }
                    subLabel={qualifyResult.status}
                  />
                </div>
              </div>
            )}
            {activeTab === "max" && (
              <div className="space-y-6">
                <InputGroup label="Bank approval amount ($)" htmlFor="max-approval-amount">
                  <StyledInput
                    id="max-approval-amount"
                    type="number"
                    value={maxAppAmount}
                    onChange={(e) =>
                      setMaxAppAmount(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </InputGroup>
                <div className="grid grid-cols-2 gap-6">
                  <InputGroup label="Tax rate (%)" htmlFor="max-tax-rate">
                    <StyledInput
                      id="max-tax-rate"
                      type="number"
                      step="0.1"
                      value={maxAppTax}
                      onChange={(e) =>
                        setMaxAppTax(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Est. fees ($)" htmlFor="max-fees">
                    <StyledInput
                      id="max-fees"
                      type="number"
                      value={maxAppFees}
                      onChange={(e) =>
                        setMaxAppFees(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <InputGroup label="Cash down ($)" htmlFor="max-cash-down">
                    <StyledInput
                      id="max-cash-down"
                      type="number"
                      value={maxAppDown}
                      onChange={(e) =>
                        setMaxAppDown(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Trade equity ($)" htmlFor="max-trade-equity">
                    <StyledInput
                      id="max-trade-equity"
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
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <InputGroup label="Warranty cost / month ($)" htmlFor="warranty-cost-month">
                    <StyledInput
                      id="warranty-cost-month"
                      type="number"
                      value={warrCostMo}
                      onChange={(e) =>
                        setWarrCostMo(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Loan term (mo)" htmlFor="warranty-term">
                    <StyledSelect
                      id="warranty-term"
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
                <InputGroup label="Est. total repair cost ($)" htmlFor="warranty-repair-cost">
                  <StyledInput
                    id="warranty-repair-cost"
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
                          width: `${warrantyAnalysis.costShare}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-[var(--color-text-muted)]">
                        Entered repair estimate
                      </span>
                      <span className="text-[var(--color-text)]">
                        {formatCurrency(warrantyAnalysis.complete ? Number(warrRepairCost) : "N/A")}
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--color-bg-muted)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-danger)] rounded-full"
                        style={{
                          width: `${warrantyAnalysis.repairShare}%`,
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
                      {!warrantyAnalysis.complete
                        ? "Enter product cost, term and an estimated covered repair cost."
                        : warrantyAnalysis.isPositive
                          ? "Entered repair estimate exceeds product cost. Confirm coverage, exclusions and deductibles."
                          : "Product cost exceeds the entered repair estimate."}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {activeTab === "notes" && (
              <div className="h-full flex flex-col">
                <textarea
                  id="finance-tools-notes"
                  aria-label="Finance tools notes"
                  className="flex-1 w-full p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-subtle)] resize-none text-sm text-[var(--color-text)] placeholder-[var(--color-text-subtle)] min-h-[400px] transition-colors duration-[var(--duration-fast)]"
                  placeholder="Type your notes here…"
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
