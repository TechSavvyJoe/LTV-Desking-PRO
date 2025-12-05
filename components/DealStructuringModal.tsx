import React, { useMemo, useState, useEffect } from "react";
import type {
  CalculatedVehicle,
  DealData,
  ValidationErrors,
  Settings,
} from "../types";
import { calculateFinancials } from "../services/calculator";
import { validateInput } from "../services/validator";
import {
  formatCurrency,
  LtvCell,
  OtdLtvCell,
  formatPercentage,
} from "./common/TableCell";
import CopyToClipboard from "./common/CopyToClipboard";
import Modal from "./common/Modal";
import Button from "./common/Button";
import Input from "./common/Input";
import Select from "./common/Select";
import Textarea from "./common/Textarea";
import InputGroup from "./common/InputGroup";
import * as Icons from "./common/Icons";

interface DealStructuringModalProps {
  vehicle: CalculatedVehicle;
  dealData: DealData;
  setDealData: React.Dispatch<React.SetStateAction<DealData>>;
  onClose: () => void;
  errors: ValidationErrors;
  setErrors: React.Dispatch<React.SetStateAction<ValidationErrors>>;
  onSave: () => void;
  onSaveAndClear: () => void;
  settings: Settings;
}

const SummaryRow = ({
  label,
  value,
  valueToCopy,
  isBold = false,
  isTotal = false,
}: {
  label: string;
  value: React.ReactNode;
  valueToCopy?: string | number | "N/A" | "Error";
  isBold?: boolean;
  isTotal?: boolean;
}) => (
  <div
    className={`flex justify-between items-center py-2 text-sm border-b border-slate-100 dark:border-slate-800/50 last:border-0 ${
      isTotal
        ? "bg-slate-50 dark:bg-slate-800/50 -mx-4 px-4 py-3 rounded-lg"
        : ""
    }`}
  >
    <span
      className={`${
        isBold || isTotal
          ? "font-semibold text-slate-800 dark:text-slate-100"
          : "text-slate-500 dark:text-slate-400"
      }`}
    >
      {label}
    </span>
    {valueToCopy !== undefined &&
    valueToCopy !== "N/A" &&
    valueToCopy !== "Error" ? (
      <CopyToClipboard valueToCopy={valueToCopy}>
        <span
          className={`font-medium cursor-pointer hover:text-blue-500 transition-colors ${
            isBold || isTotal
              ? "text-slate-900 dark:text-white"
              : "text-slate-700 dark:text-slate-300"
          }`}
          title="Click to copy"
        >
          {value}
        </span>
      </CopyToClipboard>
    ) : (
      <span
        className={`font-medium ${
          isBold || isTotal
            ? "text-slate-900 dark:text-white"
            : "text-slate-700 dark:text-slate-300"
        }`}
      >
        {value}
      </span>
    )}
  </div>
);

