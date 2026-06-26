import React from "react";
import type { CalculatedVehicle, DealData, FilterData, LenderProfile, Settings } from "../types";
import Button from "./common/Button";
import * as Icons from "./common/Icons";
import { checkBankEligibility } from "../services/lenderMatcher";
import { calculateFinancials } from "../services/calculator";
import { computeApproval } from "../services/approval";
import { formatCurrency, formatCurrencyExact } from "./common/TableCell";
import { useDealContext } from "../context/DealContext";
import { getCurrentUser } from "../lib/pocketbase";

/**
 * InventoryExpandedRow — the inventory drawer (Direction C "Hybrid" template).
 *
 * Three responsive columns:
 *   1. Deal breakdown — a ledger reconciling selling price → amount financed.
 *   2. Term scenarios — payment / OTD LTV / approval across 60·72·84·96 months.
 *   3. Lender fits    — a preliminary FIT/CHK/NO screen of the dealer's programs.
 *
 * A full-width action row preserves the original PDF / Share affordances.
 *
 * The exported props interface is unchanged — App.tsx and FavoritesTable depend
 * on it. Only the presentation was reorganized.
 */
interface InventoryExpandedRowProps {
  item: CalculatedVehicle;
  lenderProfiles: LenderProfile[];
  dealData: DealData;
  setDealData: React.Dispatch<React.SetStateAction<DealData>>;
  onInventoryUpdate: (vin: string, updatedData: Partial<CalculatedVehicle>) => void;
  customerFilters: FilterData;
  settings: Settings;
  onDownloadPdf: (e: React.MouseEvent, vehicle: CalculatedVehicle) => void;
  onSharePdf: (e: React.MouseEvent, vehicle: CalculatedVehicle) => void;
  isShareSupported: boolean;
}

/* ─────────────────────────── small primitives ─────────────────────────── */

/** Numeric value, mono + tabular, right-aligned. */
const Num: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => <span className={`font-mono tabular-nums ${className}`}>{children}</span>;

/** Uppercase tracked micro-heading with a small leading icon. */
const ColHeading: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <h4 className="mb-3.5 flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--color-text-subtle)]">
    <span className="text-[var(--color-primary)] opacity-80">{icon}</span>
    {children}
  </h4>
);

/** A single ledger line: muted label left, mono value right. */
const LedgerRow: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  valueClassName?: string;
}> = ({ label, value, valueClassName = "" }) => (
  <div className="flex items-center justify-between py-1.5 text-[12.5px]">
    <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">{label}</span>
    <Num className={valueClassName}>{value}</Num>
  </div>
);

/**
 * Inline-editable currency field rendered as a ledger line. Preserves the
 * commit-on-blur, reject-invalid behavior of the original EditableField while
 * matching the drawer's restrained, mono aesthetic.
 */
const LedgerEdit: React.FC<{
  label: React.ReactNode;
  value: number | "N/A";
  onUpdate: (newValue: number) => void;
  step?: string;
  suffix?: string;
}> = ({ label, value, onUpdate, step = "1", suffix }) => {
  const [draft, setDraft] = React.useState(value === "N/A" ? "" : String(value));

  React.useEffect(() => {
    setDraft(value === "N/A" ? "" : String(value));
  }, [value]);

  const commit = () => {
    const next = parseFloat(draft);
    if (!isNaN(next) && next >= 0) onUpdate(next);
    else setDraft(value === "N/A" ? "" : String(value));
  };

  const inputId = React.useId();

  return (
    <div className="flex items-center justify-between py-1.5 text-[12.5px]">
      <label htmlFor={inputId} className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
        <Icons.PencilIcon className="h-3 w-3 text-[var(--color-text-subtle)]" />
        {label}
      </label>
      <span className="inline-flex items-center gap-1">
        {suffix === "$" && <span className="font-mono text-[var(--color-text-subtle)]">$</span>}
        <input
          id={inputId}
          type="number"
          step={step}
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-[88px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-2 py-1 text-right font-mono tabular-nums text-[12.5px] text-[var(--color-text)] transition-colors focus:border-[var(--color-primary)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)]"
          aria-label={`Edit ${typeof label === "string" ? label : "value"}`}
        />
        {suffix && suffix !== "$" && (
          <span className="font-mono text-[var(--color-text-subtle)]">{suffix}</span>
        )}
      </span>
    </div>
  );
};

