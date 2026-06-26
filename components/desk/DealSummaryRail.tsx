import React, { useMemo } from "react";
import { useDealContext } from "../../context/DealContext";
import { computeApproval } from "../../services/approval";
import { formatCurrency } from "../common/TableCell";
import { getCurrentUser } from "../../lib/pocketbase";
import type { CalculatedVehicle } from "../../types";

/* ---------------------------------------------------------------------------
 * DealSummaryRail — sticky right-rail "pencil" summary of the focused vehicle.
 * Faithful port of the .pcard / .rail section from redesign-C-hybrid.html.
 * Reads everything from DealContext; no required props.
 * ------------------------------------------------------------------------- */

/** Band a 0–100 score into the approval color family. */
const scoreColorVar = (score: number): string =>
  score >= 72
    ? "var(--color-success)"
    : score >= 50
      ? "var(--color-warning)"
      : "var(--color-danger)";

/** OTD-LTV color bands mirror the mockup (≤116 green, ≤128 amber, else red). */
const ltvColorVar = (ltv: number): string =>
  ltv <= 116 ? "var(--color-success)" : ltv <= 128 ? "var(--color-warning)" : "var(--color-danger)";

/** Format an integer percentage; em-dash for any non-number. */
const formatPercent = (value: number | "Error" | "N/A"): string =>
  typeof value === "number" ? `${Math.round(value)}%` : "—";

/** Sum a list of maybe-numeric fields, treating "Error"/"N/A"/undefined as 0. */
const sumNumeric = (...values: Array<number | "Error" | "N/A" | undefined>): number =>
  values.reduce<number>((acc, v) => acc + (typeof v === "number" ? v : 0), 0);

/* ───── Approval ring ───── */
interface ApprovalRingProps {
  /** 0–100, or null when score can't be computed. */
  score: number | null;
  size?: number;
}

const ApprovalRing: React.FC<ApprovalRingProps> = ({ score, size = 38 }) => {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - pct / 100);
  const color = score == null ? "var(--color-text-subtle)" : scoreColorVar(score);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block flex-none"
      role="img"
      aria-label={score == null ? "Approval odds unavailable" : `Approval odds ${score} of 100`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.09)"
        strokeWidth={stroke}
      />
      {score != null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
};

/* ───── Empty state ───── */
const EmptyRailCard: React.FC = () => (
  <aside className="sticky top-[74px]">
    <div className="rounded-[18px] border border-[var(--color-border-strong)] bg-gradient-to-br from-[var(--color-bg-muted)] to-[var(--color-bg)] p-5 shadow-[0_10px_34px_rgba(0,0,0,0.38)]">
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-muted)] text-[var(--color-text-subtle)]">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M5 11V8a2 2 0 0 1 2-2h2l1.5-2h3L15 6h2a2 2 0 0 1 2 2v3" />
            <circle cx="12" cy="16" r="2.2" />
          </svg>
        </div>
        <h3 className="font-display text-[15px] font-semibold tracking-tight text-[var(--color-text)]">
          No vehicle selected
        </h3>
        <p className="max-w-[24ch] text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
          Pick a vehicle from the inventory to see its deal summary.
        </p>
      </div>
    </div>
  </aside>
);

/* ───── Card subcomponents ───── */

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded-full bg-[var(--color-primary-subtle)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.5px] text-[var(--color-primary)]">
    {children}
  </span>
);

interface LedgerRowProps {
  label: string;
  value: string;
  /** Optional CSS color (via inline style) for the value cell. */
  valueColor?: string;
  emphasized?: boolean;
}