const DealStructuringModal: React.FC<DealStructuringModalProps> = ({
  vehicle,
  dealData,
  setDealData,
  onClose,
  errors,
  setErrors,
  onSave,
  onSaveAndClear,
  settings,
}) => {
  // Critical guard: Ensure vehicle and dealData exist before calculating.
  const localCalculated = useMemo(() => {
    if (!vehicle || !dealData) return null;
    return calculateFinancials(vehicle, dealData, settings);
  }, [vehicle, dealData, settings]);

  if (!vehicle || !dealData || !localCalculated) return null;

  const handleDealChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { id, value } = e.target;

    if (id === "notes") {
      setDealData((prev) => ({ ...prev, notes: value }));
      return;
    }

    const numValue = Number(value) || 0;
    const errorMessage = validateInput(id, numValue);
    setErrors((prev) => {
      if (errorMessage) return { ...prev, [id]: errorMessage };
      const { [id]: _, ...rest } = prev;
      return rest;
    });

    setDealData((prev) => ({ ...prev, [id]: numValue }));
  };

  const netTradeIn = dealData.tradeInValue - dealData.tradeInPayoff;
  const totalDown = dealData.downPayment + netTradeIn;

  const warnings: { type: "warning" | "critical"; message: string }[] = [];

  if (netTradeIn < 0) {
    warnings.push({
      type: "critical",
      message: `Negative Equity: Customer is upside-down by ${formatCurrency(
        Math.abs(netTradeIn)
      )}.`,
    });
  }
  if (
    typeof localCalculated.otdLtv === "number" &&
    localCalculated.otdLtv > 135
  ) {
    warnings.push({
      type: "warning",
      message: `High OTD LTV: ${formatPercentage(
        localCalculated.otdLtv
      )}. Funding difficulty likely.`,
    });
  }
  if (
    typeof localCalculated.frontEndGross === "number" &&
    localCalculated.frontEndGross < 500
  ) {
    warnings.push({
      type: "warning",
      message: `Low Profit: Deal gross is only ${formatCurrency(
        localCalculated.frontEndGross
      )}.`,
    });
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Structure Deal"
      description={vehicle.vehicle}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={onSave} className="ml-auto">
            Save Draft
          </Button>
          <Button variant="primary" onClick={onSaveAndClear}>
            Save & New Deal
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side: Inputs */}
        <div className="space-y-6">
          <section className="space-y-4">
            <h4 className="border-b pb-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Payments & Values
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputGroup
                label="Down Payment ($)"
                htmlFor="downPayment"
                error={errors.downPayment}
              >
                <Input
                  type="number"
                  id="downPayment"
                  value={dealData.downPayment || ""}
                  onChange={handleDealChange}
                  min="0"
                  step="100"
                  error={!!errors.downPayment}
                />
              </InputGroup>
              <InputGroup
                label="Trade-In Value ($)"
                htmlFor="tradeInValue"
                error={errors.tradeInValue}
              >
                <Input
                  type="number"
                  id="tradeInValue"
                  value={dealData.tradeInValue || ""}
                  onChange={handleDealChange}
                  min="0"
                  step="100"
                  error={!!errors.tradeInValue}
                />
              </InputGroup>
              <InputGroup
                label="Trade-In Payoff ($)"
                htmlFor="tradeInPayoff"
                error={errors.tradeInPayoff}
              >
                <Input
                  type="number"
                  id="tradeInPayoff"
                  value={dealData.tradeInPayoff || ""}
                  onChange={handleDealChange}
                  min="0"
                  step="100"
                  error={!!errors.tradeInPayoff}
                />
              </InputGroup>
              <InputGroup
                label="State/Title Fees ($)"
                htmlFor="stateFees"
                error={errors.stateFees}
              >
                <Input
                  type="number"
                  id="stateFees"
                  value={dealData.stateFees || ""}
                  onChange={handleDealChange}
                  min="0"
                  step="1"
                  error={!!errors.stateFees}
                />
              </InputGroup>
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="border-b pb-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Loan Details
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputGroup
                label="Backend Products ($)"
                htmlFor="backendProducts"
                error={errors.backendProducts}
              >
                <Input
                  type="number"
                  id="backendProducts"
                  value={dealData.backendProducts || ""}
                  onChange={handleDealChange}
                  min="0"
                  step="50"
                  error={!!errors.backendProducts}
                />
              </InputGroup>
              <InputGroup label="Loan Term (Months)" htmlFor="loanTerm">
                <Select
                  id="loanTerm"
                  value={dealData.loanTerm}
                  onChange={handleDealChange}
                >
                  <option value="36">36 Months</option>
                  <option value="48">48 Months</option>
                  <option value="60">60 Months</option>
                  <option value="72">72 Months</option>
                  <option value="84">84 Months</option>
                </Select>
              </InputGroup>
              <div className="md:col-span-2">
                <InputGroup
                  label="Interest Rate (APR %)"
                  htmlFor="interestRate"
                  error={errors.interestRate}
                >
                  <Input
                    type="number"
                    id="interestRate"
                    value={dealData.interestRate || ""}
                    onChange={handleDealChange}
                    min="0"
                    max="50"
                    step="0.1"
                    error={!!errors.interestRate}
                  />
                </InputGroup>
              </div>
            </div>
          </section>

          <section>
            <InputGroup label="Deal Notes" htmlFor="notes">
              <Textarea
                id="notes"
                value={dealData.notes || ""}
                onChange={handleDealChange}
                placeholder="Add specific notes, stipulations, or customer requests..."
                rows={3}
              />
            </InputGroup>
          </section>
        </div>

        {/* Right Side: Summary */}
        <div className="lg:pl-8 lg:border-l border-slate-200 dark:border-slate-800">
          <div className="bg-slate-50 dark:bg-slate-800/40 p-6 rounded-2xl border border-slate-200 dark:border-slate-700/50 sticky top-4">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-5 flex items-center gap-2">
              <Icons.CalculatorIcon className="w-5 h-5 text-blue-500" />
              Deal Analysis
            </h3>

            <div className="space-y-1">
              <SummaryRow
                label="Vehicle Price"
                value={formatCurrency(vehicle.price)}
                valueToCopy={vehicle.price}
              />
              <SummaryRow
                label="Base OTD Price"
                value={formatCurrency(localCalculated.baseOutTheDoorPrice)}
                valueToCopy={localCalculated.baseOutTheDoorPrice}
              />

              <div className="my-4 h-px bg-slate-200 dark:bg-slate-700/50" />

              <SummaryRow
                label="Cash Down"
                value={formatCurrency(dealData.downPayment)}
                valueToCopy={dealData.downPayment}
              />
              <SummaryRow
                label="Net Trade Equity"
                value={formatCurrency(netTradeIn)}
                valueToCopy={netTradeIn}
              />
              <SummaryRow
                label="Total Down"
                value={formatCurrency(totalDown)}
                isBold={true}
                valueToCopy={totalDown}
              />

              <div className="my-4 h-px bg-slate-200 dark:bg-slate-700/50" />

              <SummaryRow
                label="Backend Products"
                value={formatCurrency(dealData.backendProducts)}
                valueToCopy={dealData.backendProducts}
              />
              <SummaryRow
                label="Amount to Finance"
                value={formatCurrency(localCalculated.amountToFinance)}
                isBold={true}
                isTotal={true}
                valueToCopy={localCalculated.amountToFinance}
              />

              <div className="my-6 space-y-3">
                <div className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl text-white shadow-lg shadow-blue-500/20">
                  <div className="text-blue-100 text-sm font-medium mb-1">
                    Monthly Payment
                  </div>
                  <div className="flex justify-between items-end">
                    <div className="text-3xl font-bold">
                      {formatCurrency(localCalculated.monthlyPayment)}
                    </div>
                    <div className="text-blue-200 text-sm pb-1">
                      {dealData.loanTerm} mo @ {dealData.interestRate}%
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Front-End LTV
                  </div>
                  <LtvCell value={localCalculated.frontEndLtv} />
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    OTD LTV
                  </div>
                  <OtdLtvCell value={localCalculated.otdLtv} />
                </div>
              </div>

              {warnings.length > 0 && (
                <div className="mt-6 space-y-2">
                  {warnings.map((warning, index) => (
                    <div
                      key={index}
                      className={`
                        flex items-start p-3 rounded-xl text-sm border
                        ${
                          warning.type === "critical"
                            ? "bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-300"
                            : "bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30 text-amber-700 dark:text-amber-300"
                        }
                      `}
                    >
                      <Icons.ExclamationTriangleIcon
                        className={`w-5 h-5 mr-2 flex-shrink-0 ${
                          warning.type === "critical"
                            ? "text-red-500 dark:text-red-400"
                            : "text-amber-500 dark:text-amber-400"
                        }`}
                      />
                      <span>{warning.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DealStructuringModal;
