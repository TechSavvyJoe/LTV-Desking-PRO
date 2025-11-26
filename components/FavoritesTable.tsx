
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import type { Vehicle, DealData, LenderProfile, CalculatedVehicle, SortConfig, FilterData, DealPdfData, Settings } from '../types';
import { calculateFinancials } from '../services/calculator';
import { checkBankEligibility } from '../services/lenderMatcher';
import { generateDealPdf } from '../services/pdfGenerator';
import { Table } from './common/Table';
import Button from './common/Button';
import { LtvCell, OtdLtvCell, GrossCell, PaymentCell, formatCurrency, formatNumber } from './common/TableCell';
import CopyToClipboard from './common/CopyToClipboard';
import * as Icons from './common/Icons';

const ChevronIcon = ({ className = '' }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 text-slate-400 ${className}`}>
        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </svg>
);


interface FavoritesTableProps {
  favorites: Vehicle[];
  dealData: DealData;
  setDealData: React.Dispatch<React.SetStateAction<DealData>>;
  lenderProfiles: LenderProfile[];
  customerFilters: FilterData;
  toggleFavorite: (vin: string) => void;
  sortConfig: SortConfig;
  setSortConfig: React.Dispatch<React.SetStateAction<SortConfig>>;
  onStructureDeal: (vehicle: CalculatedVehicle) => void;
  customerName: string;
  salespersonName: string;
  onInventoryUpdate: (vin: string, updatedData: Partial<Vehicle>) => void;
  settings: Settings;
}

const DetailItem = ({ label, value, valueToCopy }: { label: string; value: React.ReactNode; valueToCopy?: string | number | 'N/A' | 'Error' }) => (
  <div className="flex justify-between items-center text-sm">
    <span className="text-slate-500 dark:text-slate-400">{label}</span>
    {valueToCopy !== undefined ? (
        <CopyToClipboard valueToCopy={valueToCopy}>
            <span className="font-medium text-slate-900 dark:text-slate-100">{value}</span>
        </CopyToClipboard>
    ) : (
        <span className="font-medium text-slate-900 dark:text-slate-100">{value}</span>
    )}
  </div>
);

const StyledSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} className="w-28 p-1 text-sm text-right border border-slate-300 dark:border-slate-700 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-transparent text-slate-900 dark:text-slate-100" />
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
        <div className="flex justify-between items-center text-sm">
            <label className="text-slate-500 dark:text-slate-400">{label}</label>
            <input
                type={type}
                step={step}
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                onBlur={handleBlur}
                onClick={(e) => e.stopPropagation()}
                className="w-28 p-1 text-sm text-right border border-slate-300 dark:border-slate-700 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-transparent text-slate-900 dark:text-slate-100"
            />
        </div>
    );
};


const FavoritesTable: React.FC<FavoritesTableProps> = ({ favorites, dealData, setDealData, lenderProfiles, customerFilters, toggleFavorite, sortConfig, setSortConfig, onStructureDeal, customerName, salespersonName, onInventoryUpdate, settings }) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const isShareSupported = typeof navigator !== 'undefined' && !!navigator.share;
  
  const processedFavorites = useMemo(() => {
    const safeFavorites = Array.isArray(favorites) ? favorites : [];
    const safeProfiles = Array.isArray(lenderProfiles) ? lenderProfiles : [];

    return safeFavorites.map(fav => {
      const calculated = calculateFinancials(fav, dealData, settings);
      
      let bankMatches: string[] = [];
      if (customerFilters.creditScore || customerFilters.monthlyIncome) {
        bankMatches = safeProfiles
          .filter(bank => checkBankEligibility(calculated, { ...dealData, ...customerFilters }, bank).eligible)
          .map(bank => bank.name);
      }
      return { ...calculated, bankMatches: bankMatches.length > 0 ? bankMatches.join(', ') : 'None' };
    });
  }, [favorites, dealData, lenderProfiles, customerFilters, settings]);

  const sortedFavorites = useMemo(() => {
    if (!sortConfig.key) return processedFavorites;
    const sorted = [...processedFavorites];
    sorted.sort((a, b) => {
        const valA = a[sortConfig.key!];
        const valB = b[sortConfig.key!];

        const isAInvalid = valA === null || valA === 'Error' || valA === 'N/A';
        const isBInvalid = valB === null || valB === 'Error' || valB === 'N/A';
        
        if (isAInvalid && isBInvalid) return 0; // Treat invalid values as equal
        if (isAInvalid) return 1; // Always push invalid values to the end
        if (isBInvalid) return -1;

        if (typeof valA === 'number' && typeof valB === 'number') {
            return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        }
        if (typeof valA === 'string' && typeof valB === 'string') {
            return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
    });
    return sorted;
  }, [processedFavorites, sortConfig]);

  const handleSort = (key: keyof CalculatedVehicle) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const toggleRowExpansion = useCallback((vin: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(vin)) {
        newSet.delete(vin);
      } else {
        newSet.add(vin);
      }
      return newSet;
    });
  }, []);

  const preparePdfData = (vehicle: CalculatedVehicle): DealPdfData => {
      const safeProfiles = Array.isArray(lenderProfiles) ? lenderProfiles : [];
      const eligibilityDetails = safeProfiles.map(bank => ({
          name: bank.name,
          ...checkBankEligibility(vehicle, { ...dealData, ...customerFilters }, bank)
      }));
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
              try {
                  await navigator.share({
                      title: `Deal Sheet for ${vehicle.vehicle}`,
                      text: `Here are the numbers for the ${vehicle.vehicle}.`,
                      files: [file],
                  });
              } catch (error) {
                  console.error('Error sharing:', error);
              }
          } else {
              alert("Sharing of this file type is not supported on your device.");
          }
      } catch (error) {
          console.error('Error generating PDF:', error);
          alert("Failed to generate PDF for sharing. Please try again.");
      }
  };

  const renderExpandedRow = (item: CalculatedVehicle) => {
    const safeProfiles = Array.isArray(lenderProfiles) ? lenderProfiles : [];
    const eligibilityDetails = safeProfiles.map(bank => ({
      name: bank.name,
      ...checkBankEligibility(item, { ...dealData, ...customerFilters }, bank)
    }));

    const hasCustomerData = customerFilters.creditScore || customerFilters.monthlyIncome;

    return (
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4">
        <div>
          <div className="flex justify-between items-center mb-3">
             <h4 className="font-bold text-base text-slate-900 dark:text-slate-100">Financial Breakdown</h4>
             <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={(e) => handleDownloadPdf(e, item)}><Icons.PdfIcon /> PDF</Button>
                {isShareSupported && <Button size="sm" variant="ghost" onClick={(e) => handleSharePdf(e, item)}><Icons.ShareIcon /> Share</Button>}
             </div>
          </div>
           <div className="space-y-1">
             <EditableField label="Selling Price ($)" value={item.price} onUpdate={(newPrice) => onInventoryUpdate(item.vin, { price: newPrice })} />
             <DetailItem label="Doc Fee (Taxed)" value={formatCurrency(settings.docFee)} valueToCopy={settings.docFee} />
             <DetailItem label="CVR Fee (Taxed)" value={formatCurrency(settings.cvrFee)} valueToCopy={settings.cvrFee} />
             <DetailItem label="Sales Tax" value={formatCurrency(item.salesTax)} valueToCopy={item.salesTax} />
             <EditableField label="State/Title Fees ($)" value={dealData.stateFees} onUpdate={(newFees) => setDealData(prev => ({ ...prev, stateFees: newFees }))} />
             <hr className="my-2 border-slate-200 dark:border-slate-800"/>
             <div className="flex justify-between items-center font-bold text-base">
                <span className="text-slate-900 dark:text-slate-100">Total OTD Price</span>
                <CopyToClipboard valueToCopy={item.baseOutTheDoorPrice}>
                    <span className="text-slate-900 dark:text-slate-100">{formatCurrency(item.baseOutTheDoorPrice)}</span>
                </CopyToClipboard>
            </div>
             <hr className="my-2 border-slate-200 dark:border-slate-800"/>
            <DetailItem label="Amount to Finance" value={formatCurrency(item.amountToFinance)} valueToCopy={item.amountToFinance} />
            <DetailItem label="Front-End Gross" value={<GrossCell value={item.frontEndGross} />} />
             <hr className="my-2 border-slate-200 dark:border-slate-800"/>
            <DetailItem label="JD Power (Trade)" value={formatCurrency(item.jdPower)} valueToCopy={item.jdPower} />
            <DetailItem label="JD Power (Retail)" value={formatCurrency(item.jdPowerRetail)} valueToCopy={item.jdPowerRetail} />
          </div>
        </div>
        <div>
           <h4 className="font-bold text-base mb-3 text-slate-900 dark:text-slate-100">Global Deal Structure</h4>
           <div className="space-y-1">
                <EditableField label="Down Payment ($)" value={dealData.downPayment} onUpdate={(newValue) => setDealData(prev => ({ ...prev, downPayment: newValue }))} />
                <EditableField label="Trade-In Value ($)" value={dealData.tradeInValue} onUpdate={(newValue) => setDealData(prev => ({ ...prev, tradeInValue: newValue }))} />
                <EditableField label="Trade-In Payoff ($)" value={dealData.tradeInPayoff} onUpdate={(newValue) => setDealData(prev => ({ ...prev, tradeInPayoff: newValue }))} />
                <EditableField label="Backend Products ($)" value={dealData.backendProducts} onUpdate={(newValue) => setDealData(prev => ({ ...prev, backendProducts: newValue }))} />
                <EditableField label="Interest Rate (APR %)" value={dealData.interestRate} onUpdate={(newValue) => setDealData(prev => ({ ...prev, interestRate: newValue }))} type="number" step="0.1" />
                <div className="flex justify-between items-center text-sm">
                    <label className="text-slate-500 dark:text-slate-400">Loan Term (Months)</label>
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
        <div>
          <h4 className="font-bold text-base mb-3 text-slate-900 dark:text-slate-100">Lender Eligibility</h4>
          {hasCustomerData ? (
            <div className="text-sm space-y-1.5 max-h-48 overflow-y-auto pr-2">
              {eligibilityDetails.map(detail => (
                <div key={detail.name} className="flex justify-between items-start text-sm gap-4">
                  <span className="font-medium text-slate-600 dark:text-slate-300">{detail.name}</span>
                  {detail.eligible ? (
                     <span className="font-semibold text-green-500 text-right">
                        Eligible <span className="text-xs font-normal text-slate-500 dark:text-slate-400">({detail.matchedTier?.name})</span>
                    </span>
                  ) : (
                    <span className="text-red-500 text-right">{detail.reasons.join(', ')}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">Enter customer credit score and/or income to see lender eligibility.</p>
          )}
        </div>
      </div>
    );
  };

  const columns = [
    { header: '', accessor: 'expand' as const, className: 'w-12 text-center', render: (item: CalculatedVehicle) => {
        const isExpanded = expandedRows.has(item.vin);
        return <ChevronIcon className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />;
    }},
    { header: 'Action', accessor: 'action' as const, className: 'min-w-[220px]', render: (item: CalculatedVehicle) => (
      <div className="flex items-center gap-2">
        <Button 
          variant="primary" 
          size="sm" 
          onClick={(e) => { e.stopPropagation(); onStructureDeal(item); }}
          className="!py-1.5 !px-3"
        >
          <Icons.WrenchIcon />
          <span className="ml-1.5">Structure</span>
        </Button>
        <Button 
          variant="danger" 
          size="sm" 
          onClick={(e) => { e.stopPropagation(); toggleFavorite(item.vin); }} 
          className="!py-1.5 !px-3"
        >
          <Icons.TrashIcon />
          <span className="ml-1.5">Remove</span>
        </Button>
      </div>
    )},
    { header: 'Vehicle', accessor: 'vehicle' as const, className: 'font-medium text-x-text-primary' },
    { header: 'Stock #', accessor: 'stock' as const, className: 'text-x-text-secondary' },
    { header: 'Year', accessor: 'modelYear' as const, isNumeric: true, render: (item: CalculatedVehicle) => <CopyToClipboard valueToCopy={item.modelYear}>{item.modelYear}</CopyToClipboard> },
    { header: 'Miles', accessor: 'mileage' as const, isNumeric: true, render: (item: CalculatedVehicle) => <CopyToClipboard valueToCopy={item.mileage}>{formatNumber(item.mileage)}</CopyToClipboard> },
    { header: 'Sale Price', accessor: 'price' as const, isNumeric: true, className: 'text-right', render: (item: CalculatedVehicle) => <CopyToClipboard valueToCopy={item.price}>{formatCurrency(item.price)}</CopyToClipboard> },
    { header: 'Book Value', accessor: 'jdPower' as const, isNumeric: true, className: 'text-right', render: (item: CalculatedVehicle) => <CopyToClipboard valueToCopy={item.jdPower}>{formatCurrency(item.jdPower)}</CopyToClipboard> },
    { header: 'Front LTV', accessor: 'frontEndLtv' as const, isNumeric: true, className: 'text-right', render: (item: CalculatedVehicle) => <LtvCell value={item.frontEndLtv} /> },
    { header: 'Front Gross', accessor: 'frontEndGross' as const, isNumeric: true, className: 'text-right', render: (item: CalculatedVehicle) => <GrossCell value={item.frontEndGross} /> },
    { header: 'Amt to Fin', accessor: 'amountToFinance' as const, isNumeric: true, className: 'text-right font-semibold text-x-blue', render: (item: CalculatedVehicle) => <CopyToClipboard valueToCopy={item.amountToFinance}>{formatCurrency(item.amountToFinance)}</CopyToClipboard> },
    { header: 'OTD LTV', accessor: 'otdLtv' as const, isNumeric: true, className: 'text-right', render: (item: CalculatedVehicle) => <OtdLtvCell value={item.otdLtv} /> },
    { header: 'Payment', accessor: 'monthlyPayment' as const, isNumeric: true, className: 'text-right', render: (item: CalculatedVehicle) => <PaymentCell value={item.monthlyPayment} /> },
    { header: 'Bank Matches', accessor: 'bankMatches' as const, className: 'text-x-blue' },
    { header: 'VIN', accessor: 'vin' as const, className: 'max-w-[220px]', render: (item: CalculatedVehicle) => <CopyToClipboard valueToCopy={item.vin}><span className="font-mono text-xs break-all">{item.vin}</span></CopyToClipboard> },
  ];

  return (
    <div className="my-8">
      <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-slate-800">My Favorites</h2>
      <Table 
        columns={columns} 
        data={sortedFavorites} 
        sortConfig={sortConfig} 
        onSort={handleSort} 
        emptyMessage="No favorites added yet."
        rowKey="vin"
        expandedRows={expandedRows}
        onRowClick={toggleRowExpansion}
        renderExpandedRow={renderExpandedRow}
      />
    </div>
  );
};

export default FavoritesTable;
