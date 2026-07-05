import React, { useMemo, useEffect, useRef, useState } from "react";
import { calculateFinancials } from "../../services/calculator";
import { APPROVAL_CONFIG, BAND_META } from "../../services/approvalScorer";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { fmtN, splitPay } from "../../utils/format";
import { DESK_DOWNS, DESK_TERMS, aprLabel, numVal } from "./deskConstants";
import InspectorSummary from "./InspectorSummary";
import LenderLadder from "./LenderLadder";
import FinancialBreakdown from "./FinancialBreakdown";
import BackendAddons from "./BackendAddons";
import StructureMatrix from "./StructureMatrix";
import type {
  ApprovalBand,
  CalculatedVehicle,
  DealData,
  LenderProfile,
  Settings,
} from "../../types";
import type { LenderFitEntry } from "../../services/lenderFit";

interface DealInspectorProps {
  vehicle: CalculatedVehicle;
  entries: LenderFitEntry[];
  profilesById: Map<string, LenderProfile>;
  totalLenders: number;
  dealData: DealData;
  settings: Settings;
  pinned: boolean;
  onPin: () => void;
  onSetTermDown: (term: number, down: number) => void;
  compactMode: boolean;
  compactOpen: boolean;
  onCloseCompact: () => void;
  vscAmount: number;
  gapAmount: number;
  otherBackend: number;
  onToggleVsc: () => void;
  onToggleGap: () => void;
  onVscAmountChange: (n: number) => void;
  onGapAmountChange: (n: number) => void;
  onOtherBackendChange: (n: number) => void;
  onDealSheet: () => void;
  onSaveDeal: () => void;
}

type InspectorTab = "summary" | "lenders" | "addons" | "matrix";

