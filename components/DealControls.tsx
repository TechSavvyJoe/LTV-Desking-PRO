import React from 'react';
import type { FilterData, DealData, ValidationErrors } from '../types';
import { validateInput } from '../services/validator';

interface InputGroupProps {
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
  error?: string;
  labelClassName?: string;
}

const InputGroup: React.FC<InputGroupProps> = ({ label, children, htmlFor, className, error, labelClassName }) => (
  <div className={`flex flex-col ${className}`}>
    <label htmlFor={htmlFor} className={`mb-1.5 text-sm font-medium ${labelClassName || 'text-x-text-primary'}`}>{label}</label>
    {children}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

const StyledInput = (props: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) => {
    const errorClasses = props.error ? 'border-red-500/50 focus:border-red-500' : 'border-x-text-secondary/40 focus:border-x-blue';
    return (
        <input {...props} className={`w-full px-3 py-2 text-base bg-transparent border ${errorClasses} rounded-lg placeholder-x-text-secondary focus:outline-none focus:ring-0 transition-colors duration-200 ease-in-out`} />
    );
};

const StyledSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className="w-full px-3 py-2 text-base bg-x-black border border-x-text-secondary/40 rounded-lg placeholder-x-text-secondary focus:outline-none focus:border-x-blue focus:ring-0 transition-colors duration-200 ease-in-out" />
);

