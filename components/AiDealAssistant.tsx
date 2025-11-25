
import React, { useState } from 'react';
import type { CalculatedVehicle, DealData, FilterData, LenderProfile } from '../types';
import { analyzeDealWithAi, type DealSuggestion } from '../services/aiProcessor';
import Button from './common/Button';
import { SparklesIcon, CheckIcon, SwapIcon, ExclamationTriangleIcon } from './common/Icons';
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
             // Fallback if onSelectInventory prop is missing (shouldn't happen in normal flow)
             console.warn("Switch requested but handler missing", vehicle);
        }
    };

    const findAlternativeVehicle = (vin: string) => {
        const safeInventory = Array.isArray(inventory) ? inventory : [];
        return safeInventory.find(v => v.vin === vin);
    };

    const lenderCount = Array.isArray(lenderProfiles) ? lenderProfiles.length : 0;

    if (!activeVehicle) {
        return (
            <div className="text-center text-slate-500 dark:text-gray-400 p-8 border-2 border-dashed border-slate-300 dark:border-gray-700 rounded-lg">
                <SparklesIcon className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                <p>Structure a deal on a vehicle to use the AI Desk Manager.</p>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <SparklesIcon className="text-purple-500 w-6 h-6" />
                    AI Desk Manager
                </h3>
                <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
                    Powered by Gemini 3.0 Pro. Analyzes your deal against {lenderCount} lender profiles to optimize approval odds and profit.
                </p>
            </div>

            {!suggestionResult && !isAnalyzing && (
                <div className="bg-slate-50 dark:bg-white/5 p-6 rounded-xl border border-slate-200 dark:border-gray-800 text-center">
                    <p className="mb-4 font-medium text-slate-700 dark:text-gray-200">
                        Ready to desk the <span className="text-blue-600 dark:text-blue-400">{activeVehicle.vehicle}</span>?
                    </p>
                    <Button onClick={handleAnalyze} className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-none shadow-md">
                        <SparklesIcon className="mr-2 w-5 h-5" />
                        Analyze Deal Structure
                    </Button>
                </div>
            )}

            {isAnalyzing && (
                <div className="text-center py-12 space-y-4">
                    <div className="relative mx-auto w-16 h-16">
                        <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-gray-700"></div>
                        <div className="absolute inset-0 rounded-full border-4 border-purple-500 border-t-transparent animate-spin"></div>
                    </div>
                    <p className="text-slate-600 dark:text-gray-300 font-medium animate-pulse">Analyzing Deal Structure...</p>
                    <p className="text-xs text-slate-400 dark:text-gray-500">Checking LTV, PTI, and Guidelines</p>
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm mb-4 flex items-start gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {suggestionResult && (
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-800">
                        <h4 className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider mb-2">AI Analysis</h4>
                        <p className="text-sm text-slate-700 dark:text-gray-200 leading-relaxed">
                            "{suggestionResult.analysis}"
                        </p>
                    </div>

                    <div className="space-y-4">
                        {(Array.isArray(suggestionResult.suggestions) ? suggestionResult.suggestions : []).map((suggestion, idx) => {
                            const alternativeVehicle = suggestion.alternativeVehicleVin ? findAlternativeVehicle(suggestion.alternativeVehicleVin) : null;

                            return (
                                <div key={idx} className="border border-slate-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-black shadow-sm hover:shadow-md transition-all duration-200">
                                    <div className="p-4 border-b border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-white/5 flex justify-between items-start">
                                        <div>
                                            <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs px-2 py-0.5 rounded-full">Suggestion #{idx + 1}</span>
                                                {suggestion.title}
                                            </h4>
                                            <p className="text-sm text-slate-600 dark:text-gray-400 mt-1">{suggestion.reasoning}</p>
                                        </div>
                                        {!alternativeVehicle && (
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => applySuggestion(suggestion.proposedChanges)}
                                                className="bg-white dark:bg-black text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 border-slate-300 dark:border-gray-700"
                                            >
                                                <CheckIcon className="w-3 h-3 mr-1.5 text-green-500" />
                                                Apply
                                            </Button>
                                        )}
                                    </div>

                                    {alternativeVehicle ? (
                                        <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 text-sm">
                                            <div className="flex justify-between items-center mb-3">
                                                <div>
                                                    <p className="font-bold text-lg text-blue-700 dark:text-blue-300">{alternativeVehicle.vehicle}</p>
                                                    <p className="text-xs text-slate-500 dark:text-gray-400">Stock: {alternativeVehicle.stock} | Price: {formatCurrency(alternativeVehicle.price)}</p>
                                                </div>
                                                <div className="text-right">
                                                     <p className="text-xs text-slate-500 dark:text-gray-400">Potential Gross</p>
                                                     <p className="font-bold text-green-600 dark:text-green-400 text-lg">{formatCurrency(alternativeVehicle.frontEndGross)}</p>
                                                </div>
                                            </div>
                                            <div className="flex justify-end">
                                                <Button size="sm" onClick={() => handleSwitchInventory(alternativeVehicle.vin)} className="text-xs shadow-sm">
                                                    <SwapIcon className="w-4 h-4 mr-1.5" /> Switch to this Vehicle
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-white dark:bg-black text-sm">
                                            <div className="grid grid-cols-2 gap-4">
                                                {suggestion.proposedChanges && Object.entries(suggestion.proposedChanges).map(([key, val]) => {
                                                    if(val === undefined) return null;

                                                    let displayVal = val;
                                                    if(key === 'downPayment' || key === 'tradeInValue' || key === 'backendProducts') displayVal = formatCurrency(val);
                                                    if(key === 'interestRate') displayVal = val + '%';
                                                    if(key === 'loanTerm') displayVal = val + ' mo';

                                                    const labels: Record<string, string> = {
                                                        downPayment: 'Down Payment',
                                                        tradeInValue: 'Trade Value',
                                                        backendProducts: 'Backend Products',
                                                        interestRate: 'Interest Rate',
                                                        loanTerm: 'Loan Term'
                                                    };

                                                    const label = labels[key] || key;

                                                    return (
                                                        <div key={key} className="flex justify-between items-center border-b border-slate-100 dark:border-gray-800 pb-2 last:border-0">
                                                            <span className="text-slate-500 dark:text-gray-400">{label}</span>
                                                            <span className="font-bold text-purple-600 dark:text-purple-400">{displayVal}</span>
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
                    <Button variant="ghost" onClick={handleAnalyze} className="w-full text-xs mt-4 text-slate-500 hover:text-slate-800 dark:text-gray-500 dark:hover:text-gray-300">
                        <SparklesIcon className="w-4 h-4 mr-1" /> Regenerate Suggestions
                    </Button>
                </div>
            )}
        </div>
    );
};

export default AiDealAssistant;
