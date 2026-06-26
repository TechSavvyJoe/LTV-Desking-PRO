import React from "react";
import type { FilterData, DealData, ValidationErrors } from "../types";
import { validateInput } from "../services/validator";
import * as Icons from "./common/Icons";
import Input from "./common/Input";
import Select from "./common/Select";
import InputGroup from "./common/InputGroup";

interface DealControlsProps {
  filters: FilterData;
  setFilters: React.Dispatch<React.SetStateAction<FilterData>>;
  dealData: DealData;
  setDealData: React.Dispatch<React.SetStateAction<DealData>>;
  errors: ValidationErrors;
  setErrors: React.Dispatch<React.SetStateAction<ValidationErrors>>;
  customerName: string;
  setCustomerName: React.Dispatch<React.SetStateAction<string>>;
  salespersonName: string;
  setSalespersonName: React.Dispatch<React.SetStateAction<string>>;
  onVinLookup: () => void;
  vinLookupResult: string | null;
  isVinLoading: boolean;
}

/* Stroke-1.6 inline group icons — one consistent set, matching the desk redesign. */
const Stroke: React.FC<{ d: string; className?: string }> = ({ d, className }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d={d} />
  </svg>
);

const ICONS = {
  customer: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  cash: "M2 7h20v10H2z M2 11h20",
  incentive:
    "M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z",
  structure: "M3 3v18h18 M7 14l4-4 3 3 5-6",
  search: "M21 21l-4.3-4.3 M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14",
};

/** A labeled group within the deal-terms panel: uppercase eyebrow + green icon, then fields. */
const Group: React.FC<{
  icon: keyof typeof ICONS;
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ icon, title, children, className = "" }) => (
  <div className={className}>
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[var(--color-primary)]">
        <Stroke d={ICONS[icon]} />
      </span>
      <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--color-text-subtle)]">
        {title}
      </span>
    </div>
    <div className="space-y-3">{children}</div>
  </div>
);

const Panel: React.FC<{
  icon: React.ReactNode;
  title: string;
  badge?: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ icon, title, badge, hint, children }) => (
  <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-[var(--shadow-md)] overflow-hidden">
    <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[var(--color-border)]">
      <span className="text-[var(--color-primary)]">{icon}</span>
      <h3 className="font-display text-[15px] font-semibold text-[var(--color-text)] tracking-tight">
        {title}
      </h3>
      {badge && (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-primary)] bg-[var(--color-primary-subtle)] px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
          {badge}
        </span>
      )}
      {hint && (
        <span className="ml-auto hidden lg:block text-xs text-[var(--color-text-subtle)]">
          {hint}
        </span>
      )}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

