
import React, { useMemo } from 'react';
import type { CalculatedVehicle, DealData, ValidationErrors, Settings } from '../types';
import { calculateFinancials } from '../services/calculator';
import { validateInput } from '../services/validator';
import { formatCurrency, LtvCell, OtdLtvCell, formatPercentage } from './common/TableCell';
import Button from './common/Button';
import CopyToClipboard from './common/CopyToClipboard';
import { ExclamationTriangleIcon } from './common/Icons';

const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
);

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

interface InputGroupProps {
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
  error?: string;
}

const InputGroup: React.FC<InputGroupProps> = ({ label, children, htmlFor, error }) => (
  <div className="flex flex-col">
    <label htmlFor={htmlFor} className="mb-1.5 text-sm font-semibold text-slate-200">{label}</label>
    {children}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

const StyledInput = (props: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) => {
    const errorClasses = props.error ? 'border-red-500/60 focus:border-red-400 focus:ring-red-300/50' : 'border-slate-700 focus:border-sky-400 focus:ring-sky-400/40';
    return (
        <input {...props} className={`w-full px-3 py-2.5 text-base bg-slate-900 border ${errorClasses} rounded-xl placeholder-slate-500 text-slate-100 focus:outline-none focus:ring-2 transition-all duration-200 ease-in-out shadow-sm`} />
    );
};

const StyledSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className="w-full px-3 py-2.5 text-base bg-slate-900 border border-slate-700 rounded-xl placeholder-slate-400 text-slate-100 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40 transition-all duration-200 ease-in-out shadow-sm" />
);

const StyledTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} rows={4} className={`w-full px-3 py-2.5 text-base bg-slate-900 border border-slate-700 rounded-xl placeholder-slate-500 text-slate-100 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40 transition-all duration-200 ease-in-out shadow-sm`} />
);

