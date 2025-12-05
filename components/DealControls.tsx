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
        errorMsg
          ? { ...prev, [key]: errorMsg }
          : (({ [key]: _, ...rest }) => rest)(prev)
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
        error
          ? { ...prev, [id]: error }
          : (({ [id]: _, ...rest }) => rest)(prev)
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

  const handleDealChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { id, value } = e.target;

    if (value === "") {
      setDealData((prev) => ({ ...prev, [id]: "" }));
      return;
    }

    const numValue = Number(value);

    const errorMessage = validateInput(id, numValue);
    setErrors((prev) =>
      errorMessage
        ? { ...prev, [id]: errorMessage }
        : (({ [id]: _, ...rest }) => rest)(prev)
    );

    setDealData((prev) => ({ ...prev, [id]: numValue }));
  };

  const vinResultColor = vinLookupResult?.toLowerCase().startsWith("error")
    ? "text-red-500"
    : "text-green-500";

  return (
    <div className="border-b border-slate-200 dark:border-gray-700 space-y-4 py-4">
      <div className="border border-slate-200 dark:border-gray-700 rounded-2xl p-5 space-y-2 bg-white/90 dark:bg-slate-900/60 shadow-lg">
        <h3 className="font-bold text-lg mb-2 text-slate-900 dark:text-white flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white text-sm font-black">
            1
          </span>
          Customer & Deal Info
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <InputGroup
            label="Customer Name"
            htmlFor="customerName"
            className="lg:col-span-1"
          >
            <Input
              type="text"
              id="customerName"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g., John Doe"
            />
          </InputGroup>
          <InputGroup
            label="Salesperson Name"
            htmlFor="salespersonName"
            className="lg:col-span-1"
          >
            <Input
              type="text"
              id="salespersonName"
              value={salespersonName}
              onChange={(e) => setSalespersonName(e.target.value)}
              placeholder="e.g., Jane Smith"
            />
          </InputGroup>
          <InputGroup
            label="Credit Score"
            htmlFor="creditScore"
            error={errors.creditScore}
          >
            <Input
              type="number"
              id="creditScore"
              value={filters.creditScore ?? ""}
              onChange={handleFilterChange}
              placeholder="e.g., 720"
              min="300"
              max="850"
              error={!!errors.creditScore}
            />
          </InputGroup>
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
          <div className="lg:col-span-2 xl:col-span-1">
            <InputGroup label="VIN Lookup" htmlFor="vin">
              <div className="relative">
                <Input
                  type="text"
                  id="vin"
                  value={filters.vin}
                  onChange={handleFilterChange}
                  placeholder="Enter 17-digit VIN"
                  maxLength={17}
                />
                {isVinLoading && (
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <Icons.SpinnerIcon className="animate-spin h-5 w-5 text-blue-500" />
                  </div>
                )}
              </div>
              {vinLookupResult && (
                <p className={`mt-1 text-xs ${vinResultColor}`}>
                  {vinLookupResult}
                </p>
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
              value={filters.vehicle}
              onChange={handleFilterChange}
              placeholder="e.g., Ford Escape"
            />
          </InputGroup>
          <InputGroup
            label="Max Price ($)"
            htmlFor="maxPrice"
            error={errors.maxPrice}
          >
            <Input
              type="number"
              id="maxPrice"
              value={filters.maxPrice ?? ""}
              onChange={handleFilterChange}
              placeholder="e.g., 25000"
              min="0"
              error={!!errors.maxPrice}
            />
          </InputGroup>
          <InputGroup
            label="Max Payment ($)"
            htmlFor="maxPayment"
            error={errors.maxPayment}
          >
            <Input
              type="number"
              id="maxPayment"
              value={filters.maxPayment ?? ""}
              onChange={handleFilterChange}
              placeholder="e.g., 450"
              min="0"
              error={!!errors.maxPayment}
            />
          </InputGroup>
        </div>
      </div>

      <div className="border border-slate-200 dark:border-gray-700 rounded-2xl p-5 space-y-2 bg-white/90 dark:bg-slate-900/60 shadow-lg">
        <h3 className="font-bold text-lg mb-2 text-slate-900 dark:text-white flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-sm font-black">
            2
          </span>
          Global Deal Structure
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
          <InputGroup
            label="Down Pmt ($)"
            htmlFor="downPayment"
            error={errors.downPayment}
          >
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
          <InputGroup
            label="Trade Value ($)"
            htmlFor="tradeInValue"
            error={errors.tradeInValue}
          >
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
          <InputGroup
            label="Backend ($)"
            htmlFor="backendProducts"
            error={errors.backendProducts}
          >
            <Input
              type="number"
              id="backendProducts"
              value={
                dealData.backendProducts === 0 ? "" : dealData.backendProducts
              }
              onChange={handleDealChange}
              min="0"
              step="50"
              error={!!errors.backendProducts}
              placeholder="0"
            />
          </InputGroup>
          <InputGroup
            label="State Fees ($)"
            htmlFor="stateFees"
            error={errors.stateFees}
          >
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
          <InputGroup label="Term (Mo)" htmlFor="loanTerm">
            <Select
              id="loanTerm"
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
          <InputGroup
            label="APR (%)"
            htmlFor="interestRate"
            error={errors.interestRate}
          >
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
        </div>
      </div>
    </div>
  );
};

export default DealControls;
