
import React, { useState, useCallback, useRef } from 'react';
import type { LenderProfile } from '../types';
import { processLenderSheet } from '../services/aiProcessor';
import Button from './common/Button';

interface AiLenderManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentProfiles: LenderProfile[];
    onUpdateProfiles: React.Dispatch<React.SetStateAction<LenderProfile[]>>;
}

type AiResult = {
    fileName: string;
    status: 'success' | 'error';
    data?: Partial<LenderProfile>;
    error?: string;
};

const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
);

const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-x-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
);


const AiLenderManagerModal: React.FC<AiLenderManagerModalProps> = ({ isOpen, onClose, currentProfiles, onUpdateProfiles }) => {
    const [files, setFiles] = useState<File[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<AiResult[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files) {
             setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files!)]);
        }
    };

    const handleAnalyze = async () => {
        if (files.length === 0) return;
        setIsLoading(true);
        setResults([]);
        
        const analysisPromises = files.map(file => 
            processLenderSheet(file).then(data => ({
                fileName: file.name,
                status: 'success',
                data,
            })).catch(error => ({
                fileName: file.name,
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown processing error.',
            }))
        );

        const settledResults = await Promise.all(analysisPromises);
        setResults(settledResults as AiResult[]);
        setIsLoading(false);
    };

    const handleConfirm = () => {
        const successfulResults = results.filter(r => r.status === 'success' && r.data && r.data.name);
        if (successfulResults.length === 0) return;
        
        onUpdateProfiles(prevProfiles => {
            let updatedProfiles = [...prevProfiles];
            successfulResults.forEach(result => {
                const newProfileData = result.data!;
                const existingProfileIndex = updatedProfiles.findIndex(p => p.name.toLowerCase() === newProfileData.name!.toLowerCase());

                if (existingProfileIndex > -1) {
                    // Update existing profile, preserving ID
                    updatedProfiles[existingProfileIndex] = { ...updatedProfiles[existingProfileIndex], ...newProfileData };
                } else {
                    // Add new profile
                    updatedProfiles.push({ id: `ai_${Date.now()}_${Math.random()}`, ...newProfileData } as LenderProfile);
                }
            });
            return updatedProfiles;
        });
        
        onClose();
        resetState();
    };

    const resetState = () => {
        setFiles([]);
        setIsLoading(false);
        setResults([]);
    };
    
    const handleClose = () => {
        resetState();
        onClose();
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-x-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={handleClose}>
            <div className="bg-x-black border border-x-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 flex justify-between items-center border-b border-x-border">
                    <h2 className="text-xl font-bold text-x-text-primary">AI Lender Profile Manager</h2>
                    <button onClick={handleClose} className="p-2 rounded-full text-x-text-secondary hover:bg-x-hover-light"><CloseIcon /></button>
                </div>

                <div className="p-6 overflow-y-auto flex-grow">
                    {results.length === 0 ? (
                        <>
                            <div 
                                className="border-2 border-dashed border-x-border rounded-lg p-8 text-center cursor-pointer hover:border-x-blue bg-x-hover-dark transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                            >
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf" multiple />
                                <UploadIcon />
                                <p className="mt-2 text-sm text-x-text-secondary">
                                    <span className="font-semibold text-x-blue">Click to upload</span> or drag and drop PDF rate sheets.
                                </p>
                            </div>
                            {files.length > 0 && (
                                <div className="mt-4">
                                    <h4 className="font-semibold text-x-text-primary mb-2">Selected Files:</h4>
                                    <ul className="space-y-1 text-sm list-disc list-inside text-x-text-secondary">
                                        {files.map((file, i) => <li key={i}>{file.name}</li>)}
                                    </ul>
                                </div>
                            )}
                        </>
                    ) : (
                         <div>
                            <h3 className="text-lg font-semibold text-x-text-primary mb-3">Analysis Results</h3>
                            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                                {results.map((res, i) => (
                                    <div key={i} className={`p-3 rounded-md border ${res.status === 'success' ? 'bg-green-900/20 border-green-500/30' : 'bg-red-900/20 border-red-500/30'}`}>
                                        <p className="font-semibold text-sm text-x-text-primary">{res.fileName}</p>
                                        {res.status === 'success' ? (
                                            <p className="text-xs text-green-300">Successfully extracted data for: <strong className="font-bold">{res.data?.name || 'Unknown Lender'}</strong></p>
                                        ) : (
                                            <p className="text-xs text-red-300">Error: {res.error}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-x-border flex justify-between items-center">
                    <p className="text-sm text-x-text-secondary">{isLoading ? 'AI is analyzing documents... please wait.' : (results.length > 0 ? 'Review the results above and confirm.' : `${files.length} file(s) ready for analysis.`)}</p>
                    <div className="flex gap-3">
                         <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
                         {results.length > 0 ? (
                            <Button onClick={handleConfirm} disabled={isLoading || results.every(r => r.status === 'error')}>Confirm and Update</Button>
                         ) : (
                            <Button onClick={handleAnalyze} disabled={isLoading || files.length === 0}>Analyze</Button>
                         )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AiLenderManagerModal;