export const DealInspector: React.FC<DealInspectorProps> = ({
  vehicle: v,
  entries,
  profilesById,
  totalLenders,
  dealData,
  settings,
  pinned,
  onPin,
  onSetTermDown,
  compactMode,
  compactOpen,
  onCloseCompact,
  vscAmount,
  gapAmount,
  otherBackend,
  onToggleVsc,
  onToggleGap,
  onVscAmountChange,
  onGapAmountChange,
  onOtherBackendChange,
  onDealSheet,
  onSaveDeal,
}) => {
  const [tab, setTab] = useState<InspectorTab>("summary");
  const panelRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const thresholds = settings.ltvThresholds;
  const band = v.approvalBand ?? "none";
  const fitCount = v.fitCount ?? 0;
  const fitNames = v.fitNames ?? [];

  // Tweens — arc + numeral + color + payment move together off the SAME
  // animated values (600ms easeOutCubic; reduced-motion snaps).
  const scoreTarget = v.approvalScore ?? 0;
  const payN = numVal(v.monthlyPayment);
  const dispScore = useAnimatedNumber(scoreTarget);
  const dispPay = useAnimatedNumber(payN ?? 0);

  // Color AND zone label follow the tweened score through the mockup's bands
  // so arc/number/color/label all move together; "none" (no lender fit) stays
  // authoritative regardless of the animated number.
  const dispBand: ApprovalBand =
    band === "none"
      ? "none"
      : dispScore >= APPROVAL_CONFIG.bands.strong
        ? "strong"
        : dispScore >= APPROVAL_CONFIG.bands.moderate
          ? "moderate"
          : "weak";
  const gaugeColor = BAND_META[dispBand].colorVar;

  const pay = payN === null ? null : splitPay(dispPay);

  const price = numVal(v.price);
  const baseOtd = numVal(v.baseOutTheDoorPrice);
  const taxFees = price !== null && baseOtd !== null ? baseOtd - price : numVal(v.salesTax);
  const down =
    (dealData.downPayment || 0) +
    ((dealData.tradeInValue || 0) - (dealData.tradeInPayoff || 0)) +
    (dealData.rebate || 0);
  const financed = numVal(v.amountToFinance);
  const pti = v.ptiRatio;

  // 16-cell desking grid (term × down), each a full real-engine reprice.
  const grid = useMemo(
    () =>
      DESK_TERMS.map((term) => ({
        term,
        cells: DESK_DOWNS.map((dn) => {
          const calc = calculateFinancials(
            v,
            { ...dealData, loanTerm: term, downPayment: dn },
            settings
          );
          return { down: dn, pay: numVal(calc.monthlyPayment) };
        }),
      })),
    [v, dealData, settings]
  );

  useEffect(() => {
    if (!compactMode) return;
    if (compactOpen) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      panelRef.current?.focus();
      return;
    }
    previousFocusRef.current?.focus();
  }, [compactMode, compactOpen]);

  const handleInspectorKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!compactMode) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseCompact();
      return;
    }
    if (event.key !== "Tab" || !compactOpen || !panelRef.current) return;

    const focusables = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute("inert") && el.offsetParent !== null);
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const compactA11yProps: React.HTMLAttributes<HTMLElement> = compactMode
    ? {
        role: "dialog",
        "aria-modal": compactOpen,
        "aria-label": "Deal inspector",
        "aria-hidden": !compactOpen,
        inert: !compactOpen,
      }
    : {};

  return (
    <aside
      ref={panelRef}
      className="desk-inspector"
      data-open={compactOpen}
      tabIndex={compactMode && compactOpen ? -1 : undefined}
      onKeyDown={handleInspectorKeyDown}
      {...compactA11yProps}
    >
      <div className="desk-inspector-head">
        <div className="desk-inspector-kicker">
          <span>03</span>
          <span>STK {v.stock}</span>
          <span>{typeof v.mileage === "number" ? fmtN(v.mileage) : "—"} mi</span>
        </div>
        <div className="desk-inspector-title-row">
          <h2>{v.vehicle}</h2>
          <div className="desk-inspector-head-actions">
            <button type="button" className="desk-ghost-btn lift-btn" onClick={onPin}>
              {pinned ? "Comparing" : "Compare"}
            </button>
            <button
              type="button"
              className="desk-inspector-close lift-btn"
              onClick={onCloseCompact}
              aria-label="Close deal inspector"
            >
              ×
            </button>
          </div>
        </div>
      </div>

      <InspectorSummary
        score={dispScore}
        bandLabel={BAND_META[dispBand].label}
        gaugeColor={gaugeColor}
        pay={pay}
        loanTerm={dealData.loanTerm}
        apr={aprLabel(dealData.interestRate)}
        fitCount={fitCount}
        totalLenders={totalLenders}
        financed={financed}
        backendProducts={dealData.backendProducts || 0}
        otdLtv={v.otdLtv}
        pti={pti}
        thresholds={thresholds}
      />

      <div className="desk-inspector-tabs" role="tablist" aria-label="Deal inspector sections">
        {[
          ["summary", "Summary"],
          ["lenders", "Lenders"],
          ["addons", "Add-ons"],
          ["matrix", "Matrix"],
        ].map(([key, label]) => (
          <button
            type="button"
            key={key}
            role="tab"
            aria-selected={tab === key}
            data-active={tab === key}
            className="lift-btn"
            onClick={() => setTab(key as InspectorTab)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="desk-inspector-body">
        {tab === "summary" && (
          <FinancialBreakdown
            price={price}
            taxFees={taxFees}
            down={down}
            otdLtv={v.otdLtv}
            pti={pti}
            financed={financed}
            thresholds={thresholds}
          />
        )}
        {tab === "lenders" && (
          <LenderLadder
            entries={entries}
            fitNames={fitNames}
            profilesById={profilesById}
            fitCount={fitCount}
            totalLenders={totalLenders}
            limit={3}
          />
        )}
        {tab === "addons" && (
          <BackendAddons
            vscAmount={vscAmount}
            gapAmount={gapAmount}
            otherBackend={otherBackend}
            defaultVsc={settings.vscPrice}
            defaultGap={settings.gapPrice}
            onToggleVsc={onToggleVsc}
            onToggleGap={onToggleGap}
            onVscAmountChange={onVscAmountChange}
            onGapAmountChange={onGapAmountChange}
            onOtherBackendChange={onOtherBackendChange}
          />
        )}
        {tab === "matrix" && (
          <StructureMatrix
            grid={grid}
            loanTerm={dealData.loanTerm}
            downPayment={dealData.downPayment || 0}
            onSetTermDown={onSetTermDown}
          />
        )}
      </div>

      <div className="desk-inspector-actions">
        <button type="button" onClick={onDealSheet} className="desk-secondary-action lift-btn">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
          Deal sheet
        </button>
        <button type="button" onClick={onSaveDeal} className="desk-primary-action lift-btn">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <path d="M17 21v-8H7v8M7 3v5h8" />
          </svg>
          Save deal
        </button>
      </div>
    </aside>
  );
};