const LedgerRow: React.FC<LedgerRowProps> = ({ label, value, valueColor, emphasized }) => (
  <div
    className={
      emphasized
        ? "flex items-center justify-between border-t border-[var(--color-border-strong)] pt-3 pb-0"
        : "flex items-center justify-between border-b border-[var(--color-border)] py-[7px] last:border-b-0"
    }
  >
    <span
      className={
        emphasized
          ? "text-[12.5px] font-bold text-[var(--color-text)]"
          : "text-[12.5px] text-[var(--color-text-muted)]"
      }
    >
      {label}
    </span>
    <span
      className={
        emphasized
          ? "font-mono text-[14.5px] font-bold tabular-nums text-[var(--color-primary)]"
          : "font-mono text-[12.5px] tabular-nums text-[var(--color-text)]"
      }
      style={valueColor && !emphasized ? { color: valueColor } : undefined}
    >
      {value}
    </span>
  </div>
);

/* ───── Action buttons (visual-only, but real & accessible) ───── */
const buttonBase =
  "inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] px-3 py-2.5 text-[12.5px] font-semibold transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] motion-reduce:transition-none";

const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  className = "",
  ...rest
}) => (
  <button
    type="button"
    className={`${buttonBase} border border-[var(--color-border-strong)] bg-transparent text-[var(--color-text)] hover:bg-[var(--color-bg-muted)] ${className}`}
    {...rest}
  >
    {children}
  </button>
);

const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  className = "",
  ...rest
}) => (
  <button
    type="button"
    className={`${buttonBase} border-0 bg-[var(--color-primary)] font-bold text-[#052109] hover:brightness-[1.06] ${className}`}
    {...rest}
  >
    {children}
  </button>
);

