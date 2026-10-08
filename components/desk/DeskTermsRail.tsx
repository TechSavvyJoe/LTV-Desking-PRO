import React from "react";
import { parseMoneyInput } from "../../services/backendProducts";
import { getRebateBreakdown } from "../../services/calculator";
import { DESK_TERMS, metaItem, sansNum } from "./deskConstants";
import type { AppState, DealData, FilterData } from "../../types";

interface DeskTermsRailProps {
  customerName: string;
  setCustomerName: (value: string) => void;
  filters: FilterData;
  setFilter: (patch: Partial<FilterData>) => void;
  dealData: DealData;
  setDeal: (patch: Partial<DealData>) => void;
  buyerState: AppState;
  aprText: string;
  onAprChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  buyRate: { rate: number; lender: string } | null;
  applyBuyRate: () => void;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  onReset: () => void;
  onClearFilters: () => void;
  onScanIncome: () => void;
}

const ADVANCED_ID = "desk-terms-advanced";

const DeskTermsRailComponent: React.FC<DeskTermsRailProps> = ({
  customerName,
  setCustomerName,
  filters,
  setFilter,
  dealData,
  setDeal,
  buyerState,
  aprText,
  onAprChange,
  buyRate,
  applyBuyRate,
  advancedOpen,
  onToggleAdvanced,
  onReset,
  onClearFilters,
  onScanIncome,
}) => {
  const setNumber = (fn: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = parseMoneyInput(e.target.value);
    fn(n);
  };
  const rebateBreakdown = getRebateBreakdown(dealData);
  const rebateType =
    dealData.rebateType ??
    (rebateBreakdown.dealerDiscount > 0 && rebateBreakdown.manufacturerRebate === 0
      ? "dealer"
      : "manufacturer");
  const rebateAmount =
    rebateType === "dealer" ? rebateBreakdown.dealerDiscount : rebateBreakdown.manufacturerRebate;
  const setRebate = (type: "manufacturer" | "dealer", amount: number) =>
    setDeal({
      rebateType: type,
      rebate: amount,
      manufacturerRebate: type === "manufacturer" ? amount : 0,
      dealerDiscount: type === "dealer" ? amount : 0,
      dealerRebate: undefined,
    });

  return (
    <section className="desk-terms-card">
      <div className="desk-terms-head">
        <div className="desk-section-title">
          <span aria-hidden="true">01</span>
          {/* A real heading for the outline; the <strong> keeps its look. */}
          <h2 style={{ margin: 0, fontSize: "inherit", fontWeight: "inherit" }}>
            <strong>Deal terms</strong>
          </h2>
          <span className="desk-live-pill">
            <span className="live-dot" />
            Live
          </span>
        </div>
        <div className="desk-terms-actions">
          <span>Every edit reprices inventory and lender fit.</span>
          <button
            type="button"
            className="desk-ghost-btn transition-colors"
            onClick={onToggleAdvanced}
            aria-expanded={advancedOpen}
            aria-controls={advancedOpen ? ADVANCED_ID : undefined}
          >
            More filters
          </button>
          {/* Clears the customer, credit, terms and filters — say so. */}
          <button type="button" className="desk-ghost-btn transition-colors" onClick={onReset}>
            Reset deal
          </button>
        </div>
      </div>

      <div className="desk-terms-primary">
        <div className="desk-field">
          <label htmlFor="desk-customer">Customer</label>
          <input
            id="desk-customer"
            className="dc-input"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Add customer"
          />
        </div>
        <div className="desk-field compact">
          <label htmlFor="desk-fico">FICO</label>
          <input
            id="desk-fico"
            className="dc-input tabular-nums"
            inputMode="numeric"
            value={filters.creditScore ?? ""}
            onChange={setNumber((n) => setFilter({ creditScore: n || null }))}
          />
        </div>
        <div className="desk-field">
          <label htmlFor="desk-income">Income / mo</label>
          <div className="desk-input-action">
            <input
              id="desk-income"
              className="dc-input tabular-nums"
              inputMode="numeric"
              value={filters.monthlyIncome ?? ""}
              onChange={setNumber((n) => setFilter({ monthlyIncome: n || null }))}
              placeholder="Gross"
            />
            <button
              type="button"
              onClick={onScanIncome}
              aria-label="Scan pay stub"
              title="Scan pay stub"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
                <path d="M3 12h18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="desk-field compact">
          <label htmlFor="desk-max-payment">Payment budget ($/mo)</label>
          <input
            id="desk-max-payment"
            className="dc-input tabular-nums"
            inputMode="numeric"
            value={filters.maxPayment ?? ""}
            onChange={setNumber((n) => setFilter({ maxPayment: n || null }))}
            placeholder="Set ceiling"
          />
        </div>
        <div className="desk-field compact">
          <label htmlFor="desk-down">Down ($)</label>
          <input
            id="desk-down"
            className="dc-input tabular-nums"
            inputMode="numeric"
            value={dealData.downPayment || ""}
            onChange={setNumber((n) => setDeal({ downPayment: n }))}
          />
        </div>
        <div className="desk-field term">
          <label id="desk-term-label">Term</label>
          <div className="desk-term-buttons" role="group" aria-labelledby="desk-term-label">
            {DESK_TERMS.map((term) => (
              <button
                type="button"
                key={term}
                className="transition-colors"
                data-active={dealData.loanTerm === term}
                aria-pressed={dealData.loanTerm === term}
                aria-label={`${term} months`}
                onClick={() => setDeal({ loanTerm: term })}
              >
                {term}
              </button>
            ))}
          </div>
        </div>
        <div className="desk-field compact">
          <label htmlFor="desk-apr">APR (%)</label>
          <input
            id="desk-apr"
            className="dc-input tabular-nums"
            inputMode="decimal"
            value={aprText}
            onChange={onAprChange}
          />
          {buyRate && (
            <button type="button" className="desk-inline-link" onClick={applyBuyRate}>
              <span style={{ ...metaItem, ...sansNum }}>Use {buyRate.rate}%</span>{" "}
              <span>{buyRate.lender}</span>
            </button>
          )}
        </div>
      </div>

      {advancedOpen && (
        <div id={ADVANCED_ID} className="desk-terms-advanced">
          <div className="desk-field">
            <label htmlFor="desk-buyer-state">Buyer state</label>
            <select
              id="desk-buyer-state"
              className="dc-input"
              value={buyerState}
              onChange={(e) => setDeal({ buyerState: e.target.value as AppState })}
              aria-describedby="desk-buyer-state-hint"
            >
              <option value="MI">MI, 6%</option>
              <option value="OH">OH, 5.75%</option>
              <option value="IN">IN, 6% reciprocal</option>
              <option value="IL">IL, 6% reciprocal</option>
              <option value="FL">FL, 6%</option>
            </select>
          </div>
          <div className="desk-field">
            <label htmlFor="desk-trade-value">Trade value</label>
            <input
              id="desk-trade-value"
              className="dc-input tabular-nums"
              inputMode="numeric"
              value={dealData.tradeInValue || ""}
              onChange={setNumber((n) => setDeal({ tradeInValue: n }))}
            />
          </div>
          <div className="desk-field">
            <label htmlFor="desk-trade-payoff">Trade payoff</label>
            <input
              id="desk-trade-payoff"
              className="dc-input tabular-nums"
              inputMode="numeric"
              value={dealData.tradeInPayoff || ""}
              onChange={setNumber((n) => setDeal({ tradeInPayoff: n }))}
            />
          </div>
          <div className="desk-field">
            <label htmlFor="desk-rebate-type">Rebate type</label>
            <select
              id="desk-rebate-type"
              className="dc-input"
              value={rebateType}
              onChange={(event) => {
                const nextType = event.target.value === "dealer" ? "dealer" : "manufacturer";
                const total = rebateBreakdown.manufacturerRebate + rebateBreakdown.dealerDiscount;
                setRebate(nextType, total);
              }}
            >
              <option value="manufacturer">Manufacturer rebate</option>
              <option value="dealer">Dealer discount / rebate</option>
            </select>
          </div>
          <div className="desk-field">
            <label htmlFor="desk-rebate-amount">Rebate amount</label>
            <input
              id="desk-rebate-amount"
              className="dc-input tabular-nums"
              inputMode="numeric"
              value={rebateAmount || ""}
              onChange={setNumber((amount) => setRebate(rebateType, amount))}
            />
          </div>
          <div className="desk-field">
            <label htmlFor="desk-transaction-fees">Transaction fees</label>
            <input
              id="desk-transaction-fees"
              className="dc-input tabular-nums"
              inputMode="numeric"
              value={dealData.transactionFees ?? dealData.transactionFee ?? ""}
              onChange={setNumber((transactionFees) => setDeal({ transactionFees }))}
            />
          </div>
          <div className="desk-field">
            <label htmlFor="desk-vehicle-condition">Vehicle condition</label>
            <select
              id="desk-vehicle-condition"
              className="dc-input"
              value={dealData.vehicleCondition ?? ""}
              onChange={(event) =>
                setDeal({
                  vehicleCondition:
                    event.target.value === "new" || event.target.value === "used"
                      ? event.target.value
                      : undefined,
                })
              }
            >
              <option value="">Select</option>
              <option value="new">New</option>
              <option value="used">Used</option>
            </select>
          </div>
          <div className="desk-field">
            <label htmlFor="desk-monthly-debt">Monthly debt</label>
            <input
              id="desk-monthly-debt"
              className="dc-input tabular-nums"
              inputMode="numeric"
              value={filters.monthlyDebt ?? ""}
              onChange={(event) =>
                setFilter({
                  monthlyDebt:
                    event.target.value.trim() === "" ? null : parseMoneyInput(event.target.value),
                })
              }
              placeholder="Obligations"
            />
          </div>
          <div className="desk-field">
            <label htmlFor="desk-filter-vehicle">Vehicle filter</label>
            <input
              id="desk-filter-vehicle"
              className="dc-input"
              value={filters.vehicle}
              onChange={(e) => setFilter({ vehicle: e.target.value })}
              placeholder="Make / model"
            />
          </div>
          <div className="desk-field compact">
            <label htmlFor="desk-max-price">Max price</label>
            <input
              id="desk-max-price"
              className="dc-input tabular-nums"
              inputMode="numeric"
              value={filters.maxPrice ?? ""}
              onChange={setNumber((n) => setFilter({ maxPrice: n || null }))}
              placeholder="Any"
            />
          </div>

          <div className="desk-field compact">
            <label htmlFor="desk-max-miles">Max miles</label>
            <input
              id="desk-max-miles"
              className="dc-input tabular-nums"
              inputMode="numeric"
              value={filters.maxMiles ?? ""}
              onChange={setNumber((n) => setFilter({ maxMiles: n || null }))}
              placeholder="Any"
            />
          </div>
          <div className="desk-field compact">
            <label htmlFor="desk-min-score">Min readiness %</label>
            <input
              id="desk-min-score"
              className="dc-input tabular-nums"
              inputMode="numeric"
              value={filters.minScore ?? ""}
              onChange={setNumber((n) => setFilter({ minScore: n || null }))}
              placeholder="Any"
            />
          </div>
          <button
            type="button"
            className="desk-clear-btn transition-colors"
            onClick={onClearFilters}
          >
            Clear filters
          </button>
          {/* Geography boundary — stated up front so OTD accuracy is never a
              surprise in a demo. Remove once the 50-state engine ships. A
              full-row grid item (grid-column: 1 / -1) rather than a child of
              a .desk-field cell, so it can't stretch the Buyer state cell
              and misalign the row (align-items: end). */}
          <p
            id="desk-buyer-state-hint"
            className="desk-field-hint"
            style={{
              gridColumn: "1 / -1",
              fontSize: 11,
              color: "var(--color-text-subtle)",
              margin: "4px 0 0",
              lineHeight: 1.4,
            }}
          >
            Models a Michigan dealership (MI reciprocity for out-of-state buyers) — verify OTD
            before quoting.
          </p>
        </div>
      )}
    </section>
  );
};

DeskTermsRailComponent.displayName = "DeskTermsRail";

export const DeskTermsRail = React.memo(DeskTermsRailComponent);