const DealControls: React.FC<DealControlsProps> = ({
  filters,
  setFilters,
  dealData,
  setDealData,
  errors,
  setErrors,
  customerName,
  setCustomerName,
  salespersonName,
  setSalespersonName,
  onVinLookup,
  vinLookupResult,
  isVinLoading,
}) => {
  // Helper to handle empty string input cleanly
  const handleNumberInput = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: any) => void,
    obj: any,
    key: string
  ) => {
    const val = e.target.value;
    if (val === "") {
      setter({ ...obj, [key]: "" }); // Allow clearing the input
      setErrors((prev) => {
        const { [key]: _, ...rest } = prev;
        return rest;
      }); // Clear error on empty
      return;
    }

    const numVal = parseFloat(val);
    if (!isNaN(numVal)) {
      setter({ ...obj, [key]: numVal });

      const errorMsg = validateInput(key, numVal);
      setErrors((prev) =>
        errorMsg ? { ...prev, [key]: errorMsg } : (({ [key]: _, ...rest }) => rest)(prev)
      );
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value, type } = e.target;
    if (type === "number") {
      // Use the helper logic manually for filters since they are nullable
      const val = value === "" ? null : Number(value);
      setFilters((prev) => ({ ...prev, [id]: val }));
      // Validation
      const error = validateInput(id, val);
      setErrors((prev) =>
        error ? { ...prev, [id]: error } : (({ [id]: _, ...rest }) => rest)(prev)
      );
    } else {
      // Text inputs (VIN, vehicle name)
      let processedValue = value;
      if (id === "vin") {
        processedValue = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      }
      setFilters((prev) => ({ ...prev, [id]: processedValue }));
    }
  };

  const handleDealChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;

    if (value === "") {
      setDealData((prev) => ({ ...prev, [id]: "" }));
      return;
    }

    const numValue = Number(value);

    const errorMessage = validateInput(id, numValue);
    setErrors((prev) =>
      errorMessage ? { ...prev, [id]: errorMessage } : (({ [id]: _, ...rest }) => rest)(prev)
    );

    setDealData((prev) => ({ ...prev, [id]: numValue }));
  };

  // Buyer state is a string field — it cannot go through handleDealChange,
  // which coerces every value with Number(). An empty value means "use the
  // dealership default" (buyerState stays undefined). [G18]
  const handleBuyerStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setDealData((prev) => ({
      ...prev,
      buyerState: value === "" ? undefined : (value as DealData["buyerState"]),
    }));
  };

  const vinResultColor = vinLookupResult?.toLowerCase().startsWith("error")
    ? "text-red-500"
    : "text-green-500";

  return (
    <div className="space-y-5 pb-2">
      {/* ───── Deal terms — re-prices & re-ranks all inventory ───── */}
      <Panel
        icon={
          <Stroke d="M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" className="!w-4 !h-4" />
        }
        title="Deal terms"
        badge="LIVE"
        hint="Every change re-prices & re-ranks all inventory instantly"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5">
          <Group icon="customer" title="Customer & credit">
            <InputGroup label="Customer Name" htmlFor="customerName">
              <Input
                type="text"
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g., John Doe"
              />
            </InputGroup>
            <InputGroup label="Salesperson Name" htmlFor="salespersonName">
              <Input
                type="text"
                id="salespersonName"
                value={salespersonName}
                onChange={(e) => setSalespersonName(e.target.value)}
                placeholder="e.g., Jane Smith"
              />
            </InputGroup>
            <div className="grid grid-cols-2 gap-3">
              <InputGroup label="Credit Score" htmlFor="creditScore" error={errors.creditScore}>
                <Input
                  type="number"
                  id="creditScore"
                  inputMode="numeric"
                  value={filters.creditScore ?? ""}
                  onChange={handleFilterChange}
                  placeholder="720"
                  min="300"
                  max="850"
                  error={!!errors.creditScore}
                />
              </InputGroup>
              <InputGroup label="Buyer State" htmlFor="buyerState">
                <Select
                  id="buyerState"
                  value={dealData.buyerState ?? ""}
                  onChange={handleBuyerStateChange}
                >
                  <option value="">MI (default)</option>
                  <option value="OH">OH</option>
                  <option value="IN">IN</option>
                </Select>
              </InputGroup>
            </div>
            <InputGroup
              label="Monthly Income ($)"
              htmlFor="monthlyIncome"
              error={errors.monthlyIncome}
            >
              <Input
                type="number"
                id="monthlyIncome"
                value={filters.monthlyIncome ?? ""}
                onChange={handleFilterChange}
                placeholder="e.g., 5000"
                min="0"
                error={!!errors.monthlyIncome}
              />
            </InputGroup>
          </Group>

          <Group icon="cash" title="Cash & trade">
            <InputGroup label="Down Pmt ($)" htmlFor="downPayment" error={errors.downPayment}>
              <Input
                type="number"
                id="downPayment"
                value={dealData.downPayment === 0 ? "" : dealData.downPayment}
                onChange={handleDealChange}
                min="0"
                step="100"
                error={!!errors.downPayment}
                placeholder="0"
              />
            </InputGroup>
            <InputGroup label="Trade Value ($)" htmlFor="tradeInValue" error={errors.tradeInValue}>
              <Input
                type="number"
                id="tradeInValue"
                value={dealData.tradeInValue === 0 ? "" : dealData.tradeInValue}
                onChange={handleDealChange}
                min="0"
                step="100"
                error={!!errors.tradeInValue}
                placeholder="0"
              />
            </InputGroup>
            <InputGroup
              label="Trade Payoff ($)"
              htmlFor="tradeInPayoff"
              error={errors.tradeInPayoff}
            >
              <Input
                type="number"
                id="tradeInPayoff"
                value={dealData.tradeInPayoff === 0 ? "" : dealData.tradeInPayoff}
                onChange={handleDealChange}
                min="0"
                step="100"
                error={!!errors.tradeInPayoff}
                placeholder="0"
              />
            </InputGroup>
          </Group>

          <Group icon="incentive" title="Incentives & fees">
            <InputGroup
              label="Backend ($)"
              htmlFor="backendProducts"
              error={errors.backendProducts}
            >
              <Input
                type="number"
                id="backendProducts"
                value={dealData.backendProducts === 0 ? "" : dealData.backendProducts}
                onChange={handleDealChange}
                min="0"
                step="50"
                error={!!errors.backendProducts}
                placeholder="0"
              />
            </InputGroup>
            <InputGroup label="State Fees ($)" htmlFor="stateFees" error={errors.stateFees}>
              <Input
                type="number"
                id="stateFees"
                value={dealData.stateFees === 0 ? "" : dealData.stateFees}
                onChange={handleDealChange}
                min="0"
                step="1"
                error={!!errors.stateFees}
                placeholder="0"
              />
            </InputGroup>
          </Group>

          <Group icon="structure" title="Structure">
            <InputGroup label="Term (Months)" htmlFor="loanTerm">
              <Select id="loanTerm" value={dealData.loanTerm} onChange={handleDealChange}>
                <option value="36">36</option>
                <option value="48">48</option>
                <option value="54">54</option>
                <option value="60">60</option>
                <option value="66">66</option>
                <option value="72">72</option>
                <option value="75">75</option>
                <option value="84">84</option>
              </Select>
            </InputGroup>
            <InputGroup label="APR (%)" htmlFor="interestRate" error={errors.interestRate}>
              <Input
                type="number"
                id="interestRate"
                value={dealData.interestRate}
                onChange={handleDealChange}
                min="0"
                max="50"
                step="0.1"
                error={!!errors.interestRate}
                placeholder="8.5"
              />
            </InputGroup>
          </Group>
        </div>
      </Panel>

      {/* ───── Inventory filters ───── */}
      <Panel icon={<Stroke d={ICONS.search} className="!w-4 !h-4" />} title="Find a vehicle">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <InputGroup label="VIN Lookup" htmlFor="vin" className="col-span-2 md:col-span-1">
            <div className="relative">
              <Input
                type="text"
                id="vin"
                value={filters.vin}
                onChange={handleFilterChange}
                placeholder="17-digit VIN"
                maxLength={17}
              />
              {isVinLoading && (
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <Icons.SpinnerIcon className="animate-spin h-5 w-5 text-[var(--color-primary)]" />
                </div>
              )}
            </div>
            {vinLookupResult && (
              <p className={`mt-1 text-xs ${vinResultColor}`}>{vinLookupResult}</p>
            )}
          </InputGroup>
          <InputGroup label="Filter Vehicle" htmlFor="vehicle" className="col-span-2 md:col-span-2">
            <Input
              type="text"
              id="vehicle"
              value={filters.vehicle}
              onChange={handleFilterChange}
              placeholder="e.g., Ford Escape"
            />
          </InputGroup>
          <InputGroup label="Max Price ($)" htmlFor="maxPrice" error={errors.maxPrice}>
            <Input
              type="number"
              id="maxPrice"
              value={filters.maxPrice ?? ""}
              onChange={handleFilterChange}
              placeholder="25000"
              min="0"
              error={!!errors.maxPrice}
            />
          </InputGroup>
          <InputGroup label="Max Payment ($)" htmlFor="maxPayment" error={errors.maxPayment}>
            <Input
              type="number"
              id="maxPayment"
              value={filters.maxPayment ?? ""}
              onChange={handleFilterChange}
              placeholder="450"
              min="0"
              error={!!errors.maxPayment}
            />
          </InputGroup>
          <InputGroup label="Max Miles" htmlFor="maxMiles" error={errors.maxMiles}>
            <Input
              type="number"
              id="maxMiles"
              inputMode="numeric"
              value={filters.maxMiles ?? ""}
              onChange={handleFilterChange}
              placeholder="100000"
              min="0"
              error={!!errors.maxMiles}
            />
          </InputGroup>
          <InputGroup label="Max OTD LTV (%)" htmlFor="maxOtdLtv" error={errors.maxOtdLtv}>
            <Input
              type="number"
              id="maxOtdLtv"
              value={filters.maxOtdLtv ?? ""}
              onChange={handleFilterChange}
              placeholder="125"
              min="0"
              max="200"
              error={!!errors.maxOtdLtv}
            />
          </InputGroup>
        </div>
      </Panel>
    </div>
  );
};

export default DealControls;
