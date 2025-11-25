
import React, { useState } from 'react';
import type { CalculatedVehicle, DealData, FilterData, LenderProfile } from '../types';
import { analyzeDealWithAi, type DealSuggestion } from '../services/aiProcessor';
import Button from './common/Button';
import { SparklesIcon, CheckIcon, SwapIcon } from './common/Icons';
import { formatCurrency } from './common/TableCell';

interface AiDealAssistantProps {
    activeVehicle: CalculatedVehicle | null;
    dealData: DealData;
    onDealDataChange: React.Dispatch<React.SetStateAction<DealData>>;
    customerFilters: FilterData;
    lenderProfiles: LenderProfile[];
    inventory: CalculatedVehicle[];
    onSelectInventory?: (vehicle: CalculatedVehicle) => void;
}

const AiDealAssistant: React.FC<AiDealAssistantProps> = ({
    activeVehicle,
    dealData,
    onDealDataChange,
    customerFilters,
    lenderProfiles,
    inventory,
    onSelectInventory
}) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [suggestionResult, setSuggestionResult] = useState<DealSuggestion | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleAnalyze = async () => {
        if (!activeVehicle) return;
        
        setIsAnalyzing(true);
        setError(null);
        setSuggestionResult(null);

        try {
            // Defensively pass empty arrays if data is missing and filter nulls
            const safeLenders = (Array.isArray(lenderProfiles) ? lenderProfiles : []).filter(Boolean);
            const safeInventory = (Array.isArray(inventory) ? inventory : []).filter(Boolean);
            const result = await analyzeDealWithAi(activeVehicle, dealData, customerFilters, safeLenders, safeInventory);
            setSuggestionResult(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to analyze deal.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const applySuggestion = (changes: Partial<DealData>) => {
        onDealDataChange(prev => ({
            ...prev,
            ...changes
        }));
    };
    
    const handleSwitchInventory = (vin: string) => {
        const safeInventory = Array.isArray(inventory) ? inventory : [];
        const vehicle = safeInventory.find(v => v.vin === vin);
        if (vehicle && onSelectInventory) {
             onSelectInventory(vehicle);
        } else if (vehicle) {
             alert(`Please manually search and select the ${vehicle.vehicle} (Stock: ${vehicle.stock}) from the inventory table.`);
        }
    };
    
    const findAlternativeVehicle = (vin: string) => {
        const safeInventory = Array.isArray(inventory) ? inventory : [];
        return safeInventory.find(v => v.vin === vin);
    };
    
    const lenderCount = Array.isArray(lenderProfiles) ? lenderProfiles.length : 0;

    if (!activeVehicle) {
        return (
            <div className="text-center text-slate-500 dark:text-x-text-secondary p-8 border-2 border-dashed border-slate-300 dark:border-x-border rounded-lg">
                <p>Structure a deal on a vehicle to use the AI Desk Manager.</p>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-x-text-primary flex items-center gap-2">
                    <SparklesIcon className="text-purple-500" />
                    AI Desk Manager
                </h3>
                <p className="text-sm text-slate-500 dark:text-x-text-secondary mt-1">
                    Powered by Gemini 3.0 Pro. Analyzes your deal against lender tiers to find the optimal structure.
                </p>
            </div>

            {!suggestionResult && !isAnalyzing && (
                <div className="bg-slate-100 dark:bg-x-hover-dark p-6 rounded-lg text-center">
                    <p className="mb-4 font-medium text-slate-700 dark:text-x-text-primary">
                        Ready to desk the {activeVehicle.vehicle}?
                    </p>
                    <Button onClick={handleAnalyze} className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 border-none">
                        <SparklesIcon className="mr-2" />
                        Analyze Deal Structure
                    </Button>
                </div>
            )}

            {isAnalyzing && (
                <div className="text-center py-12 space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
                    <p className="text-slate-600 dark:text-x-text-secondary animate-pulse">Thinking...</p>
                    <p className="text-xs text-slate-400 dark:text-x-text-secondary/50">Reviewing {lenderCount} lender profiles & {activeVehicle.vehicle} specs</p>
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm mb-4">
                    {error}
                </div>
            )}

            {suggestionResult && (
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-purple-50 dark:bg-purple-900/10 p-4 rounded-lg border border-purple-100 dark:border-purple-900/30">
                        <h4 className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">Analysis</h4>
                        <p className="text-sm text-slate-700 dark:text-x-text-primary italic">"{suggestionResult.analysis}"</p>
                    </div>

                    <div className="space-y-4">
                        {(Array.isArray(suggestionResult.suggestions) ? suggestionResult.suggestions : []).map((suggestion, idx) => {
                            const alternativeVehicle = suggestion.alternativeVehicleVin ? findAlternativeVehicle(suggestion.alternativeVehicleVin) : null;
                            
                            return (
                                <div key={idx} className="border border-slate-200 dark:border-x-border rounded-lg overflow-hidden bg-white dark:bg-x-black shadow-sm hover:shadow-md transition-shadow">
                                    <div className="p-4 border-b border-slate-100 dark:border-x-border bg-slate-50 dark:bg-x-hover-dark flex justify-between items-start">
                                        <div>
                                            <h4 className="font-bold text-slate-800 dark:text-x-text-primary">{suggestion.title}</h4>
                                            <p className="text-xs text-slate-500 dark:text-x-text-secondary mt-1">{suggestion.reasoning}</p>
                                        </div>
                                        {!alternativeVehicle && (
                                            <Button 
                                                size="sm" 
                                                variant="secondary" 
                                                onClick={() => applySuggestion(suggestion.proposedChanges)}
                                                className="bg-white dark:bg-x-black text-xs"
                                            >
                                                <CheckIcon className="w-3 h-3 mr-1" /> Apply
                                            </Button>
                                        )}
                                    </div>
                                    
                                    {alternativeVehicle ? (
                                        <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 text-sm">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-bold text-blue-700 dark:text-blue-300">{alternativeVehicle.vehicle}</p>
                                                    <p className="text-xs text-slate-500">Stock: {alternativeVehicle.stock} | {formatCurrency(alternativeVehicle.price)}</p>
                                                </div>
                                                <div className="text-right">
                                                     <p className="text-xs text-slate-500">Potential Gross</p>
                                                     <p className="font-bold text-green-600">{formatCurrency(alternativeVehicle.frontEndGross)}</p>
                                                </div>
                                            </div>
                                            <div className="mt-2 flex justify-end">
                                                <Button size="sm" onClick={() => handleSwitchInventory(alternativeVehicle.vin)} className="text-xs">
                                                    <SwapIcon className="w-3 h-3 mr-1" /> Switch to this Vehicle
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-3 bg-slate-50/50 dark:bg-x-black text-xs">
                                            <div className="grid grid-cols-2 gap-2">
                                                {suggestion.proposedChanges && Object.entries(suggestion.proposedChanges).map(([key, val]) => {
                                                    if(val === undefined) return null;
                                                    
                                                    let displayVal = val;
                                                    
                                                    if(key === 'downPayment' || key === 'tradeInValue' || key === 'backendProducts') displayVal = formatCurrency(val);
                                                    if(key === 'interestRate') displayVal = val + '%';
                                                    if(key === 'loanTerm') displayVal = val + ' mo';
                                                    
                                                    const labels: Record<string, string> = {
                                                        downPayment: 'Down Pmt',
                                                        tradeInValue: 'Trade Value',
                                                        backendProducts: 'Backend',
                                                        interestRate: 'Rate',
                                                        loanTerm: 'Term'
                                                    };
                                                    
                                                    const label = labels[key] || key;
                                                    
                                                    return (
                                                        <div key={key} className="flex justify-between">
                                                            <span className="text-slate-500 dark:text-x-text-secondary">{label}:</span>
                                                            <span className="font-semibold text-purple-600 dark:text-purple-400">{displayVal}</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    <Button variant="ghost" onClick={handleAnalyze} className="w-full text-xs mt-2">Regenerate Suggestions</Button>
                </div>
            )}
        </div>
    );
};

export default AiDealAssistant;
