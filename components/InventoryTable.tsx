
import React, { useState, useEffect, useMemo } from 'react';
import type { CalculatedVehicle, SortConfig, Vehicle, LenderProfile, DealData, FilterData, DealPdfData, Settings } from '../types';
import { Table } from './common/Table';
import { LtvCell, OtdLtvCell, GrossCell, PaymentCell, formatCurrency, formatNumber } from './common/TableCell';
import { checkBankEligibility } from '../services/lenderMatcher';
import { generateDealPdf } from '../services/pdfGenerator';
import Button from './common/Button';
import CopyToClipboard from './common/CopyToClipboard';
import * as Icons from './common/Icons';

const DetailItem = ({ label, value, valueToCopy }: { label: string; value: React.ReactNode; valueToCopy?: string | number | 'N/A' | 'Error' }) => (
  <div className="flex justify-between items-center text-sm py-0.5">
    <span className="text-slate-500 dark:text-gray-400">{label}</span>
    {valueToCopy !== undefined ? (
        <CopyToClipboard valueToCopy={valueToCopy}>
            <span className="font-medium text-slate-900 dark:text-gray-100 hover:text-blue-500 transition-colors">{value}</span>
        </CopyToClipboard>
    ) : (
        <span className="font-medium text-slate-900 dark:text-gray-100">{value}</span>
    )}
  </div>
);

const StyledSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} className="w-28 p-1 text-sm text-right border border-slate-300 dark:border-gray-700 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-transparent text-slate-900 dark:text-gray-100 cursor-pointer" />
);


const EditableField = ({ label, value, onUpdate, type = 'number', step = '1' }: { label: string; value: number | 'N/A'; onUpdate: (newValue: number) => void; type?: string; step?: string; }) => {
    const [currentValue, setCurrentValue] = useState(value === 'N/A' ? '' : value.toString());

    useEffect(() => {
        setCurrentValue(value === 'N/A' ? '' : value.toString());
    }, [value]);

    const handleBlur = () => {
        const newValue = parseFloat(currentValue);
        if (!isNaN(newValue) && newValue >= 0) {
            onUpdate(newValue);
        } else {
            setCurrentValue(value === 'N/A' ? '' : value.toString()); // Revert if invalid
        }
    };
    
    return (
        <div className="flex justify-between items-center text-sm py-0.5">
            <label className="text-slate-500 dark:text-gray-400">{label}</label>
            <input
                type={type}
                step={step}
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                onBlur={handleBlur}
                onClick={(e) => e.stopPropagation()} // Stop click from collapsing row
                className="w-28 p-1 text-sm text-right border border-slate-300 dark:border-gray-700 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-transparent text-slate-900 dark:text-gray-100"
            />
        </div>
    );
};

interface InventoryTableProps {
  vehicles: CalculatedVehicle[];
  favorites: Vehicle[];
  toggleFavorite: (vin: string) => void;
  sortConfig: SortConfig;
  setSortConfig: React.Dispatch<React.SetStateAction<SortConfig>>;
  expandedRows: Set<string>;
  onRowClick: (vin: string) => void;
  onStructureDeal: (vehicle: CalculatedVehicle) => void;
  lenderProfiles: LenderProfile[];
  dealData: DealData;
  setDealData: React.Dispatch<React.SetStateAction<DealData>>;
  onInventoryUpdate: (vin: string, updatedData: Partial<Vehicle>) => void;
  customerFilters: FilterData;
  customerName: string;
  salespersonName: string;
  settings: Settings;
}

