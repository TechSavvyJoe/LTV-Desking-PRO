
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { CalculatedVehicle, DealData, FilterData, LenderProfile, Settings, Vehicle } from '../types';
import { calculateMonthlyPayment, calculateLoanAmount } from '../services/calculator';
import { checkBankEligibility } from '../services/lenderMatcher';
import { formatCurrency, formatNumber } from './common/TableCell';
import Button from './common/Button';
import * as Icons from './common/Icons';
import AiDealAssistant from './AiDealAssistant';

// --- SHARED COMPONENTS ---
const InputGroup: React.FC<{ label: string; children: React.ReactNode; htmlFor?: string; }> = ({ label, children, htmlFor }) => (
  <div className="flex flex-col"><label htmlFor={htmlFor} className="mb-1.5 text-sm font-medium text-slate-500 dark:text-slate-300">{label}</label>{children}</div>
);
const StyledInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className="w-full px-3 py-2 text-base bg-transparent border border-slate-300 dark:border-slate-700 rounded-lg placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-0 transition-colors duration-200 ease-in-out" />
);
const StyledSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className="w-full px-3 py-2 text-base bg-slate-50 dark:bg-black border border-slate-300 dark:border-slate-700 rounded-lg placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-0 transition-colors duration-200 ease-in-out" />
);
const ResultDisplay = ({ label, value, valueColorClass = 'text-blue-500' }: { label: string, value: string | React.ReactNode, valueColorClass?: string }) => (
    <div className="flex justify-between items-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md">
        <span className={`font-bold text-lg ${valueColorClass}`}>{label}</span>
        <span className={`font-bold text-lg ${valueColorClass}`}>{value}</span>
    </div>
);
const ToolContentWrapper: React.FC<{title: string, children: React.ReactNode}> = ({ title, children }) => (
    <div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6">{title}</h3>
        {children}
    </div>
);


// --- TOOL COMPONENTS ---