const SummaryRow = ({ label, value, valueToCopy, isBold = false }: { label: string; value: React.ReactNode; valueToCopy?: string | number | 'N/A' | 'Error'; isBold?: boolean; }) => (
    <div className="flex justify-between items-center py-1.5 text-sm">
        <span className={`${isBold ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>{label}</span>
        {valueToCopy !== undefined ? (
            <CopyToClipboard valueToCopy={valueToCopy}>
                <span className={`font-medium ${isBold ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>{value}</span>
            </CopyToClipboard>
        ) : (
            <span className={`font-medium ${isBold ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>{value}</span>
        )}
    </div>
);


const DealStructuringModal: React.FC<DealStructuringModalProps> = ({ vehicle, dealData, setDealData, onClose, errors, setErrors, onSave, onSaveAndClear, settings }) => {
    
    // Critical guard: Ensure vehicle and dealData exist before calculating.
    const localCalculated = useMemo(() => {
        if (!vehicle || !dealData) return null;
        return calculateFinancials(vehicle, dealData, settings);
    }, [vehicle, dealData, settings]);

    if (!vehicle || !dealData || !localCalculated) return null;

    const handleDealChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { id, value } = e.target;
        
        if (id === 'notes') {
            setDealData(prev => ({ ...prev, notes: value }));
            return;
        }

        const numValue = Number(value) || 0;
        
        const errorMessage = validateInput(id, numValue);
        setErrors(prev => errorMessage ? { ...prev, [id]: errorMessage } : (({ [id]: _, ...rest }) => rest)(prev));

        setDealData(prev => ({ ...prev, [id]: numValue }));
    };

    const netTradeIn = dealData.tradeInValue - dealData.tradeInPayoff;
    const totalDown = dealData.downPayment + netTradeIn;

    const warnings: { type: 'warning' | 'critical'; message: string }[] = [];

    if (netTradeIn < 0) {
        warnings.push({
            type: 'critical',
            message: `Negative Equity: Customer is upside-down by ${formatCurrency(Math.abs(netTradeIn))}. Consider adding cash down.`
        });
    }
    if (typeof localCalculated.otdLtv === 'number' && localCalculated.otdLtv > 135) {
        warnings.push({
            type: 'warning',
            message: `High OTD LTV: At ${formatPercentage(localCalculated.otdLtv)}, this deal may be difficult to get funded without a large down payment.`
        });
    }
    if (typeof localCalculated.frontEndGross === 'number' && localCalculated.frontEndGross < 500) {
        warnings.push({
            type: 'warning',
            message: `Low Front-End Gross: Profit is only ${formatCurrency(localCalculated.frontEndGross)}. Consider adding backend products.`
        });
    }


    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col text-slate-100" onClick={e => e.stopPropagation()}>
                <div className="p-4 sticky top-0 bg-slate-900/80 backdrop-blur-md z-10 border-b border-slate-800">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-bold text-white">Structure Deal</h2>
                            <p className="text-slate-300">{vehicle.vehicle}</p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full text-slate-300 hover:bg-slate-800"><CloseIcon /></button>
                    </div>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto bg-slate-950">
                    {/* Left Side: Inputs */}
                    <div className="space-y-4">
                        <div className="space-y-4">
                            <InputGroup label="Down Payment ($)" htmlFor="downPayment" error={errors.downPayment}>
                                <StyledInput type="number" id="downPayment" value={dealData.downPayment || ''} onChange={handleDealChange} min="0" step="100" error={!!errors.downPayment} />
                            </InputGroup>
                            <InputGroup label="Trade-In Value ($)" htmlFor="tradeInValue" error={errors.tradeInValue}>
                                <StyledInput type="number" id="tradeInValue" value={dealData.tradeInValue || ''} onChange={handleDealChange} min="0" step="100" error={!!errors.tradeInValue} />
                            </InputGroup>
                            <InputGroup label="Trade-In Payoff ($)" htmlFor="tradeInPayoff" error={errors.tradeInPayoff}>
                                <StyledInput type="number" id="tradeInPayoff" value={dealData.tradeInPayoff || ''} onChange={handleDealChange} min="0" step="100" error={!!errors.tradeInPayoff} />
                            </InputGroup>
                             <InputGroup label="State/Title Fees ($)" htmlFor="stateFees" error={errors.stateFees}>
                                <StyledInput type="number" id="stateFees" value={dealData.stateFees || ''} onChange={handleDealChange} min="0" step="1" error={!!errors.stateFees} />
                            </InputGroup>
                            <InputGroup label="Backend Products ($)" htmlFor="backendProducts" error={errors.backendProducts}>
                                <StyledInput type="number" id="backendProducts" value={dealData.backendProducts || ''} onChange={handleDealChange} min="0" step="50" error={!!errors.backendProducts} />
                            </InputGroup>
                            <InputGroup label="Loan Term (Months)" htmlFor="loanTerm">
                                <StyledSelect id="loanTerm" value={dealData.loanTerm} onChange={handleDealChange}>
                                    <option value="36">36</option><option value="48">48</option><option value="60">60</option><option value="72">72</option><option value="84">84</option>
                                </StyledSelect>
                            </InputGroup>
                            <InputGroup label="Interest Rate (APR %)" htmlFor="interestRate" error={errors.interestRate}>
                                <StyledInput type="number" id="interestRate" value={dealData.interestRate || ''} onChange={handleDealChange} min="0" max="50" step="0.1" error={!!errors.interestRate}/>
                            </InputGroup>
                            <InputGroup label="Deal Notes" htmlFor="notes">
                                <StyledTextarea id="notes" value={dealData.notes || ''} onChange={handleDealChange} placeholder="Add specific notes for this deal structure..."/>
                            </InputGroup>
                        </div>
                    </div>

                    {/* Right Side: Summary */}
                    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg sticky top-0">
                        <h3 className="text-lg font-semibold text-white mb-4 border-b border-slate-800 pb-3">Deal Summary</h3>
                        <div className="space-y-2">
                             <SummaryRow label="Vehicle Sale Price" value={formatCurrency(vehicle.price)} valueToCopy={vehicle.price} />
                             <SummaryRow label="Base OTD Price" value={formatCurrency(localCalculated.baseOutTheDoorPrice)} valueToCopy={localCalculated.baseOutTheDoorPrice} />
                             <hr className="my-2 border-slate-800"/>
                             <SummaryRow label="Cash Down Payment" value={formatCurrency(dealData.downPayment)} valueToCopy={dealData.downPayment} />
                             <SummaryRow label="Net Trade-In Equity" value={formatCurrency(netTradeIn)} valueToCopy={netTradeIn} />
                             <SummaryRow label="Total Down" value={formatCurrency(totalDown)} isBold={true} valueToCopy={totalDown} />
                             <hr className="my-2 border-slate-800"/>
                             <SummaryRow label="Backend Products" value={formatCurrency(dealData.backendProducts)} valueToCopy={dealData.backendProducts} />
                             <SummaryRow label="Amount to Finance" value={formatCurrency(localCalculated.amountToFinance)} isBold={true} valueToCopy={localCalculated.amountToFinance} />
                             <hr className="my-2 border-slate-800"/>

                             <div className="flex justify-between items-center py-3 bg-slate-800 px-4 rounded-lg">
                                <span className="font-bold text-lg text-sky-300">Monthly Payment</span>
                                <CopyToClipboard valueToCopy={localCalculated.monthlyPayment}>
                                    <span className="font-bold text-lg text-sky-200">{formatCurrency(localCalculated.monthlyPayment)}</span>
                                </CopyToClipboard>
                             </div>
                             <div className="flex justify-between items-center py-2">
                                <span className="font-semibold text-slate-300">Front-End LTV</span>
                                <LtvCell value={localCalculated.frontEndLtv} />
                             </div>
                             <div className="flex justify-between items-center py-2">
                                <span className="font-semibold text-slate-300">OTD LTV</span>
                                <OtdLtvCell value={localCalculated.otdLtv} />
                             </div>
                             
                             {warnings.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    {warnings.map((warning, index) => (
                                        <div key={index} className={`flex items-start p-3 rounded-md text-sm ${
                                            warning.type === 'critical' 
                                            ? 'bg-red-900/30 text-red-300' 
                                            : 'bg-yellow-900/30 text-yellow-300'
                                        }`}>
                                            <ExclamationTriangleIcon className={`w-5 h-5 mr-2 flex-shrink-0 ${
                                                warning.type === 'critical' ? 'text-red-400' : 'text-yellow-400'
                                            }`} />
                                            <span>{warning.message}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900 sticky bottom-0">
                    <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
                    <Button type="button" variant="secondary" onClick={onSave}>Save Changes</Button>
                    <Button type="button" onClick={onSaveAndClear}>Save & Start New</Button>
                </div>
            </div>
        </div>
    );
};

export default DealStructuringModal;