const InventoryTable: React.FC<InventoryTableProps> = ({ 
    vehicles, favorites, toggleFavorite, sortConfig, setSortConfig, 
    expandedRows, onRowClick, onStructureDeal, lenderProfiles, 
    dealData, setDealData, onInventoryUpdate, customerFilters, customerName, salespersonName, settings
}) => {
  // Defensive: Ensure favorites is an array and items are valid objects
  const favoriteVins = useMemo(() => {
      if (!Array.isArray(favorites)) return new Set<string>();
      return new Set(favorites.filter(f => f && typeof f === 'object' && f.vin).map(f => f.vin));
  }, [favorites]);

  const isShareSupported = typeof navigator !== 'undefined' && !!navigator.share;

  const handleSort = (key: keyof CalculatedVehicle) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };
  
  // Memoize columns to prevent re-renders
  const columns = useMemo(() => [
    { header: '', accessor: 'expand' as const, className: 'w-10 text-center', render: (item: CalculatedVehicle) => {
        if (!item || !item.vin) return null;
        const isExpanded = expandedRows?.has(item.vin) || false;
        return (
            <div className="flex justify-center items-center h-full w-full cursor-pointer">
                <Icons.ChevronDownIcon className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : '-rotate-90'}`} />
            </div>
        );
    }},
    { header: 'Actions', accessor: 'action' as const, className: 'min-w-[200px]', render: (item: CalculatedVehicle) => {
        if (!item) return null;
        return (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={(e) => { e.stopPropagation(); toggleFavorite(item.vin); }}
              className={`p-2 rounded-full transition-colors group focus:outline-none hover:bg-slate-100 dark:hover:bg-white/10`}
              aria-label="Toggle Favorite"
            >
              <Icons.StarIcon className={`transition-colors w-5 h-5 ${favoriteVins.has(item.vin) ? 'text-yellow-500 fill-yellow-500' : 'text-slate-400 group-hover:text-yellow-500'}`} />
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onStructureDeal(item); }}
              className="!py-1.5 !px-3 !text-xs shadow-sm hover:shadow-md transition-all"
            >
              <Icons.WrenchIcon className="w-4 h-4 mr-1.5" />
              Structure
            </Button>
          </div>
        );
    }},
    { header: 'Vehicle', accessor: 'vehicle' as const, className: 'font-medium text-slate-900 dark:text-gray-100 min-w-[180px]' },
    { header: 'Stock #', accessor: 'stock' as const, className: 'text-slate-500 dark:text-gray-400' },
    { header: 'Year', accessor: 'modelYear' as const, isNumeric: true, render: (item: CalculatedVehicle) => <CopyToClipboard valueToCopy={item.modelYear}>{item.modelYear}</CopyToClipboard> },
    { header: 'Miles', accessor: 'mileage' as const, isNumeric: true, render: (item: CalculatedVehicle) => <CopyToClipboard valueToCopy={item.mileage}>{formatNumber(item.mileage)}</CopyToClipboard> },
    { header: 'Price', accessor: 'price' as const, isNumeric: true, className: 'text-right font-medium', render: (item: CalculatedVehicle) => <CopyToClipboard valueToCopy={item.price}>{formatCurrency(item.price)}</CopyToClipboard> },
    { header: 'Book (Trade)', accessor: 'jdPower' as const, isNumeric: true, className: 'text-right', render: (item: CalculatedVehicle) => <CopyToClipboard valueToCopy={item.jdPower}>{formatCurrency(item.jdPower)}</CopyToClipboard> },
    { header: 'Front LTV', accessor: 'frontEndLtv' as const, isNumeric: true, className: 'text-right', render: (item: CalculatedVehicle) => <LtvCell value={item.frontEndLtv} /> },
    { header: 'Front Gross', accessor: 'frontEndGross' as const, isNumeric: true, className: 'text-right', render: (item: CalculatedVehicle) => <GrossCell value={item.frontEndGross} /> },
    { header: 'Amt to Fin', accessor: 'amountToFinance' as const, isNumeric: true, className: 'text-right font-semibold text-blue-600 dark:text-blue-400', render: (item: CalculatedVehicle) => <CopyToClipboard valueToCopy={item.amountToFinance}>{formatCurrency(item.amountToFinance)}</CopyToClipboard> },
    { header: 'OTD LTV', accessor: 'otdLtv' as const, isNumeric: true, className: 'text-right', render: (item: CalculatedVehicle) => <OtdLtvCell value={item.otdLtv} /> },
    { header: 'Payment', accessor: 'monthlyPayment' as const, isNumeric: true, className: 'text-right', render: (item: CalculatedVehicle) => <PaymentCell value={item.monthlyPayment} /> },
    { header: 'VIN', accessor: 'vin' as const, render: (item: CalculatedVehicle) => <CopyToClipboard valueToCopy={item.vin}><span className="font-mono text-xs">{item.vin}</span></CopyToClipboard> },
  ], [expandedRows, favoriteVins, toggleFavorite, onStructureDeal]); // Dependencies

  const preparePdfData = (vehicle: CalculatedVehicle): DealPdfData => {
      const safeProfiles = (Array.isArray(lenderProfiles) ? lenderProfiles : []).filter(p => p && typeof p === 'object');
      
      const eligibilityDetails = safeProfiles.map(bank => {
          try {
              return {
                  name: bank.name,
                  ...checkBankEligibility(vehicle, { ...dealData, ...customerFilters }, bank)
              };
          } catch (e) {
              return { name: bank.name || 'Unknown', eligible: false, reasons: ['Error checking eligibility'], matchedTier: null };
          }
      });

      return {
          vehicle,
          dealData,
          customerFilters: { creditScore: customerFilters.creditScore, monthlyIncome: customerFilters.monthlyIncome },
          customerName,
          salespersonName,
          lenderEligibility: eligibilityDetails,
      };
  };

  const handleDownloadPdf = async (e: React.MouseEvent, vehicle: CalculatedVehicle) => {
      e.stopPropagation();
      try {
          const pdfData = preparePdfData(vehicle);
          const blob = await generateDealPdf(pdfData, settings);
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 100);
      } catch (error) {
          console.error("Error generating PDF:", error);
          alert("Failed to generate PDF. Please check deal data.");
      }
  };

  const handleSharePdf = async (e: React.MouseEvent, vehicle: CalculatedVehicle) => {
      e.stopPropagation();
      try {
          const pdfData = preparePdfData(vehicle);
          const blob = await generateDealPdf(pdfData, settings);
          const file = new File([blob], `Deal_Sheet_${vehicle.vehicle}.pdf`, { type: 'application/pdf' });
          
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({
                  title: `Deal Sheet for ${vehicle.vehicle}`,
                  text: `Here are the numbers for the ${vehicle.vehicle}.`,
                  files: [file],
              });
          } else {
              alert("Sharing is not supported on this device.");
          }
      } catch (error) {
          console.error('Error sharing:', error);
      }
  };


  const renderExpandedRow = (item: CalculatedVehicle) => {
    if (!item) return null;
    
    try {
        const safeProfiles = (Array.isArray(lenderProfiles) ? lenderProfiles : []).filter(p => p && typeof p === 'object');
        
        let eligibilityDetails: any[] = [];
        
        eligibilityDetails = safeProfiles.map(bank => ({
            name: bank.name,
            ...checkBankEligibility(item, { ...dealData, ...customerFilters }, bank)
        }));

        const hasCustomerData = customerFilters.creditScore || customerFilters.monthlyIncome;

        return (
          <div className="p-6 bg-slate-900/70 border-t border-slate-800 shadow-inner cursor-default rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Financial Breakdown */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-md lg:col-span-4">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-base text-slate-900 dark:text-gray-100 flex items-center gap-2">
                      <Icons.ChartIcon className="w-5 h-5 text-blue-500"/> Financials
                  </h4>
                   <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={(e) => handleDownloadPdf(e, item)} className="!text-xs !px-2.5 !py-1.5"><Icons.PdfIcon className="w-4 h-4 mr-1" /> PDF</Button>
                      {isShareSupported && <Button size="sm" variant="ghost" onClick={(e) => handleSharePdf(e, item)} className="!text-xs !px-2.5 !py-1.5"><Icons.ShareIcon className="w-4 h-4 mr-1" /> Share</Button>}
                   </div>
                </div>
                <div className="space-y-2">
                   <EditableField label="Selling Price ($)" value={item.price} onUpdate={(newPrice) => onInventoryUpdate(item.vin, { price: newPrice })} />
                   <DetailItem label="Doc Fee (Taxed)" value={formatCurrency(settings.docFee)} valueToCopy={settings.docFee} />
                   <DetailItem label="CVR Fee (Taxed)" value={formatCurrency(settings.cvrFee)} valueToCopy={settings.cvrFee} />
                   <DetailItem label="Sales Tax" value={formatCurrency(item.salesTax)} valueToCopy={item.salesTax} />
                   <EditableField label="State/Title Fees ($)" value={dealData.stateFees} onUpdate={(newFees) => setDealData(prev => ({ ...prev, stateFees: newFees }))} />
                   <hr className="my-2 border-slate-200 dark:border-gray-700"/>
                   <div className="flex justify-between items-center font-bold text-base">
                      <span className="text-slate-900 dark:text-gray-100">Total OTD Price</span>
                      <CopyToClipboard valueToCopy={item.baseOutTheDoorPrice}>
                        <span className="text-blue-600 dark:text-blue-400">{formatCurrency(item.baseOutTheDoorPrice)}</span>
                      </CopyToClipboard>
                  </div>
                   <hr className="my-2 border-slate-200 dark:border-gray-700"/>
                  <DetailItem label="Amount to Finance" value={formatCurrency(item.amountToFinance)} valueToCopy={item.amountToFinance} />
                  <DetailItem label="Front-End Gross" value={<GrossCell value={item.frontEndGross} />} />
                   <hr className="my-2 border-slate-200 dark:border-gray-700"/>
                  <DetailItem label="JD Power (Trade)" value={formatCurrency(item.jdPower)} valueToCopy={item.jdPower} />
                  <DetailItem label="JD Power (Retail)" value={formatCurrency(item.jdPowerRetail)} valueToCopy={item.jdPowerRetail} />
                </div>
              </div>

              {/* Global Deal Structure */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-md lg:col-span-4">
                <h4 className="font-bold text-base mb-4 text-slate-900 dark:text-gray-100 flex items-center gap-2">
                    <Icons.CogIcon className="w-5 h-5 text-slate-500"/> Deal Structure
                </h4>
                 <div className="space-y-2">
                      <EditableField label="Down Payment ($)" value={dealData.downPayment} onUpdate={(newValue) => setDealData(prev => ({ ...prev, downPayment: newValue }))} />
                      <EditableField label="Trade-In Value ($)" value={dealData.tradeInValue} onUpdate={(newValue) => setDealData(prev => ({ ...prev, tradeInValue: newValue }))} />
                      <EditableField label="Trade-In Payoff ($)" value={dealData.tradeInPayoff} onUpdate={(newValue) => setDealData(prev => ({ ...prev, tradeInPayoff: newValue }))} />
                      <EditableField label="Backend Products ($)" value={dealData.backendProducts} onUpdate={(newValue) => setDealData(prev => ({ ...prev, backendProducts: newValue }))} />
                      <EditableField label="Interest Rate (APR %)" value={dealData.interestRate} onUpdate={(newValue) => setDealData(prev => ({ ...prev, interestRate: newValue }))} type="number" step="0.1" />
                      <div className="flex justify-between items-center text-sm py-0.5">
                          <label className="text-slate-500 dark:text-gray-400">Loan Term (Months)</label>
                          <StyledSelect
                              value={dealData.loanTerm}
                              onChange={(e) => { e.stopPropagation(); setDealData(prev => ({ ...prev, loanTerm: Number(e.target.value) })); }}
                              onClick={(e) => e.stopPropagation()}
                          >
                              <option value="36">36</option><option value="48">48</option><option value="60">60</option><option value="72">72</option><option value="84">84</option>
                          </StyledSelect>
                      </div>
                  </div>
              </div>

              {/* Lender Eligibility */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-md lg:col-span-4">
                <h4 className="font-bold text-base mb-4 text-slate-900 dark:text-gray-100 flex items-center gap-2">
                    <Icons.BanknotesIcon className="w-5 h-5 text-green-500"/> Lender Eligibility
                </h4>
                {hasCustomerData ? (
                  <div className="text-sm space-y-2 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                    {eligibilityDetails.map(detail => (
                      <div key={detail.name} className="flex justify-between items-start text-sm gap-4 border-b border-slate-100 dark:border-gray-800 pb-2 last:border-0">
                        <span className="font-medium text-slate-600 dark:text-gray-400 whitespace-nowrap">{detail.name}</span>
                        {detail.eligible ? (
                           <span className="font-semibold text-green-600 dark:text-green-400 text-right flex flex-col items-end">
                              <span className="flex items-center gap-1"><Icons.CheckIcon className="w-3 h-3"/> Eligible</span>
                              <span className="text-[10px] font-normal text-slate-400">{detail.matchedTier?.name}</span>
                          </span>
                        ) : (
                          <span className="text-red-500 text-right text-xs">{detail.reasons[0]}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 text-center text-slate-400">
                      <Icons.SparklesIcon className="w-8 h-8 mb-2 opacity-50"/>
                      <p className="text-sm">Enter customer credit score & income to see live lender eligibility.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
    } catch (e) {
        console.error("Render crash prevented:", e);
        return <div className="p-4 text-center text-red-500">Unable to load vehicle details. Please check data.</div>;
    }
  };

  const safeVehicles = Array.isArray(vehicles) ? vehicles.filter(v => v && typeof v === 'object') : [];

  return (
    <div className="my-8">
       <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-200 dark:border-gray-700 flex items-center gap-2">
           <Icons.CarIcon className="w-6 h-6 text-blue-500" /> Inventory
       </h2>
      <Table 
        columns={columns} 
        data={safeVehicles} 
        sortConfig={sortConfig} 
        onSort={handleSort}
        emptyMessage="No vehicles match filters or no data loaded."
        rowKey="vin"
        expandedRows={expandedRows}
        onRowClick={onRowClick}
        renderExpandedRow={renderExpandedRow}
      />
    </div>
  );
};

export default InventoryTable;