const SpinnerIcon = () => (
    <svg className="animate-spin h-5 w-5 text-x-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);


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
  filters, setFilters, dealData, setDealData, errors, setErrors,
  customerName, setCustomerName, salespersonName, setSalespersonName,
  onVinLookup, vinLookupResult, isVinLoading
}) => {

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type } = e.target;
        const isNumber = type === 'number';
        let processedValue: string | number | null = isNumber ? (value ? Number(value) : null) : value;

        if (id === 'vin') {
            processedValue = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        }

        const errorMessage = isNumber ? validateInput(id, processedValue as number | null) : null;
        setErrors(prev => errorMessage ? { ...prev, [id]: errorMessage } : (({ [id]: _, ...rest }) => rest)(prev));

        setFilters(prev => ({ ...prev, [id]: processedValue }));
    };
    
    const handleDealChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { id, value } = e.target;
        const numValue = Number(value) || 0;
        
        const errorMessage = validateInput(id, numValue);
        setErrors(prev => errorMessage ? { ...prev, [id]: errorMessage } : (({ [id]: _, ...rest }) => rest)(prev));

        setDealData(prev => ({ ...prev, [id]: numValue }));
    };
    
    const vinResultColor = vinLookupResult?.toLowerCase().startsWith('error')
    ? 'text-red-500'
    : 'text-green-500';

  return (
    <div className="border-b border-x-border space-y-4 py-4">
      <div className="border-2 border-x-border rounded-lg p-4 space-y-2">
        <h3 className="font-bold text-lg mb-2">Customer & Deal Info</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <InputGroup label="Customer Name" htmlFor="customerName" className="lg:col-span-1" labelClassName="text-white">
                <StyledInput type="text" id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g., John Doe" />
            </InputGroup>
             <InputGroup label="Salesperson Name" htmlFor="salespersonName" className="lg:col-span-1" labelClassName="text-white">
                <StyledInput type="text" id="salespersonName" value={salespersonName} onChange={(e) => setSalespersonName(e.target.value)} placeholder="e.g., Jane Smith" />
            </InputGroup>
            <InputGroup label="Credit Score" htmlFor="creditScore" error={errors.creditScore}>
                <StyledInput type="number" id="creditScore" value={filters.creditScore ?? ''} onChange={handleFilterChange} placeholder="e.g., 720" min="300" max="850" error={!!errors.creditScore}/>
            </InputGroup>
            <InputGroup label="Monthly Income ($)" htmlFor="monthlyIncome" error={errors.monthlyIncome}>
                <StyledInput type="number" id="monthlyIncome" value={filters.monthlyIncome ?? ''} onChange={handleFilterChange} placeholder="e.g., 5000" min="0" error={!!errors.monthlyIncome} />
            </InputGroup>
            <div className="lg:col-span-2 xl:col-span-1">
              <InputGroup label="VIN Lookup" htmlFor="vin">
                  <div className="relative">
                      <StyledInput 
                          type="text" 
                          id="vin"
                          value={filters.vin} 
                          onChange={handleFilterChange}
                          onBlur={onVinLookup}
                          placeholder="Enter 17-digit VIN"
                          maxLength={17}
                      />
                      {isVinLoading && (
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                          <SpinnerIcon />
                        </div>
                      )}
                  </div>
                  {vinLookupResult && <p className={`mt-1 text-xs ${vinResultColor}`}>{vinLookupResult}</p>}
              </InputGroup>
            </div>
            <InputGroup label="Filter Vehicle" htmlFor="vehicle" className="lg:col-span-2 xl:col-span-2">
                <StyledInput type="text" id="vehicle" value={filters.vehicle} onChange={handleFilterChange} placeholder="e.g., Ford Escape" />
            </InputGroup>
            <InputGroup label="Max Price ($)" htmlFor="maxPrice" error={errors.maxPrice}>
                <StyledInput type="number" id="maxPrice" value={filters.maxPrice ?? ''} onChange={handleFilterChange} placeholder="e.g., 25000" min="0" error={!!errors.maxPrice}/>
            </InputGroup>
            <InputGroup label="Max Payment ($)" htmlFor="maxPayment" error={errors.maxPayment}>
                <StyledInput type="number" id="maxPayment" value={filters.maxPayment ?? ''} onChange={handleFilterChange} placeholder="e.g., 450" min="0" error={!!errors.maxPayment} />
            </InputGroup>
        </div>
      </div>
      
      <div className="border-2 border-x-border rounded-lg p-4 space-y-2">
        <h3 className="font-bold text-lg mb-2">Global Deal Structure</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
            <InputGroup label="Down Pmt ($)" htmlFor="downPayment" error={errors.downPayment}>
                <StyledInput type="number" id="downPayment" value={dealData.downPayment || ''} onChange={handleDealChange} min="0" step="100" error={!!errors.downPayment} />
            </InputGroup>
            <InputGroup label="Trade Value ($)" htmlFor="tradeInValue" error={errors.tradeInValue}>
                <StyledInput type="number" id="tradeInValue" value={dealData.tradeInValue || ''} onChange={handleDealChange} min="0" step="100" error={!!errors.tradeInValue} />
            </InputGroup>
            <InputGroup label="Trade Payoff ($)" htmlFor="tradeInPayoff" error={errors.tradeInPayoff}>
                <StyledInput type="number" id="tradeInPayoff" value={dealData.tradeInPayoff || ''} onChange={handleDealChange} min="0" step="100" error={!!errors.tradeInPayoff} />
            </InputGroup>
            <InputGroup label="Backend ($)" htmlFor="backendProducts" error={errors.backendProducts}>
                <StyledInput type="number" id="backendProducts" value={dealData.backendProducts || ''} onChange={handleDealChange} min="0" step="50" error={!!errors.backendProducts} />
            </InputGroup>
             <InputGroup label="State Fees ($)" htmlFor="stateFees" error={errors.stateFees}>
                <StyledInput type="number" id="stateFees" value={dealData.stateFees || ''} onChange={handleDealChange} min="0" step="1" error={!!errors.stateFees} />
            </InputGroup>
            <InputGroup label="Term (Mo)" htmlFor="loanTerm">
                <StyledSelect id="loanTerm" value={dealData.loanTerm} onChange={handleDealChange}>
                    <option value="36">36</option><option value="48">48</option><option value="60">60</option><option value="72">72</option><option value="84">84</option>
                </StyledSelect>
            </InputGroup>
            <InputGroup label="APR (%)" htmlFor="interestRate" error={errors.interestRate}>
                <StyledInput type="number" id="interestRate" value={dealData.interestRate || ''} onChange={handleDealChange} min="0" max="50" step="0.1" error={!!errors.interestRate}/>
            </InputGroup>
        </div>
      </div>
    </div>
  );
};

export default DealControls;
