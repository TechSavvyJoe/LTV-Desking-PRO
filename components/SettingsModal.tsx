
import React, { useState, useEffect } from 'react';
import type { Settings, AppState } from '../types';
import Button from './common/Button';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: Settings;
    onSave: (newSettings: Settings) => void;
}

const InputGroup: React.FC<{ label: string; children: React.ReactNode; htmlFor?: string; description?: string; }> = ({ label, children, htmlFor, description }) => (
    <div className="flex flex-col">
        <label htmlFor={htmlFor} className="mb-1.5 text-base font-medium text-slate-700 dark:text-x-text-secondary">{label}</label>
        {children}
        {description && <p className="mt-1 text-xs text-slate-500 dark:text-x-text-secondary">{description}</p>}
    </div>
);

const StyledInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className="w-full px-3 py-2 text-base bg-slate-50 dark:bg-transparent border border-x-border rounded-lg placeholder-x-text-secondary focus:outline-none focus:border-x-blue focus:ring-0" />
);

const StyledSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} className="w-full px-3 py-2 text-base bg-slate-50 dark:bg-x-black border border-x-border rounded-lg placeholder-x-text-secondary focus:outline-none focus:border-x-blue focus:ring-0" />
);

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
    const [localSettings, setLocalSettings] = useState<Settings>(settings);

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const processedValue = type === 'number' ? Number(value) : value;
        setLocalSettings(prev => ({ ...prev, [name]: processedValue }));
    };

    const handleSave = () => {
        onSave(localSettings);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-slate-50 dark:bg-x-black border border-x-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col text-slate-900 dark:text-x-text-primary" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-x-border">
                    <h2 className="text-xl font-bold">Application Settings</h2>
                </div>
                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="p-4 border rounded-lg border-x-border">
                        <h3 className="text-lg font-bold mb-4">Deal Defaults</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <InputGroup label="Default Loan Term (Months)" htmlFor="defaultTerm">
                                <StyledInput type="number" name="defaultTerm" id="defaultTerm" value={localSettings.defaultTerm} onChange={handleChange} />
                            </InputGroup>
                             <InputGroup label="Default Interest Rate (APR %)" htmlFor="defaultApr">
                                <StyledInput type="number" name="defaultApr" id="defaultApr" value={localSettings.defaultApr} onChange={handleChange} step="0.1" />
                            </InputGroup>
                        </div>
                    </div>

                     <div className="p-4 border rounded-lg border-x-border">
                        <h3 className="text-lg font-bold mb-4">Fees & State Tax</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <InputGroup label="Dealership State" htmlFor="defaultState" description="Sets the base for tax calculations.">
                                <StyledSelect name="defaultState" id="defaultState" value={localSettings.defaultState} onChange={handleChange}>
                                    <option value="MI">Michigan</option>
                                    <option value="OH">Ohio</option>
                                    <option value="IN">Indiana</option>
                                </StyledSelect>
                            </InputGroup>
                            <InputGroup label="Doc Fee ($)" htmlFor="docFee">
                                <StyledInput type="number" name="docFee" id="docFee" value={localSettings.docFee} onChange={handleChange} />
                            </InputGroup>
                            <InputGroup label="CVR Fee ($)" htmlFor="cvrFee">
                                <StyledInput type="number" name="cvrFee" id="cvrFee" value={localSettings.cvrFee} onChange={handleChange} />
                            </InputGroup>
                            <InputGroup label="Default State/Title Fees ($)" htmlFor="defaultStateFees">
                                <StyledInput type="number" name="defaultStateFees" id="defaultStateFees" value={localSettings.defaultStateFees} onChange={handleChange} />
                            </InputGroup>
                            <div className="sm:col-span-2">
                                <InputGroup label="Out-of-State Transit Fee ($)" htmlFor="outOfStateTransitFee" description="Applied to out-of-state deals per reciprocal tax agreements.">
                                    <StyledInput type="number" name="outOfStateTransitFee" id="outOfStateTransitFee" value={localSettings.outOfStateTransitFee} onChange={handleChange} />
                                </InputGroup>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-x-border flex justify-end gap-3 bg-slate-50 dark:bg-x-black sticky bottom-0">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="button" onClick={handleSave}>Save Settings</Button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;