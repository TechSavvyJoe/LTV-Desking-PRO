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
  const handleNumberInput = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: any) => void,
    obj: any,
    key: string
  ) => {
    const val = e.target.value;
    if (val === "") {
      setter({ ...obj, [key]: "" });
      setErrors((prev) => {
        const { [key]: _, ...rest } = prev;
        return rest;
      });
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
      const val = value === "" ? null : Number(value);
      setFilters((prev) => ({ ...prev, [id]: val }));
      const error = validateInput(id, val);
      setErrors((prev) =>
        error ? { ...prev, [id]: error } : (({ [id]: _, ...rest }) => rest)(prev)
      );
    } else {
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

  const vinResultColor = vinLookupResult?.toLowerCase().startsWith("error")
    ? "text-red-500"
    : "text-emerald-500";

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
      {/* Customer & Deal Info */}
      <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 bg-neutral-50 dark:bg-neutral-800/50">
        <h3 className="font-medium text-sm mb-3 text-neutral-900 dark:text-white flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary-500 text-white text-xs font-semibold">
            1
          </span>
          Customer & Deal Info
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-4 gap-3">
          <InputGroup label="Customer Name" htmlFor="customerName" className="lg:col-span-1">
            <Input
              type="text"
              id="customerName"
              inputSize="sm"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="John Doe"
            />
          </InputGroup>
          <InputGroup label="Salesperson" htmlFor="salespersonName" className="lg:col-span-1">
            <Input
              type="text"
              id="salespersonName"
              inputSize="sm"
              value={salespersonName}
              onChange={(e) => setSalespersonName(e.target.value)}
              placeholder="Jane Smith"
            />
          </InputGroup>
          <InputGroup label="Credit Score" htmlFor="creditScore" error={errors.creditScore}>
            <Input
              type="number"
              id="creditScore"
              inputSize="sm"
              value={filters.creditScore ?? ""}
              onChange={handleFilterChange}
              placeholder="720"
              min="300"
              max="850"
              error={!!errors.creditScore}
            />
          </InputGroup>
          <InputGroup label="Monthly Income" htmlFor="monthlyIncome" error={errors.monthlyIncome}>
            <Input
              type="number"
              id="monthlyIncome"
              inputSize="sm"
              value={filters.monthlyIncome ?? ""}
              onChange={handleFilterChange}
              placeholder="5000"
              min="0"
              error={!!errors.monthlyIncome}
            />
          </InputGroup>
          <div className="lg:col-span-2 xl:col-span-1">
            <InputGroup label="VIN Lookup" htmlFor="vin">
              <div className="relative">
                <Input
                  type="text"
                  id="vin"
                  inputSize="sm"
                  value={filters.vin}
                  onChange={handleFilterChange}
                  placeholder="17-digit VIN"
                  maxLength={17}
                  className="font-mono uppercase"
                />
                {isVinLoading && (
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <Icons.SpinnerIcon className="animate-spin h-4 w-4 text-primary-500" />
                  </div>
                )}
              </div>
              {vinLookupResult && (
                <p className={`mt-1 text-xs ${vinResultColor}`}>{vinLookupResult}</p>
              )}
            </InputGroup>
          </div>
          <InputGroup
            label="Filter Vehicle"
            htmlFor="vehicle"
            className="lg:col-span-2 xl:col-span-2"
          >
            <Input
              type="text"
              id="vehicle"
              inputSize="sm"
              value={filters.vehicle}
              onChange={handleFilterChange}
              placeholder="Ford Escape"
            />
          </InputGroup>
          <InputGroup label="Max Price" htmlFor="maxPrice" error={errors.maxPrice}>
            <Input
              type="number"
              id="maxPrice"
              inputSize="sm"
              value={filters.maxPrice ?? ""}
              onChange={handleFilterChange}
              placeholder="25000"
              min="0"
              error={!!errors.maxPrice}
            />
          </InputGroup>
          <InputGroup label="Max Payment" htmlFor="maxPayment" error={errors.maxPayment}>
            <Input
              type="number"
              id="maxPayment"
              inputSize="sm"
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
              inputSize="sm"
              value={filters.maxMiles ?? ""}
              onChange={handleFilterChange}
              placeholder="100000"
              min="0"
              error={!!errors.maxMiles}
            />
          </InputGroup>
          <InputGroup label="Max OTD LTV %" htmlFor="maxOtdLtv" error={errors.maxOtdLtv}>
            <Input
              type="number"
              id="maxOtdLtv"
              inputSize="sm"
              value={filters.maxOtdLtv ?? ""}
              onChange={handleFilterChange}
              placeholder="125"
              min="0"
              max="200"
              error={!!errors.maxOtdLtv}
            />
          </InputGroup>
        </div>
      </div>

      {/* Global Deal Structure */}
      <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 bg-neutral-50 dark:bg-neutral-800/50">
        <h3 className="font-medium text-sm mb-3 text-neutral-900 dark:text-white flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500 text-white text-xs font-semibold">
            2
          </span>
          Global Deal Structure
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-7 2xl:grid-cols-4 gap-3">
          <InputGroup label="Down Payment" htmlFor="downPayment" error={errors.downPayment}>
            <Input
              type="number"
              id="downPayment"
              inputSize="sm"
              value={dealData.downPayment === 0 ? "" : dealData.downPayment}
              onChange={handleDealChange}
              min="0"
              step="100"
              error={!!errors.downPayment}
              placeholder="0"
            />
          </InputGroup>
          <InputGroup label="Trade Value" htmlFor="tradeInValue" error={errors.tradeInValue}>
            <Input
              type="number"
              id="tradeInValue"
              inputSize="sm"
              value={dealData.tradeInValue === 0 ? "" : dealData.tradeInValue}
              onChange={handleDealChange}
              min="0"
              step="100"
              error={!!errors.tradeInValue}
              placeholder="0"
            />
          </InputGroup>
          <InputGroup label="Trade Payoff" htmlFor="tradeInPayoff" error={errors.tradeInPayoff}>
            <Input
              type="number"
              id="tradeInPayoff"
              inputSize="sm"
              value={dealData.tradeInPayoff === 0 ? "" : dealData.tradeInPayoff}
              onChange={handleDealChange}
              min="0"
              step="100"
              error={!!errors.tradeInPayoff}
              placeholder="0"
            />
          </InputGroup>
          <InputGroup label="Backend" htmlFor="backendProducts" error={errors.backendProducts}>
            <Input
              type="number"
              id="backendProducts"
              inputSize="sm"
              value={dealData.backendProducts === 0 ? "" : dealData.backendProducts}
              onChange={handleDealChange}
              min="0"
              step="50"
              error={!!errors.backendProducts}
              placeholder="0"
            />
          </InputGroup>
          <InputGroup label="State Fees" htmlFor="stateFees" error={errors.stateFees}>
            <Input
              type="number"
              id="stateFees"
              inputSize="sm"
              value={dealData.stateFees === 0 ? "" : dealData.stateFees}
              onChange={handleDealChange}
              min="0"
              step="1"
              error={!!errors.stateFees}
              placeholder="0"
            />
          </InputGroup>
          <InputGroup label="Term (Mo)" htmlFor="loanTerm">
            <Select
              id="loanTerm"
              selectSize="sm"
              value={dealData.loanTerm}
              onChange={handleDealChange}
            >
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
          <InputGroup label="APR %" htmlFor="interestRate" error={errors.interestRate}>
            <Input
              type="number"
              id="interestRate"
              inputSize="sm"
              value={dealData.interestRate}
              onChange={handleDealChange}
              min="0"
              max="50"
              step="0.1"
              error={!!errors.interestRate}
              placeholder="8.5"
            />
          </InputGroup>
        </div>
      </div>
    </div>
  );
};

export default DealControls;
