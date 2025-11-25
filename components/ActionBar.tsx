
import React, { useRef } from 'react';
import Button from './common/Button';
import type { CalculatedVehicle, DealData, FilterData, LenderProfile, Settings } from '../types';
import { generateFavoritesPdf } from '../services/pdfGenerator';
import { checkBankEligibility } from '../services/lenderMatcher';
import * as Icons from './common/Icons';

interface ActionBarProps {
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileName: string;
  onSaveDeal: () => void;
  onClearDeal: () => void;
  activeVehicle: CalculatedVehicle | null;
  isDealDirty: boolean;
  visibleData: CalculatedVehicle[];
  favoritesData: CalculatedVehicle[];
  dealData: DealData; 
  customerFilters: FilterData; 
  lenderProfiles: LenderProfile[]; 
  customerName: string; 
  salespersonName: string; 
  settings: Settings;
}

const ActionBar: React.FC<ActionBarProps> = ({ 
    onFileChange, fileName, onSaveDeal, onClearDeal, activeVehicle, isDealDirty, 
    visibleData, favoritesData, dealData, customerFilters, lenderProfiles,
    customerName, salespersonName, settings
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isShareSupported = typeof navigator !== 'undefined' && !!navigator.share;

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const prepareFavoritesPdfData = () => {
        // Strict defensive check for lenderProfiles array
        const safeProfiles = Array.isArray(lenderProfiles) ? lenderProfiles : [];
        
        return favoritesData.map(vehicle => {
            const lenderEligibility = safeProfiles.map(bank => ({
                name: bank.name,
                ...checkBankEligibility(vehicle, { ...dealData, ...customerFilters }, bank)
            }));
            return { vehicle, dealData, customerFilters, customerName, salespersonName, lenderEligibility };
        });
    };

    const handleDownloadFavoritesPdf = async () => {
        if (favoritesData.length === 0) return alert("No favorites to generate a PDF for.");
        const pdfData = prepareFavoritesPdfData();
        const blob = await generateFavoritesPdf(pdfData, settings);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 100);
    };

    const handleShareFavoritesPdf = async () => {
        if (favoritesData.length === 0) return alert("No favorites to share.");
        const pdfData = prepareFavoritesPdfData();
        const blob = await generateFavoritesPdf(pdfData, settings);
        const file = new File([blob], 'Favorites_Deal_Sheets.pdf', { type: 'application/pdf' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: 'Favorites Deal Summary',
                    text: 'Here are the vehicle options we discussed.',
                    files: [file],
                });
            } catch (error) {
                console.error('Error sharing:', error);
            }
        } else {
            alert("Sharing of this file type is not supported on your device.");
        }
    };

    const exportToCsv = (data: CalculatedVehicle[], filename: string) => {
        if (!data || data.length === 0) return alert("No data to export.");
        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(row => 
            Object.values(row).map(value => {
                const stringValue = String(value ?? '');
                if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            }).join(',')
        );
        const csvString = [headers, ...rows].join('\r\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="flex flex-wrap justify-between items-center mb-4 gap-4 py-4 border-b border-x-border">
            <div className="flex items-center gap-4">
                <input type="file" ref={fileInputRef} onChange={onFileChange} className="hidden" accept=".csv,.txt,.xls,.xlsx" />
                <Button variant="secondary" onClick={handleUploadClick}><Icons.UploadIcon /> Upload</Button>
                <span className="text-sm text-x-text-secondary">{fileName}</span>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button onClick={onSaveDeal} disabled={!activeVehicle} title={!activeVehicle ? "Select a vehicle and structure a deal first" : (isDealDirty ? "Save current changes" : "Deal is saved")}>
                    {isDealDirty ? 'Save Deal' : 'Deal Saved'}
                </Button>
                <Button variant="secondary" onClick={onClearDeal}>Clear</Button>
                <Button variant="ghost" onClick={() => exportToCsv(visibleData, 'visible_inventory.csv')} disabled={visibleData.length === 0}>Export Visible</Button>
                <Button variant="ghost" onClick={handleDownloadFavoritesPdf} disabled={favoritesData.length === 0}>View Favs PDF</Button>
                {isShareSupported && <Button variant="ghost" onClick={handleShareFavoritesPdf} disabled={favoritesData.length === 0}>Share Favs</Button>}
            </div>
        </div>
    );
};

export default ActionBar;