const ToolInventorySearch = ({ inventory, onSelect, favorites, toggleFavorite }: { inventory: CalculatedVehicle[], onSelect: (vehicle: CalculatedVehicle) => void, favorites: Vehicle[], toggleFavorite: (vin: string) => void }) => {
    const [query, setQuery] = useState('');
    // Safe access for favorites
    const favoriteVins = useMemo(() => new Set((Array.isArray(favorites) ? favorites : []).map(f => f.vin)), [favorites]);
    
    const filteredInventory = useMemo(() => {
        if (!query) return [];
        const safeInventory = Array.isArray(inventory) ? inventory : [];
        const lowerQuery = query.toLowerCase();
        return safeInventory.filter(v => 
            (v.vehicle || '').toLowerCase().includes(lowerQuery) || 
            (v.stock || '').toLowerCase().includes(lowerQuery)
        ).slice(0, 5);
    }, [query, inventory]);

    return (
        <div className="relative mb-4">
            <div className="relative">
                <StyledInput 
                    type="text" 
                    placeholder="Search inventory by name or stock..." 
                    value={query} 
                    onChange={e => setQuery(e.target.value)}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none"><Icons.MagnifyingGlassIcon /></div>
            </div>
            {query && filteredInventory.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-slate-50 dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
                    <ul className="py-1">
                        {filteredInventory.map(v => (
                            <li key={v.vin} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer" onClick={() => { onSelect(v); setQuery(''); }}>
                                <div>
                                    <p className="font-semibold">{v.vehicle}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{v.stock} - {formatCurrency(v.price)}</p>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleFavorite(v.vin); }}
                                    className={`p-2 rounded-lg group`}
                                >
                                    <Icons.StarIcon className={`transition-colors ${favoriteVins.has(v.vin) ? 'text-yellow-500 fill-yellow-500' : 'text-slate-400 dark:text-slate-300 group-hover:text-yellow-500'}`}/>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

const LenderEligibility = ({ activeVehicle, dealData, customerFilters, lenderProfiles }: ToolProps) => {
    const eligibilityResults = useMemo(() => {
        // Defensive check: ensure lenderProfiles is an array
        const safeProfiles = Array.isArray(lenderProfiles) ? lenderProfiles : [];
        if (!activeVehicle || !customerFilters.creditScore || safeProfiles.length === 0) {
            return [];
        }
        // Defensive filtering of potential null profiles
        const validProfiles = safeProfiles.filter(Boolean);
        return validProfiles.map(bank => ({
            name: bank.name,
            ...checkBankEligibility(activeVehicle, { ...dealData, ...customerFilters }, bank)
        }));
    }, [activeVehicle, dealData, customerFilters, lenderProfiles]);

    if (!activeVehicle) {
        return (
            <ToolContentWrapper title="Lender Eligibility">
                <div className="text-center text-slate-500 dark:text-slate-400 p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
                    <p>Select a vehicle from the inventory by clicking "Structure" to check lender eligibility.</p>
                </div>
            </ToolContentWrapper>
        );
    }
    
    if (!customerFilters.creditScore) {
         return (
            <ToolContentWrapper title={`Lender Eligibility for ${activeVehicle.vehicle}`}>
                <div className="text-center text-slate-500 dark:text-slate-400 p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
                    <p>Enter a customer credit score in the main controls to see results.</p>
                </div>
            </ToolContentWrapper>
        );
    }

    return (
        <ToolContentWrapper title={`Lender Eligibility for ${activeVehicle.vehicle}`}>
            <div className="space-y-3 max-h-[80vh] overflow-y-auto pr-2">
                {eligibilityResults.map(result => (
                    <div key={result.name} className={`p-4 rounded-lg border-l-4 ${result.eligible ? 'bg-green-500/10 border-green-500' : 'bg-red-500/10 border-red-500'}`}>
                        <div className="flex justify-between items-center">
                            <h4 className="font-bold text-lg text-slate-900 dark:text-slate-100">{result.name}</h4>
                            <span className={`px-3 py-1 text-xs font-bold rounded-full ${result.eligible ? 'bg-green-500/20 text-green-700 dark:text-green-300' : 'bg-red-500/20 text-red-700 dark:text-red-300'}`}>
                                {result.eligible ? 'ELIGIBLE' : 'INELIGIBLE'}
                            </span>
                        </div>
                        <div className="mt-2 text-sm">
                            {result.eligible ? (
                                <p className="text-green-600 dark:text-green-400">Matched Tier: <span className="font-semibold">{result.matchedTier?.name}</span></p>
                            ) : (
                                <ul className="list-disc list-inside text-red-600 dark:text-red-400 space-y-1">
                                    {result.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                                </ul>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </ToolContentWrapper>
    );
};

const GrossProfit = ({ inventory, favorites, toggleFavorite }: ToolProps) => {
    const [salePrice, setSalePrice] = useState<number | ''>('');
    const [unitCost, setUnitCost] = useState<number | ''>('');
    const [products, setProducts] = useState<{name: string, price: number | '', cost: number | ''}[]>([]);
    
    const handleVehicleSelect = (vehicle: CalculatedVehicle) => {
        setSalePrice(typeof vehicle.price === 'number' ? vehicle.price : '');
        setUnitCost(typeof vehicle.unitCost === 'number' ? vehicle.unitCost : '');
    };

    const frontEndGross = useMemo(() => Number(salePrice) - Number(unitCost), [salePrice, unitCost]);
    const backEndGross = useMemo(() => products.reduce((total, p) => total + (Number(p.price) - Number(p.cost)), 0), [products]);
    
    const handleProductChange = (index: number, field: 'name'|'price'|'cost', value: string) => {
        const newProducts = [...products];
        const isNumber = field !== 'name';
        newProducts[index] = {...newProducts[index], [field]: isNumber ? (value === '' ? '' : Number(value)) : value };
        setProducts(newProducts);
    };

    const addProduct = () => setProducts([...products, {name: '', price: '', cost: ''}]);
    const removeProduct = (index: number) => setProducts(products.filter((_, i) => i !== index));

    return (<ToolContentWrapper title="Gross Profit Breakdown"><div className="space-y-6">
        <ToolInventorySearch inventory={inventory} onSelect={handleVehicleSelect} favorites={favorites} toggleFavorite={toggleFavorite} />
        <div>
            <h4 className="font-semibold mb-2 text-slate-800 dark:text-slate-100">Front-End</h4>
            <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Sale Price ($)"><StyledInput type="number" value={salePrice} onChange={e => setSalePrice(e.target.value === '' ? '' : Number(e.target.value))} /></InputGroup>
                <InputGroup label="Unit Cost ($)"><StyledInput type="number" value={unitCost} onChange={e => setUnitCost(e.target.value === '' ? '' : Number(e.target.value))} /></InputGroup>
            </div>
        </div>
        <div>
            <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-slate-800 dark:text-slate-100">Back-End (F&I)</h4>
                <Button size="sm" variant="secondary" onClick={addProduct}><Icons.PlusIcon/> Add Product</Button>
            </div>
            <div className="space-y-2">
                {products.map((p, i) => (
                    <div key={i} className="grid grid-cols-10 gap-2 items-center">
                        <StyledInput className="col-span-4" placeholder="Product Name" value={p.name} onChange={e => handleProductChange(i, 'name', e.target.value)} />
                        <StyledInput className="col-span-2" type="number" placeholder="Price" value={p.price} onChange={e => handleProductChange(i, 'price', e.target.value)} />
                        <StyledInput className="col-span-2" type="number" placeholder="Cost" value={p.cost} onChange={e => handleProductChange(i, 'cost', e.target.value)} />
                        <div className="col-span-2 flex items-center gap-2">
                            <span className="text-sm font-medium text-green-600 dark:text-green-400">{formatCurrency(Number(p.price) - Number(p.cost))}</span>
                            <Button size="sm" variant="danger" className="!p-2" onClick={() => removeProduct(i)}><Icons.TrashIcon /></Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
        <div className="pt-4 mt-4 border-t border-slate-200 dark:border-x-border space-y-2">
            <ResultDisplay label="Front-End Gross" value={formatCurrency(frontEndGross)} valueColorClass={frontEndGross > 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'} />
            <ResultDisplay label="Back-End Gross" value={formatCurrency(backEndGross)} valueColorClass={backEndGross > 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'} />
            <ResultDisplay label="Total Gross" value={formatCurrency(frontEndGross + backEndGross)} valueColorClass={(frontEndGross + backEndGross) > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'} />
        </div>
    </div></ToolContentWrapper>);
};

const DealComparison = ({ activeVehicle, dealData, onDealDataChange }: ToolProps) => {
    const [dealA, setDealA] = useState<DealData>(dealData);
    const [dealB, setDealB] = useState<DealData>(dealData);

    useEffect(() => {
        setDealA(dealData);
        setDealB(dealData);
    }, [dealData]);

    const calculatedA = useMemo(() => {
        if (!activeVehicle) return null;
        const tempVehicle = { ...activeVehicle, price: typeof activeVehicle.price === 'number' ? activeVehicle.price : 0 };
        const tempDeal = { ...dealA };
        const principal = (tempVehicle.price - tempDeal.downPayment - (tempDeal.tradeInValue - tempDeal.tradeInPayoff) + tempDeal.backendProducts + tempDeal.stateFees + 304); // Rough tax/fee estimate
        const payment = calculateMonthlyPayment(principal, tempDeal.interestRate, tempDeal.loanTerm);
        return { monthlyPayment: payment };
    }, [activeVehicle, dealA]);

    const calculatedB = useMemo(() => {
        if (!activeVehicle) return null;
        const tempVehicle = { ...activeVehicle, price: typeof activeVehicle.price === 'number' ? activeVehicle.price : 0 };
        const tempDeal = { ...dealB };
        const principal = (tempVehicle.price - tempDeal.downPayment - (tempDeal.tradeInValue - tempDeal.tradeInPayoff) + tempDeal.backendProducts + tempDeal.stateFees + 304); // Rough tax/fee estimate
        const payment = calculateMonthlyPayment(principal, tempDeal.interestRate, tempDeal.loanTerm);
        return { monthlyPayment: payment };
    }, [activeVehicle, dealB]);
    
    const handleAChange = (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setDealA(prev => ({...prev, [e.target.name]: Number(e.target.value)}));
    const handleBChange = (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setDealB(prev => ({...prev, [e.target.name]: Number(e.target.value)}));
    
    const copyToGlobal = (deal: DealData) => onDealDataChange(deal);

    if (!activeVehicle) return <ToolContentWrapper title="Deal Comparison"><p className="text-center text-slate-500 dark:text-slate-400">Select a vehicle from the inventory to start comparing deals.</p></ToolContentWrapper>

    const DealColumn = ({ title, deal, handler, calculated, onCopy }: { title: string, deal: DealData, handler: any, calculated: { monthlyPayment: number | "Error" } | null, onCopy: () => void }) => (
        <div className="space-y-2 p-3 bg-slate-100 dark:bg-slate-900 rounded-lg">
            <h4 className="font-bold text-center text-lg">{title}</h4>
            <InputGroup label="Down"><StyledInput name="downPayment" type="number" value={deal.downPayment} onChange={handler} /></InputGroup>
            <InputGroup label="Term"><StyledSelect name="loanTerm" value={deal.loanTerm} onChange={handler}><option value="60">60</option><option value="72">72</option><option value="84">84</option></StyledSelect></InputGroup>
            <InputGroup label="APR %"><StyledInput name="interestRate" type="number" step="0.1" value={deal.interestRate} onChange={handler} /></InputGroup>
            <InputGroup label="Backend"><StyledInput name="backendProducts" type="number" value={deal.backendProducts} onChange={handler} /></InputGroup>
            <div className="pt-2 mt-2 border-t border-slate-200 dark:border-x-border text-center space-y-2">
                <div className="font-bold text-2xl text-x-blue">{formatCurrency(calculated?.monthlyPayment)}/mo</div>
                <Button size="sm" variant="secondary" onClick={onCopy}>Use This Deal</Button>
            </div>
        </div>
    );
    
    return (<ToolContentWrapper title={`Comparing Deals for ${activeVehicle.vehicle}`}>
        <div className="grid grid-cols-2 gap-4">
            <DealColumn title="Deal A" deal={dealA} handler={handleAChange} calculated={calculatedA} onCopy={() => copyToGlobal(dealA)} />
            <DealColumn title="Deal B" deal={dealB} handler={handleBChange} calculated={calculatedB} onCopy={() => copyToGlobal(dealB)} />
        </div>
    </ToolContentWrapper>);
};

const ReserveCalculator = () => {
    const [amountFinanced, setAmountFinanced] = useState<number | ''>(25000);
    const [buyRate, setBuyRate] = useState<number | ''>(6.99);
    const [sellRate, setSellRate] = useState<number | ''>(8.99);
    const [term, setTerm] = useState<number>(72);
    const [split, setSplit] = useState<number | ''>(60);
    
    const { totalReserve, dealerShare } = useMemo(() => {
        const principal = Number(amountFinanced);
        const t = Number(term);
        if (principal <= 0 || t <= 0) return { totalReserve: 0, dealerShare: 0 };
        
        const paymentAtSell = calculateMonthlyPayment(principal, Number(sellRate), t);
        const paymentAtBuy = calculateMonthlyPayment(principal, Number(buyRate), t);
        
        if (typeof paymentAtSell !== 'number' || typeof paymentAtBuy !== 'number') return { totalReserve: 0, dealerShare: 0 };
        
        const totalPaidAtSell = paymentAtSell * t;
        const totalPaidAtBuy = paymentAtBuy * t;
        
        const totalReserve = totalPaidAtSell - totalPaidAtBuy;
        const dealerShare = totalReserve * (Number(split) / 100);
        
        return { totalReserve, dealerShare };
    }, [amountFinanced, buyRate, sellRate, term, split]);

    return (<ToolContentWrapper title="Reserve Calculator">
        <div className="space-y-4">
            <InputGroup label="Amount Financed ($)"><StyledInput type="number" value={amountFinanced} onChange={e => setAmountFinanced(Number(e.target.value) || '')} /></InputGroup>
            <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Buy Rate (APR %)"><StyledInput type="number" step="0.01" value={buyRate} onChange={e => setBuyRate(Number(e.target.value) || '')} /></InputGroup>
                <InputGroup label="Sell Rate (APR %)"><StyledInput type="number" step="0.01" value={sellRate} onChange={e => setSellRate(Number(e.target.value) || '')} /></InputGroup>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Term (Months)"><StyledSelect value={term} onChange={e => setTerm(Number(e.target.value))}><option value="60">60</option><option value="72">72</option><option value="84">84</option></StyledSelect></InputGroup>
                <InputGroup label="Dealer Split (%)"><StyledInput type="number" value={split} onChange={e => setSplit(Number(e.target.value) || '')} /></InputGroup>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-x-border space-y-2">
                <ResultDisplay label="Total Reserve" value={formatCurrency(totalReserve)} />
                <ResultDisplay label="Dealer Share" value={formatCurrency(dealerShare)} valueColorClass="text-green-600 dark:text-green-400" />
            </div>
        </div>
    </ToolContentWrapper>);
};

const FlatCalculator = () => {
    const [amountFinanced, setAmountFinanced] = useState<number | ''>(25000);
    const [flatPercent, setFlatPercent] = useState<number | ''>(1.5);
    const fee = useMemo(() => Number(amountFinanced) * (Number(flatPercent) / 100), [amountFinanced, flatPercent]);

    return (<ToolContentWrapper title="Flat Fee Calculator">
        <div className="space-y-4">
            <InputGroup label="Amount Financed ($)"><StyledInput type="number" value={amountFinanced} onChange={e => setAmountFinanced(Number(e.target.value) || '')} /></InputGroup>
            <InputGroup label="Flat Fee (%)"><StyledInput type="number" step="0.1" value={flatPercent} onChange={e => setFlatPercent(Number(e.target.value) || '')} /></InputGroup>
            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-x-border">
                <ResultDisplay label="Dealer Fee" value={formatCurrency(fee)} valueColorClass="text-green-600 dark:text-green-400" />
            </div>
        </div>
    </ToolContentWrapper>);
};

const TermComparator = () => {
    const [loanAmount, setLoanAmount] = useState<number | ''>(30000);
    const [interestRate, setInterestRate] = useState<number | ''>(9.0);
    const terms = [36, 48, 60, 72, 84];

    const payments = useMemo(() => {
        return terms.map(term => ({
            term,
            payment: calculateMonthlyPayment(Number(loanAmount), Number(interestRate), term)
        }));
    }, [loanAmount, interestRate]);

    return (<ToolContentWrapper title="Term vs. Payment Comparator"><div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
            <InputGroup label="Loan Amount ($)"><StyledInput type="number" value={loanAmount} onChange={e => setLoanAmount(e.target.value === '' ? '' : Number(e.target.value))} /></InputGroup>
            <InputGroup label="Interest Rate (APR %)"><StyledInput type="number" step="0.1" value={interestRate} onChange={e => setInterestRate(e.target.value === '' ? '' : Number(e.target.value))} /></InputGroup>
        </div>
        <div className="pt-4 mt-4 border-t border-slate-200 dark:border-x-border">
            <table className="w-full text-left">
                <thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="p-2 font-semibold text-slate-500 dark:text-slate-300">Term</th><th className="p-2 font-semibold text-right text-slate-500 dark:text-slate-300">Monthly Payment</th></tr></thead>
                <tbody>{payments.map(p => (<tr key={p.term} className="border-b border-slate-200 dark:border-x-border last:border-0"><td className="p-2">{p.term} mo</td><td className="p-2 text-right font-semibold text-x-blue">{formatCurrency(p.payment)}</td></tr>))}</tbody>
            </table>
        </div>
    </div></ToolContentWrapper>);
};

const QuoteBuilder = ({ activeVehicle, dealData, onDealDataChange, settings }: ToolProps) => {
    const [localDeal, setLocalDeal] = useState({
        price: activeVehicle?.price || '',
        downPayment: dealData.downPayment,
        tradeInValue: dealData.tradeInValue,
        tradeInPayoff: dealData.tradeInPayoff,
        backendProducts: dealData.backendProducts,
        loanTerm: dealData.loanTerm,
        interestRate: dealData.interestRate,
        stateFees: dealData.stateFees
    });

    useEffect(() => {
        setLocalDeal({
            price: activeVehicle?.price || '',
            downPayment: dealData.downPayment,
            tradeInValue: dealData.tradeInValue,
            tradeInPayoff: dealData.tradeInPayoff,
            backendProducts: dealData.backendProducts,
            loanTerm: dealData.loanTerm,
            interestRate: dealData.interestRate,
            stateFees: dealData.stateFees
        });
    }, [activeVehicle, dealData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setLocalDeal(prev => ({...prev, [name]: value === '' ? '' : Number(value)}));
    };

    const { amountToFinance, monthlyPayment } = useMemo(() => {
        const price = Number(localDeal.price);
        const down = Number(localDeal.downPayment);
        const trade = Number(localDeal.tradeInValue);
        const payoff = Number(localDeal.tradeInPayoff);
        const backend = Number(localDeal.backendProducts);
        const stateFees = Number(localDeal.stateFees);
        const term = Number(localDeal.loanTerm);
        const rate = Number(localDeal.interestRate);

        if (price <= 0) return { amountToFinance: 0, monthlyPayment: 0 };
        
        const taxRate = 0.06;
        const taxableAmount = Math.max(0, price - trade) + settings.docFee + settings.cvrFee;
        const salesTax = taxableAmount * taxRate;

        const otd = price + settings.docFee + settings.cvrFee + stateFees + salesTax;
        const netTrade = trade - payoff;
        const principal = otd + backend - down - netTrade;
        const payment = calculateMonthlyPayment(principal, rate, term);

        return { amountToFinance: principal, monthlyPayment: payment };
    }, [localDeal, settings]);

    const handleApply = () => {
        onDealDataChange({
            ...dealData, 
            downPayment: Number(localDeal.downPayment),
            tradeInValue: Number(localDeal.tradeInValue),
            tradeInPayoff: Number(localDeal.tradeInPayoff),
            backendProducts: Number(localDeal.backendProducts),
            loanTerm: Number(localDeal.loanTerm),
            interestRate: Number(localDeal.interestRate),
            stateFees: Number(localDeal.stateFees),
        });
        alert("Deal structure applied to main view.");
    };

    return (<ToolContentWrapper title="Quote Builder Sandbox">
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Sale Price ($)"><StyledInput name="price" type="number" value={localDeal.price} onChange={handleChange} /></InputGroup>
                <InputGroup label="Down Payment ($)"><StyledInput name="downPayment" type="number" value={localDeal.downPayment} onChange={handleChange} /></InputGroup>
                <InputGroup label="Trade Value ($)"><StyledInput name="tradeInValue" type="number" value={localDeal.tradeInValue} onChange={handleChange} /></InputGroup>
                <InputGroup label="Trade Payoff ($)"><StyledInput name="tradeInPayoff" type="number" value={localDeal.tradeInPayoff} onChange={handleChange} /></InputGroup>
                <InputGroup label="Backend ($)"><StyledInput name="backendProducts" type="number" value={localDeal.backendProducts} onChange={handleChange} /></InputGroup>
                <InputGroup label="State Fees ($)"><StyledInput name="stateFees" type="number" value={localDeal.stateFees} onChange={handleChange} /></InputGroup>
                 <InputGroup label="Term"><StyledSelect name="loanTerm" value={localDeal.loanTerm} onChange={handleChange}><option value="60">60</option><option value="72">72</option><option value="84">84</option></StyledSelect></InputGroup>
                <InputGroup label="APR %"><StyledInput name="interestRate" type="number" step="0.1" value={localDeal.interestRate} onChange={handleChange} /></InputGroup>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-x-border space-y-2">
                <ResultDisplay label="Amount to Finance" value={formatCurrency(amountToFinance)} />
                <ResultDisplay label="Monthly Payment" value={formatCurrency(monthlyPayment)} />
            </div>
            <Button onClick={handleApply} className="mt-4 w-full">Apply to Main Deal</Button>
        </div>
    </ToolContentWrapper>);
};


const TradeEquityCalculator = () => {
    const [tradeValue, setTradeValue] = useState<number | ''>('');
    const [tradePayoff, setTradePayoff] = useState<number | ''>('');
    const netEquity = useMemo(() => Number(tradeValue) - Number(tradePayoff), [tradeValue, tradePayoff]);
    const colorClass = netEquity >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500';
    return (<ToolContentWrapper title="Trade Equity Calculator"><div className="space-y-4">
        <InputGroup label="Trade-In Value ($)"><StyledInput type="number" value={tradeValue} onChange={e => setTradeValue(e.target.value === '' ? '' : Number(e.target.value))} min="0" placeholder="e.g., 15000" /></InputGroup>
        <InputGroup label="Trade-In Payoff ($)"><StyledInput type="number" value={tradePayoff} onChange={e => setTradePayoff(e.target.value === '' ? '' : Number(e.target.value))} min="0" placeholder="e.g., 12500" /></InputGroup>
        <div className="pt-4 mt-4 border-t border-slate-200 dark:border-x-border"><ResultDisplay label="Net Trade-In Equity" value={formatCurrency(netEquity)} valueColorClass={colorClass} /></div>
    </div></ToolContentWrapper>);
};

const PaymentCalculator = () => {
    const [loanAmount, setLoanAmount] = useState<number | ''>(25000);
    const [interestRate, setInterestRate] = useState<number | ''>(8.5);
    const [loanTerm, setLoanTerm] = useState<number>(72);
    const monthlyPayment = useMemo(() => calculateMonthlyPayment(Number(loanAmount), Number(interestRate), loanTerm), [loanAmount, interestRate, loanTerm]);
    return (<ToolContentWrapper title="Payment Calculator"><div className="space-y-4">
        <InputGroup label="Loan Amount ($)"><StyledInput type="number" value={loanAmount} onChange={e => setLoanAmount(e.target.value === '' ? '' : Number(e.target.value))} min="0" placeholder="e.g., 25000" /></InputGroup>
        <InputGroup label="Interest Rate (APR %)"><StyledInput type="number" value={interestRate} onChange={e => setInterestRate(e.target.value === '' ? '' : Number(e.target.value))} min="0" step="0.1" placeholder="e.g., 8.5" /></InputGroup>
        <InputGroup label="Loan Term (Months)"><StyledSelect value={loanTerm} onChange={e => setLoanTerm(Number(e.target.value))}><option value="36">36</option><option value="48">48</option><option value="60">60</option><option value="72">72</option><option value="84">84</option></StyledSelect></InputGroup>
        <div className="pt-4 mt-4 border-t border-slate-200 dark:border-x-border"><ResultDisplay label="Monthly Payment" value={formatCurrency(monthlyPayment)} /></div>
    </div></ToolContentWrapper>);
};

const AffordabilityCalculator = () => {
    const [monthlyPayment, setMonthlyPayment] = useState<number | ''>(450);
    const [interestRate, setInterestRate] = useState<number | ''>(8.5);
    const [loanTerm, setLoanTerm] = useState<number>(72);
    const maxLoan = useMemo(() => calculateLoanAmount(Number(monthlyPayment), Number(interestRate), loanTerm), [monthlyPayment, interestRate, loanTerm]);
    return (<ToolContentWrapper title="Affordability Calculator"><div className="space-y-4">
        <InputGroup label="Desired Monthly Payment ($)"><StyledInput type="number" value={monthlyPayment} onChange={e => setMonthlyPayment(e.target.value === '' ? '' : Number(e.target.value))} min="0" placeholder="e.g., 450" /></InputGroup>
        <InputGroup label="Interest Rate (APR %)"><StyledInput type="number" value={interestRate} onChange={e => setInterestRate(e.target.value === '' ? '' : Number(e.target.value))} min="0" step="0.1" placeholder="e.g., 8.5" /></InputGroup>
        <InputGroup label="Loan Term (Months)"><StyledSelect value={loanTerm} onChange={e => setLoanTerm(Number(e.target.value))}><option value="36">36</option><option value="48">48</option><option value="60">60</option><option value="72">72</option><option value="84">84</option></StyledSelect></InputGroup>
        <div className="pt-4 mt-4 border-t border-slate-200 dark:border-x-border"><ResultDisplay label="Max Loan Amount" value={formatCurrency(maxLoan)} /></div>
    </div></ToolContentWrapper>);
};

const LenderReference = ({ lenderProfiles }: ToolProps) => {
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);
    // Safe access for lenderProfiles
    const filteredProfiles = useMemo(() => (Array.isArray(lenderProfiles) ? lenderProfiles : []).filter(p => p && p.name && p.name.toLowerCase().includes(search.toLowerCase())), [lenderProfiles, search]);

    return (<ToolContentWrapper title="Lender Quick Reference">
        <StyledInput placeholder="Search lenders..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="mt-4 space-y-2 max-h-[70vh] overflow-y-auto">
            {filteredProfiles.map(p => (
                <div key={p.id} className="border border-slate-200 dark:border-x-border rounded-lg">
                    <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="w-full p-3 text-left font-semibold flex justify-between items-center hover:bg-slate-100 dark:hover:bg-x-hover-dark">
                        {p.name} <span>{expanded === p.id ? '−' : '+'}</span>
                    </button>
                    {expanded === p.id && <div className="p-3 border-t border-slate-200 dark:border-x-border text-xs space-y-1">
                        {(Array.isArray(p.tiers) ? p.tiers : []).map((tier, i) => {
                             // Guard against undefined tier
                             if (!tier) return null;
                             
                             const tierDetails = [
                                tier.minFico !== undefined && `FICO: ${tier.minFico}${tier.maxFico ? `-${tier.maxFico}` : '+'}`,
                                tier.maxLtv !== undefined && `Max LTV: ${tier.maxLtv}%`,
                                tier.maxTerm !== undefined && `Max Term: ${tier.maxTerm}mo`,
                                tier.maxMileage !== undefined && `Max Miles: ${tier.maxMileage.toLocaleString()}`,
                                tier.minYear !== undefined && `Year: ${tier.minYear}${tier.maxYear ? `-${tier.maxYear}` : '+'}`
                            ].filter(Boolean).join(' | ');

                            return (<div key={i} className="p-1.5 bg-slate-100 dark:bg-slate-900 rounded-md">
                                <p className="font-bold">{tier.name}</p>
                                <p className="text-slate-500 dark:text-slate-400">{tierDetails}</p>
                            </div>);
                        })}
                    </div>}
                </div>
            ))}
        </div>
    </ToolContentWrapper>);
};

const ScratchPad = ({ scratchPadNotes, setScratchPadNotes }: ToolProps) => (
    <ToolContentWrapper title="Scratch Pad">
        <textarea 
            className="w-full h-96 p-3 text-base bg-transparent border border-slate-300 dark:border-x-border rounded-lg"
            placeholder="Jot down temporary notes here... (clears when you clear the deal)"
            value={scratchPadNotes}
            onChange={(e) => setScratchPadNotes(e.target.value)}
        />
    </ToolContentWrapper>
);


// --- MAIN PANEL ---
type ToolId = 'desk_manager' | 'eligibility' | 'gross' | 'compare' | 'reserve' | 'flat' | 'term' | 'quote' | 'trade' | 'payment' | 'affordability' | 'lenders' | 'scratchpad';

interface ToolProps {
    activeVehicle: CalculatedVehicle | null;
    dealData: DealData;
    onDealDataChange: React.Dispatch<React.SetStateAction<DealData>>;
    customerFilters: FilterData;
    customerName: string;
    salespersonName: string;
    lenderProfiles: LenderProfile[];
    scratchPadNotes: string;
    setScratchPadNotes: React.Dispatch<React.SetStateAction<string>>;
    settings: Settings;
    inventory: CalculatedVehicle[];
    favorites: Vehicle[];
    toggleFavorite: (vin: string) => void;
}

const tools: { id: ToolId, name: string, icon: React.ReactNode, component: React.FC<ToolProps> }[] = [
    { id: 'desk_manager', name: 'AI Manager', icon: <Icons.SparklesIcon />, component: AiDealAssistant },
    { id: 'eligibility', name: 'Lender Match', icon: <Icons.ShieldCheckIcon />, component: LenderEligibility },
    { id: 'gross', name: 'Gross Profit', icon: <Icons.ChartIcon />, component: GrossProfit },
    { id: 'compare', name: 'Compare', icon: <Icons.DocumentDuplicateIcon />, component: DealComparison },
    { id: 'reserve', name: 'Reserve', icon: <Icons.ReceiptPercentIcon />, component: ReserveCalculator },
    { id: 'flat', name: 'Flat Fee', icon: <Icons.CurrencyDollarIcon />, component: FlatCalculator },
    { id: 'quote', name: 'Quote Builder', icon: <Icons.PencilSquareIcon />, component: QuoteBuilder },
    { id: 'term', name: 'Term Comp', icon: <Icons.CalendarDaysIcon />, component: TermComparator },
    { id: 'trade', name: 'Trade Equity', icon: <Icons.SwapIcon />, component: TradeEquityCalculator },
    { id: 'payment', name: 'Payment', icon: <Icons.CalculatorIcon />, component: PaymentCalculator },
    { id: 'affordability', name: 'Affordability', icon: <Icons.PriceTagIcon />, component: AffordabilityCalculator },
    { id: 'lenders', name: 'Lenders', icon: <Icons.BuildingLibraryIcon />, component: LenderReference },
    { id: 'scratchpad', name: 'Scratch Pad', icon: <Icons.ClipboardDocumentIcon />, component: ScratchPad },
];

const FloatingToolsPanel: React.FC<ToolProps> = (props) => {
    const [isOpen, setIsOpen] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => {
            setIsOpen(true);
        }, 150);
    };

    const handleMouseLeave = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => {
            setIsOpen(false);
        }, 250);
    };

    const [activeToolId, setActiveToolId] = useState<ToolId>('desk_manager');
    const ActiveTool = useMemo(() => tools.find(t => t.id === activeToolId)!.component, [activeToolId]);

    // Defensive Prop Wrapping
    const safeProps = {
        ...props,
        lenderProfiles: Array.isArray(props.lenderProfiles) ? props.lenderProfiles : [],
        inventory: Array.isArray(props.inventory) ? props.inventory : [],
        favorites: Array.isArray(props.favorites) ? props.favorites : [],
    };

    return (
        <div 
            className="fixed top-40 right-0 h-40 z-[60] pointer-events-none"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div 
                className={`fixed top-0 right-0 h-full transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} pointer-events-auto`}
            >
                <div className="h-full w-full max-w-xl bg-slate-950 shadow-2xl flex flex-row-reverse border-l border-slate-800">
                    <div className="w-24 bg-slate-950 border-l border-slate-800 flex flex-col items-center flex-shrink-0 pt-4 space-y-1">
                        <button onClick={() => setIsOpen(false)} className="w-20 h-20 p-2 rounded-md flex flex-col items-center justify-center text-center text-slate-300 hover:bg-slate-800">
                            <Icons.ChevronRightIcon />
                            <span className="text-[11px] mt-1 font-semibold leading-tight">Close</span>
                        </button>
                        {tools.map(tool => (
                            <button key={tool.id} onClick={() => setActiveToolId(tool.id)} title={tool.name} className={`w-20 h-20 p-2 rounded-md flex flex-col items-center justify-center text-center transition-colors ${activeToolId === tool.id ? 'bg-slate-800 text-sky-400' : 'text-slate-400 hover:bg-slate-800'}`}>
                                {tool.icon}
                                <span className="text-[11px] mt-1 font-semibold leading-tight">{tool.name}</span>
                            </button>
                        ))}
                    </div>
                    <div className="p-6 flex-grow overflow-y-auto">
                        <ActiveTool {...safeProps} />
                    </div>
                </div>
            </div>
            <div
                className="absolute top-0 right-0 bg-gradient-to-b from-sky-500 to-indigo-600 text-white px-3 py-4 rounded-l-xl shadow-2xl cursor-pointer pointer-events-auto"
                aria-hidden="true"
            >
                <div className="flex flex-col items-center gap-2">
                    <Icons.WrenchToolIcon className="w-6 h-6" />
                    <span className="font-extrabold text-sm tracking-tight [writing-mode:vertical-rl] rotate-180">Toolbox</span>
                </div>
            </div>
        </div>
    );
};

export default FloatingToolsPanel;