/* ───── Main component ───── */
const DealSummaryRail: React.FC = () => {
  const { sortedInventory, expandedInventoryRows, dealData, filters, settings, lenderProfiles } =
    useDealContext();

  const canSeeGross = getCurrentUser()?.role !== "sales";

  // Focused vehicle: first expanded row's VIN, else top of sorted inventory, else null.
  const focused: CalculatedVehicle | null = useMemo(() => {
    const expandedVin = expandedInventoryRows.values().next().value as string | undefined;
    if (expandedVin) {
      const match = sortedInventory.find((v) => v.vin === expandedVin);
      if (match) return match;
    }
    return sortedInventory[0] ?? null;
  }, [sortedInventory, expandedInventoryRows]);

  const approval = useMemo(
    () =>
      focused ? computeApproval(focused, { lenderProfiles, dealData, filters, settings }) : null,
    [focused, lenderProfiles, dealData, filters, settings]
  );

  if (!focused || !approval) {
    return <EmptyRailCard />;
  }

  const { score, fitCount, total } = approval;

  const mileageText =
    typeof focused.mileage === "number" ? `${focused.mileage.toLocaleString("en-US")} mi` : "— mi";

  // interestRate is typed `number`, but a cleared input can coerce to NaN — treat
  // any non-finite rate as the empty ("—%") case the spec calls for.
  const aprText = Number.isFinite(dealData.interestRate) ? `${dealData.interestRate}% APR` : "—%";

  // Ledger figures — guard every maybe-numeric field.
  const taxAndFees = sumNumeric(
    focused.salesTax,
    dealData.stateFees,
    settings.docFee,
    settings.cvrFee
  );
  const netTrade = dealData.tradeInValue - dealData.tradeInPayoff;
  const downTradeRebate = dealData.downPayment + netTrade;

  const grossIsPositive =
    typeof focused.frontEndGross === "number" ? focused.frontEndGross >= 0 : true;

  return (
    <aside className="sticky top-[74px]">
      <div className="rounded-[18px] border border-[var(--color-border-strong)] bg-gradient-to-br from-[var(--color-bg-muted)] to-[var(--color-bg)] p-5 shadow-[0_10px_34px_rgba(0,0,0,0.38)]">
        {/* 1 · Top line */}
        <div className="flex items-center gap-2 font-mono text-[11.5px] text-[var(--color-text-subtle)]">
          <span className="truncate">
            STK {focused.stock} · {mileageText}
          </span>
          <span className="ml-auto flex-none">
            <Pill>Focused</Pill>
          </span>
        </div>

        {/* 2 · Vehicle name */}
        <h3 className="mt-[5px] mb-3.5 font-display text-[18px] font-semibold leading-tight tracking-[-0.4px] text-[var(--color-text)]">
          {focused.vehicle}
        </h3>

        {/* 3 · Approval row */}
        <div className="mb-4 flex items-center gap-3 border-b border-[var(--color-border)] pb-4">
          <ApprovalRing score={score} />
          <div>
            <div
              className="font-mono text-[16px] font-bold leading-none"
              style={{ color: score == null ? "var(--color-text-subtle)" : scoreColorVar(score) }}
            >
              {score == null ? "—" : score}
              <span className="text-[11px] font-semibold text-[var(--color-text-subtle)]">
                /100
              </span>
            </div>
            <div className="mt-[3px] text-[11px] text-[var(--color-text-subtle)]">
              approval odds
            </div>
          </div>
          <div className="ml-auto text-right">
            <b
              className="font-mono text-[14px] font-bold"
              style={{
                color:
                  fitCount >= 3
                    ? "var(--color-success)"
                    : fitCount >= 1
                      ? "var(--color-warning)"
                      : "var(--color-danger)",
              }}
            >
              {fitCount}/{total}
            </b>
            <small className="mt-0.5 block text-[9.5px] font-bold uppercase tracking-[0.5px] text-[var(--color-text-subtle)]">
              Lenders
            </small>
          </div>
        </div>

        {/* 4 · Micro-label */}
        <div className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-[var(--color-text-subtle)]">
          Estimated monthly payment
        </div>

        {/* 5 · Big payment */}
        <div className="mt-[3px] font-display text-[40px] font-bold leading-none tracking-[-1.8px] text-[var(--color-text)]">
          {typeof focused.monthlyPayment === "number"
            ? formatCurrency(focused.monthlyPayment)
            : "—"}
        </div>

        {/* 6 · Sub-line */}
        <div className="mt-1.5 text-[12px] text-[var(--color-text-muted)]">
          {dealData.loanTerm} mo · {aprText} · estimate, not an offer of credit
        </div>

        {/* 7 · Ledger */}
        <div className="mt-4">
          <LedgerRow label="Selling price" value={formatCurrency(focused.price)} />
          <LedgerRow label="Tax + fees" value={formatCurrency(taxAndFees)} />
          <LedgerRow
            label="Down + trade + rebate"
            value={`−${formatCurrency(downTradeRebate)}`}
            valueColor="var(--color-danger)"
          />
          <LedgerRow
            label="OTD LTV"
            value={formatPercent(focused.otdLtv)}
            valueColor={
              typeof focused.otdLtv === "number" ? ltvColorVar(focused.otdLtv) : undefined
            }
          />
          {canSeeGross && (
            <LedgerRow
              label="Front-end gross"
              value={formatCurrency(focused.frontEndGross)}
              valueColor={grossIsPositive ? "var(--color-success)" : "var(--color-danger)"}
            />
          )}
          <LedgerRow
            label="Amount financed"
            value={formatCurrency(focused.amountToFinance)}
            emphasized
          />
        </div>

        {/* 8 · Actions */}
        <div className="mt-[18px] flex gap-2.5">
          <GhostButton aria-label="Download deal as PDF">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5h20v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
            </svg>
            PDF
          </GhostButton>
          <PrimaryButton aria-label="Save deal">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#052109"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16l7-3 7 3z" />
            </svg>
            Save deal
          </PrimaryButton>
        </div>

        {/* 9 · Disclaimer */}
        <p className="mt-3.5 text-[10.5px] leading-relaxed text-[var(--color-text-subtle)]">
          Estimate for desking only. Final rate and approval are set by the lender.
        </p>
      </div>
    </aside>
  );
};

export default DealSummaryRail;