/* ───────────────────────────── band helpers ───────────────────────────── */

/** OTD LTV color band: <=116 green, <=128 amber, else red. */
const ltvBand = (n: number): string =>
  n <= 116
    ? "text-[var(--color-success)]"
    : n <= 128
      ? "text-[var(--color-warning)]"
      : "text-[var(--color-danger)]";

/** Approval band: >=72 green, >=50 amber, else red. */
const approvalBand = (n: number): { text: string; chip: string } =>
  n >= 72
    ? {
        text: "text-[var(--color-success)]",
        chip: "bg-[var(--color-success-subtle)] text-[var(--color-success)]",
      }
    : n >= 50
      ? {
          text: "text-[var(--color-warning)]",
          chip: "bg-[var(--color-warning-subtle)] text-[var(--color-warning)]",
        }
      : {
          text: "text-[var(--color-danger)]",
          chip: "bg-[var(--color-danger-subtle)] text-[var(--color-danger)]",
        };

const fmt0 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/* ─────────────────────────────── component ────────────────────────────── */

export const InventoryExpandedRow: React.FC<InventoryExpandedRowProps> = ({
  item,
  lenderProfiles,
  dealData,
  setDealData,
  onInventoryUpdate,
  customerFilters,
  settings,
  onDownloadPdf,
  onSharePdf,
  isShareSupported,
}) => {
  const safeProfiles = (Array.isArray(lenderProfiles) ? lenderProfiles : []).filter(
    (p): p is LenderProfile => !!p && typeof p === "object"
  );

  const { isShowroomMode } = useDealContext();
  const role = getCurrentUser()?.role;
  const canSeeGross = role !== "sales";

  /* ── derived deal figures (defensive about "N/A" / "Error" sentinels) ── */
  const sellingPrice = typeof item.price === "number" ? item.price : 0;
  const tradeInValue = dealData.tradeInValue ?? 0;
  const tradeInPayoff = dealData.tradeInPayoff ?? 0;
  const netTrade = tradeInValue - tradeInPayoff;
  const negEquity = netTrade < 0;
  const downPayment = dealData.downPayment ?? 0;
  const backend = dealData.backendProducts ?? 0;
  const docTitleReg = (settings.docFee ?? 0) + (settings.cvrFee ?? 0) + (dealData.stateFees ?? 0);

  const salesTax = typeof item.salesTax === "number" ? item.salesTax : null;
  const amountFinanced = typeof item.amountToFinance === "number" ? item.amountToFinance : null;
  const frontEndGross = typeof item.frontEndGross === "number" ? item.frontEndGross : null;

  /* ── COLUMN 2: term scenarios ── */
  const TERMS = [60, 72, 84, 96] as const;
  const scenarios = TERMS.map((t) => {
    const calc = calculateFinancials(item, { ...dealData, loanTerm: t }, settings);
    const approval = computeApproval(calc, {
      lenderProfiles: safeProfiles,
      dealData: { ...dealData, loanTerm: t },
      filters: customerFilters,
      settings,
    });
    return {
      term: t,
      payment: calc.monthlyPayment,
      otdLtv: calc.otdLtv,
      score: approval.score,
    };
  });

  /* ── COLUMN 3: lender fits ── */
  const fits = safeProfiles.map((bank) => {
    try {
      const res = checkBankEligibility(item, { ...dealData, ...customerFilters }, bank);
      // "CHK" = eligible but sitting close to a tier LTV/term ceiling — a soft
      // caution that the deal could fall out with a small structure change.
      let near = false;
      if (res.eligible && res.matchedTier) {
        const tier = res.matchedTier;
        const otd = typeof item.otdLtv === "number" ? item.otdLtv : null;
        if (
          otd !== null &&
          typeof tier.maxLtv === "number" &&
          tier.maxLtv - otd <= 4 &&
          otd <= tier.maxLtv
        ) {
          near = true;
        }
        if (
          typeof tier.maxTerm === "number" &&
          tier.maxTerm - dealData.loanTerm <= 6 &&
          dealData.loanTerm <= tier.maxTerm
        ) {
          near = true;
        }
      }
      // First evaluable reason for a miss; otherwise the matched-tier headroom.
      let reason: string;
      if (res.eligible) {
        const tier = res.matchedTier;
        const cap = typeof tier?.maxLtv === "number" ? `${tier.maxLtv}% LTV` : "fits program";
        reason = near ? "near cap" : cap;
      } else {
        reason = res.reasons[0] ?? "ineligible";
      }
      return {
        name: bank.name || "Unknown",
        status: res.eligible ? (near ? "CHK" : "FIT") : "NO",
        reason,
      } as const;
    } catch {
      return { name: bank.name || "Unknown", status: "NO", reason: "check failed" } as const;
    }
  });
  const fitCount = fits.filter((f) => f.status === "FIT" || f.status === "CHK").length;

  const pill = (status: "FIT" | "CHK" | "NO") => {
    const map = {
      FIT: "bg-[var(--color-success-subtle)] text-[var(--color-success)]",
      CHK: "bg-[var(--color-warning-subtle)] text-[var(--color-warning)]",
      NO: "bg-[var(--color-danger-subtle)] text-[var(--color-danger)]",
    } as const;
    return (
      <span
        className={`w-[38px] flex-none rounded-md py-1 text-center text-[9.5px] font-bold tracking-[0.04em] ${map[status]}`}
      >
        {status}
      </span>
    );
  };

  const vehicleLabel =
    `${item.modelYear !== "N/A" ? `${item.modelYear} ` : ""}${item.vehicle}`.trim() || item.vehicle;

  return (
    <div
      className="cursor-default border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1.05fr_1fr_1.15fr]">
        {/* ───────────────── COLUMN 1 · Deal breakdown ───────────────── */}
        <section className="border-b border-[var(--color-border)] px-5 py-4 min-[900px]:border-b-0 min-[900px]:border-r">
          <ColHeading
            icon={
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="16" rx="2.5" />
                <path d="M3 10h18M7 15h4" />
              </svg>
            }
          >
            Deal breakdown
          </ColHeading>

          <div>
            <LedgerEdit
              label="Selling price"
              value={item.price}
              suffix="$"
              onUpdate={(price) => onInventoryUpdate(item.vin, { price })}
            />
            <LedgerRow
              label="Sales tax"
              value={salesTax === null ? "—" : formatCurrency(salesTax)}
            />
            <LedgerRow label="Doc + title/reg fees" value={formatCurrency(docTitleReg)} />
            <LedgerRow
              label="Cash down"
              value={`−${formatCurrency(downPayment)}`}
              valueClassName="text-[var(--color-danger)]"
            />
            <LedgerRow
              label={`Net trade${negEquity ? " (neg equity)" : ""}`}
              value={negEquity ? `+${formatCurrency(-netTrade)}` : `−${formatCurrency(netTrade)}`}
              valueClassName={negEquity ? "text-[var(--color-danger)]" : ""}
            />
            {backend > 0 && (
              <LedgerRow label="Backend / F&I products" value={formatCurrency(backend)} />
            )}

            {/* divider + emphasized financed amount */}
            <div className="mt-1.5 flex items-center justify-between border-t border-[var(--color-border)] pt-2.5 text-[12.5px]">
              <span className="font-bold text-[var(--color-text)]">Amount financed</span>
              <Num className="text-[14.5px] font-bold text-[var(--color-primary)]">
                {amountFinanced === null ? "—" : formatCurrency(amountFinanced)}
              </Num>
            </div>

            {canSeeGross && !isShowroomMode && (
              <LedgerRow
                label="Front-end gross"
                value={frontEndGross === null ? "—" : formatCurrency(frontEndGross)}
                valueClassName={
                  frontEndGross !== null && frontEndGross < 0
                    ? "text-[var(--color-danger)]"
                    : "text-[var(--color-success)]"
                }
              />
            )}
          </div>
        </section>

        {/* ───────────────── COLUMN 2 · Term scenarios ───────────────── */}
        <section className="border-b border-[var(--color-border)] px-5 py-4 min-[900px]:border-b-0 min-[900px]:border-r">
          <ColHeading
            icon={
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 3v18h18" />
                <rect x="7" y="10" width="3" height="7" />
                <rect x="13" y="6" width="3" height="11" />
              </svg>
            }
          >
            Term scenarios
          </ColHeading>

          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[9.5px] font-bold uppercase tracking-[0.04em] text-[var(--color-text-subtle)]">
                <th className="px-1.5 pb-2 text-left font-bold">Term</th>
                <th className="px-1.5 pb-2 text-right font-bold">Payment</th>
                <th className="px-1.5 pb-2 text-right font-bold">OTD LTV</th>
                <th className="px-1.5 pb-2 text-right font-bold">Appr</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => {
                const current = s.term === dealData.loanTerm;
                const ltvText = typeof s.otdLtv === "number" ? `${fmt0(s.otdLtv)}%` : "—";
                const ltvClass =
                  typeof s.otdLtv === "number"
                    ? ltvBand(s.otdLtv)
                    : "text-[var(--color-text-subtle)]";
                return (
                  <tr
                    key={s.term}
                    className={current ? "bg-[var(--color-primary-subtle)]" : undefined}
                  >
                    <td
                      className={`whitespace-nowrap px-1.5 py-2 text-left font-semibold ${
                        current
                          ? "rounded-l-md text-[var(--color-primary)]"
                          : "text-[var(--color-text-muted)]"
                      } border-t border-[var(--color-border)]`}
                    >
                      {s.term} mo
                    </td>
                    <td className="border-t border-[var(--color-border)] px-1.5 py-2 text-right font-mono tabular-nums text-[12.5px]">
                      {typeof s.payment === "number" ? formatCurrencyExact(s.payment) : "—"}
                    </td>
                    <td
                      className={`border-t border-[var(--color-border)] px-1.5 py-2 text-right font-mono tabular-nums text-[12.5px] ${ltvClass}`}
                    >
                      {ltvText}
                    </td>
                    <td
                      className={`border-t border-[var(--color-border)] px-1.5 py-2 text-right ${
                        current ? "rounded-r-md" : ""
                      }`}
                    >
                      {s.score === null ? (
                        <span className="font-mono text-[var(--color-text-subtle)]">—</span>
                      ) : (
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
                            approvalBand(s.score).chip
                          }`}
                        >
                          {s.score}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-text-subtle)]">
            Tap a term in Deal terms to apply it to the deal.
          </p>
        </section>

        {/* ───────────────── COLUMN 3 · Lender fits ───────────────── */}
        <section className="px-5 py-4">
          <ColHeading
            icon={
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
              </svg>
            }
          >
            Lender fits · {fitCount} of {safeProfiles.length}
          </ColHeading>

          {safeProfiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-[var(--color-text-subtle)]">
              <Icons.BanknotesIcon className="mb-2 h-7 w-7 opacity-50" />
              <p className="text-[12px]">No lender programs configured yet.</p>
            </div>
          ) : (
            <div className="max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
              {fits.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className={`flex items-center gap-2.5 py-2 ${
                    i === 0 ? "" : "border-t border-[var(--color-border)]"
                  }`}
                >
                  {pill(f.status)}
                  <span className="flex-1 truncate text-[12.5px] font-semibold text-[var(--color-text)]">
                    {f.name}
                  </span>
                  <span className="font-mono text-[11.5px] text-[var(--color-text-subtle)]">
                    {f.reason}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-text-subtle)]">
            Preliminary screen against dealer-entered programs — not a credit decision. Final rate
            &amp; terms are set by the lender.
          </p>
        </section>
      </div>

      {/* ───────────────── ACTION ROW (full width) ───────────────── */}
      <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--color-border)] px-5 py-3">
        <span className="font-mono text-[11.5px] text-[var(--color-text-muted)]">
          {vehicleLabel}
          {item.stock ? ` · STK ${item.stock}` : ""}
        </span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => onDownloadPdf(e, item)}
          aria-label="Download customer quote PDF"
        >
          <Icons.PdfIcon className="h-4 w-4" /> Customer quote (PDF)
        </Button>
        {isShareSupported && (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => onSharePdf(e, item)}
            aria-label="Share deal PDF"
          >
            <Icons.ShareIcon className="h-4 w-4" /> Share
          </Button>
        )}
      </div>
    </div>
  );
};
