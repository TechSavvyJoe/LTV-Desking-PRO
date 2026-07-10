import React from "react";
import { fmt } from "../../utils/format";
import { parseMoneyInput } from "../../services/backendProducts";

interface BackendAddonsProps {
  vscAmount: number;
  gapAmount: number;
  otherBackend: number;
  defaultVsc: number;
  defaultGap: number;
  onToggleVsc: () => void;
  onToggleGap: () => void;
  onVscAmountChange: (n: number) => void;
  onGapAmountChange: (n: number) => void;
  onOtherBackendChange: (n: number) => void;
}

const amountValue = (value: number): string => (value > 0 ? String(value) : "");

const BackendAddons: React.FC<BackendAddonsProps> = ({
  vscAmount,
  gapAmount,
  otherBackend,
  defaultVsc,
  defaultGap,
  onToggleVsc,
  onToggleGap,
  onVscAmountChange,
  onGapAmountChange,
  onOtherBackendChange,
}) => {
  const total = vscAmount + gapAmount + otherBackend;
  const onMoney = (fn: (n: number) => void) => (event: React.ChangeEvent<HTMLInputElement>) =>
    fn(parseMoneyInput(event.target.value));

  return (
    <section className="desk-panel-section">
      <div className="desk-panel-heading">
        <span>Back-end add-ons</span>
        <strong>{fmt(total)}</strong>
      </div>
      <div className="desk-backend-list">
        <div className="desk-backend-row">
          <button
            type="button"
            className="desk-backend-toggle transition-colors"
            data-active={vscAmount > 0}
            onClick={onToggleVsc}
          >
            <span>{vscAmount > 0 ? "−" : "+"}</span>
            Service contract
          </button>
          <input
            className="dc-input desk-backend-input"
            inputMode="numeric"
            value={amountValue(vscAmount)}
            onChange={onMoney(onVscAmountChange)}
            placeholder={String(defaultVsc)}
            aria-label="Service contract amount"
          />
        </div>
        <div className="desk-backend-row">
          <button
            type="button"
            className="desk-backend-toggle transition-colors"
            data-active={gapAmount > 0}
            onClick={onToggleGap}
          >
            <span>{gapAmount > 0 ? "−" : "+"}</span>
            GAP coverage
          </button>
          <input
            className="dc-input desk-backend-input"
            inputMode="numeric"
            value={amountValue(gapAmount)}
            onChange={onMoney(onGapAmountChange)}
            placeholder={String(defaultGap)}
            aria-label="GAP coverage amount"
          />
        </div>
        <div className="desk-backend-row">
          <div className="desk-backend-label">Other backend</div>
          <input
            className="dc-input desk-backend-input"
            inputMode="numeric"
            value={amountValue(otherBackend)}
            onChange={onMoney(onOtherBackendChange)}
            placeholder="0"
            aria-label="Other backend amount"
          />
        </div>
      </div>
      <div className="desk-backend-total">
        <span>Calculator total</span>
        <strong>{fmt(total)}</strong>
      </div>
    </section>
  );
};

export default React.memo(BackendAddons);
