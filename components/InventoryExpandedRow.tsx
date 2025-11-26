import React from "react";
import type {
  CalculatedVehicle,
  DealData,
  FilterData,
  LenderProfile,
  Settings,
} from "../types";
import Button from "./common/Button";
import * as Icons from "./common/Icons";
import { checkBankEligibility } from "../services/lenderMatcher";
import { formatCurrency } from "./common/TableCell";
import CopyToClipboard from "./common/CopyToClipboard";

interface InventoryExpandedRowProps {
  item: CalculatedVehicle;
  lenderProfiles: LenderProfile[];
  dealData: DealData;
  setDealData: React.Dispatch<React.SetStateAction<DealData>>;
  onInventoryUpdate: (
    vin: string,
    updatedData: Partial<CalculatedVehicle>
  ) => void;
  customerFilters: FilterData;
  settings: Settings;
  onDownloadPdf: (e: React.MouseEvent, vehicle: CalculatedVehicle) => void;
  onSharePdf: (e: React.MouseEvent, vehicle: CalculatedVehicle) => void;
  isShareSupported: boolean;
}

const DetailItem = ({
  label,
  value,
  valueToCopy,
}: {
  label: string;
  value: React.ReactNode;
  valueToCopy?: string | number | "N/A" | "Error";
}) => (
  <div className="flex justify-between items-center text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
    <span className="text-slate-500 dark:text-gray-400">{label}</span>
    {valueToCopy !== undefined ? (
      <CopyToClipboard valueToCopy={valueToCopy}>
        <span className="font-medium text-slate-900 dark:text-gray-100 hover:text-blue-500 transition-colors cursor-pointer">
          {value}
        </span>
      </CopyToClipboard>
    ) : (
      <span className="font-medium text-slate-900 dark:text-gray-100">
        {value}
      </span>
    )}
  </div>
);

const EditableField = ({
  label,
  value,
  onUpdate,
  type = "number",
  step = "1",
}: {
  label: string;
  value: number | "N/A";
  onUpdate: (newValue: number) => void;
  type?: string;
  step?: string;
}) => {
  const [currentValue, setCurrentValue] = React.useState(
    value === "N/A" ? "" : value.toString()
  );

  React.useEffect(() => {
    setCurrentValue(value === "N/A" ? "" : value.toString());
  }, [value]);

  const handleBlur = () => {
    const newValue = parseFloat(currentValue);
    if (!isNaN(newValue) && newValue >= 0) {
      onUpdate(newValue);
    } else {
      setCurrentValue(value === "N/A" ? "" : value.toString());
    }
  };

  return (
    <div className="flex justify-between items-center text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <label className="text-slate-500 dark:text-gray-400">{label}</label>
      <input
        type={type}
        step={step}
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={handleBlur}
        onClick={(e) => e.stopPropagation()}
        className="w-32 p-1 text-sm text-right border border-slate-300 dark:border-gray-700 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-gray-100"
      />
    </div>
  );
};

const StyledSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className="w-32 p-1 text-sm text-right border border-slate-300 dark:border-gray-700 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-gray-100 cursor-pointer"
  />
);

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
  const safeProfiles = (
    Array.isArray(lenderProfiles) ? lenderProfiles : []
  ).filter((p) => p && typeof p === "object");

  const eligibilityDetails = safeProfiles.map((bank) => {
    try {
      return {
        name: bank.name,
        ...checkBankEligibility(item, { ...dealData, ...customerFilters }, bank),
      };
    } catch (err) {
      return {
        name: bank.name || "Unknown",
        eligible: false,
        reasons: ["Eligibility check failed"],
        matchedTier: null,
      };
    }
  });

  const hasCustomerData =
    customerFilters.creditScore || customerFilters.monthlyIncome;

  return (
    <div
      className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 shadow-inner cursor-default"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Financial Breakdown */}
        <div className="bg-white dark:bg-slate-950 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm lg:col-span-4 flex flex-col">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            <h4 className="font-bold text-base text-slate-900 dark:text-gray-100 flex items-center gap-2">
              <Icons.ChartIcon className="w-5 h-5 text-blue-500" /> Financials
            </h4>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => onDownloadPdf(e, item)}
                className="!text-xs !px-2.5 !py-1.5"
              >
                <Icons.PdfIcon className="w-4 h-4 mr-1" /> PDF
              </Button>
              {isShareSupported && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => onSharePdf(e, item)}
                  className="!text-xs !px-2.5 !py-1.5"
                >
                  <Icons.ShareIcon className="w-4 h-4 mr-1" /> Share
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1 flex-grow">
            <EditableField
              label="Selling Price ($)"
              value={item.price}
              onUpdate={(newPrice) =>
                onInventoryUpdate(item.vin, { price: newPrice })
              }
            />
            <DetailItem
              label="Doc Fee (Taxed)"
              value={formatCurrency(settings.docFee)}
              valueToCopy={settings.docFee}
            />
            <DetailItem
              label="CVR Fee (Taxed)"
              value={formatCurrency(settings.cvrFee)}
              valueToCopy={settings.cvrFee}
            />
            <DetailItem
              label="Sales Tax"
              value={formatCurrency(item.salesTax)}
              valueToCopy={item.salesTax}
            />
            <EditableField
              label="State/Title Fees ($)"
              value={dealData.stateFees}
              onUpdate={(newFees) =>
                setDealData((prev) => ({ ...prev, stateFees: newFees }))
              }
            />

            <div className="flex justify-between items-center font-bold text-base py-2 mt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="text-slate-900 dark:text-gray-100">
                Total OTD Price
              </span>
              <CopyToClipboard valueToCopy={item.baseOutTheDoorPrice}>
                <span className="text-blue-600 dark:text-blue-400 cursor-pointer">
                  {formatCurrency(item.baseOutTheDoorPrice)}
                </span>
              </CopyToClipboard>
            </div>

            <DetailItem
              label="Amount to Finance"
              value={formatCurrency(item.amountToFinance)}
              valueToCopy={item.amountToFinance}
            />
            <DetailItem
              label="Front-End Gross"
              value={formatCurrency(item.frontEndGross)}
              valueToCopy={item.frontEndGross}
            />
            <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800">
              <DetailItem
                label="JD Power (Trade)"
                value={formatCurrency(item.jdPower)}
                valueToCopy={item.jdPower}
              />
              <DetailItem
                label="JD Power (Retail)"
                value={formatCurrency(item.jdPowerRetail)}
                valueToCopy={item.jdPowerRetail}
              />
            </div>
          </div>
        </div>

        {/* Global Deal Structure */}
        <div className="bg-white dark:bg-slate-950 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm lg:col-span-4 flex flex-col">
          <h4 className="font-bold text-base mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 text-slate-900 dark:text-gray-100 flex items-center gap-2">
            <Icons.CogIcon className="w-5 h-5 text-slate-500" /> Deal Structure
          </h4>
          <div className="space-y-1 flex-grow">
            <EditableField
              label="Down Payment ($)"
              value={dealData.downPayment}
              onUpdate={(newValue) =>
                setDealData((prev) => ({ ...prev, downPayment: newValue }))
              }
            />
            <EditableField
              label="Trade-In Value ($)"
              value={dealData.tradeInValue}
              onUpdate={(newValue) =>
                setDealData((prev) => ({ ...prev, tradeInValue: newValue }))
              }
            />
            <EditableField
              label="Trade-In Payoff ($)"
              value={dealData.tradeInPayoff}
              onUpdate={(newValue) =>
                setDealData((prev) => ({ ...prev, tradeInPayoff: newValue }))
              }
            />
            <EditableField
              label="Backend Products ($)"
              value={dealData.backendProducts}
              onUpdate={(newValue) =>
                setDealData((prev) => ({ ...prev, backendProducts: newValue }))
              }
            />
            <EditableField
              label="Interest Rate (APR %)"
              value={dealData.interestRate}
              onUpdate={(newValue) =>
                setDealData((prev) => ({ ...prev, interestRate: newValue }))
              }
              type="number"
              step="0.1"
            />
            <div className="flex justify-between items-center text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <label className="text-slate-500 dark:text-gray-400">
                Loan Term (Months)
              </label>
              <StyledSelect
                value={dealData.loanTerm}
                onChange={(e) => {
                  e.stopPropagation();
                  setDealData((prev) => ({
                    ...prev,
                    loanTerm: Number(e.target.value),
                  }));
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="36">36</option>
                <option value="48">48</option>
                <option value="60">60</option>
                <option value="72">72</option>
                <option value="75">75</option>
                <option value="84">84</option>
              </StyledSelect>
            </div>
          </div>
        </div>

        {/* Lender Eligibility */}
        <div className="bg-white dark:bg-slate-950 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm lg:col-span-4 flex flex-col">
          <h4 className="font-bold text-base mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 text-slate-900 dark:text-gray-100 flex items-center gap-2">
            <Icons.BanknotesIcon className="w-5 h-5 text-green-500" /> Lender
            Eligibility
          </h4>
          {hasCustomerData ? (
            <div className="text-sm space-y-2 overflow-y-auto pr-2 custom-scrollbar flex-grow max-h-[300px]">
              {eligibilityDetails.map((detail) => (
                <div
                  key={detail.name}
                  className="flex justify-between items-start text-sm gap-4 border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0"
                >
                  <span className="font-medium text-slate-600 dark:text-gray-400 whitespace-nowrap">
                    {detail.name}
                  </span>
                  {detail.eligible ? (
                    <span className="font-semibold text-green-600 dark:text-green-400 text-right flex flex-col items-end">
                      <span className="flex items-center gap-1">
                        <Icons.CheckIcon className="w-3 h-3" /> Eligible
                      </span>
                      <span className="text-[10px] font-normal text-slate-400">
                        {detail.matchedTier?.name}
                      </span>
                    </span>
                  ) : (
                    <span className="text-red-500 text-right text-xs">
                      {detail.reasons && detail.reasons.length > 0
                        ? detail.reasons.join("; ")
                        : "Not eligible for current structure"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-8">
              <Icons.SparklesIcon className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">
                Enter customer credit score & income to see live lender
                eligibility.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
