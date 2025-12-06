import React, { useState, useCallback, useRef } from "react";
import type { LenderProfile } from "../types";
import { processLenderSheet, type ProcessingProgress } from "../services/aiProcessor";
import { saveLenderProfile, updateLenderProfile } from "../lib/api";
import Button from "./common/Button";

interface AiLenderManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfiles: LenderProfile[];
  onUpdateProfiles: React.Dispatch<React.SetStateAction<LenderProfile[]>>;
}

type AiResult = {
  fileName: string;
  status: "success" | "error";
  lenders?: Partial<LenderProfile>[];
  error?: string;
  dataQuality?: number;
};

type FileProgress = {
  fileName: string;
  progress: ProcessingProgress;
};

const CloseIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="w-5 h-5"
  >
    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
  </svg>
);

const UploadIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-10 w-10 text-slate-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
    />
  </svg>
);

const AiLenderManagerModal: React.FC<AiLenderManagerModalProps> = ({
  isOpen,
  onClose,
  currentProfiles,
  onUpdateProfiles,
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<AiResult[]>([]);
  const [fileProgresses, setFileProgresses] = useState<Map<string, ProcessingProgress>>(new Map());
  const [overallProgress, setOverallProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
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
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files!)]);
    }
  };

  const getStageIcon = (stage: ProcessingProgress['stage']) => {
    switch (stage) {
      case 'uploading':
        return '📤';
      case 'extracting':
        return '🔍';
      case 'validating':
        return '✅';
      case 'enhancing':
        return '🧠';
      case 'complete':
        return '🎉';
      case 'error':
        return '❌';
      default:
        return '⏳';
    }
  };

  const getStageColor = (stage: ProcessingProgress['stage']) => {
    switch (stage) {
      case 'uploading':
        return 'text-blue-400';
      case 'extracting':
        return 'text-yellow-400';
      case 'validating':
        return 'text-purple-400';
      case 'enhancing':
        return 'text-cyan-400';
      case 'complete':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-x-text-secondary';
    }
  };

  const handleAnalyze = async () => {
    if (files.length === 0) return;
    setIsLoading(true);
    setResults([]);
    setFileProgresses(new Map());
    setOverallProgress(0);

    const totalFiles = files.length;
    const newResults: AiResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      
      const baseProgress = (i / totalFiles) * 100;
      const fileWeight = 100 / totalFiles;

      try {
        const lenders = await processLenderSheet(file, (progress) => {
          // Update individual file progress
          setFileProgresses(prev => {
            const newMap = new Map(prev);
            newMap.set(file.name, progress);
            return newMap;
          });

          // Update current stage message
          setCurrentStage(`${getStageIcon(progress.stage)} ${progress.message}`);

          // Calculate overall progress
          const fileProgress = (progress.progress / 100) * fileWeight;
          setOverallProgress(Math.round(baseProgress + fileProgress));
        });

        // Calculate data quality score
        const totalTiers = lenders.reduce((acc, l) => acc + (l.tiers?.length || 0), 0);
        const tiersWithLtv = lenders.reduce((acc, l) => 
          acc + (l.tiers?.filter(t => t.maxLtv !== undefined).length || 0), 0);
        const tiersWithTerm = lenders.reduce((acc, l) => 
          acc + (l.tiers?.filter(t => t.maxTerm !== undefined).length || 0), 0);
        const dataQuality = totalTiers > 0 
          ? Math.round(((tiersWithLtv + tiersWithTerm) / (totalTiers * 2)) * 100) 
          : 0;

        newResults.push({
          fileName: file.name,
          status: "success",
          lenders,
          dataQuality,
        });
      } catch (error) {
        newResults.push({
          fileName: file.name,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown processing error.",
        });
      }
    }

    setResults(newResults);
    setOverallProgress(100);
    setCurrentStage('🎉 All files processed!');
    setIsLoading(false);
  };

  const handleConfirm = async () => {
    // Flatten all lenders from all successful results
    const allLenders: Partial<LenderProfile>[] = [];
    results.forEach((result) => {
      if (result.status === "success" && result.lenders && result.lenders.length > 0) {
        allLenders.push(...result.lenders);
      }
    });

    if (allLenders.length === 0) return;

    setIsLoading(true);
    setCurrentStage('💾 Saving lenders to database...');

    let savedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    // Process each lender and save to PocketBase
    for (const newProfileData of allLenders) {
      if (!newProfileData.name) continue;

      try {
        // Check if lender already exists
        const existingProfile = currentProfiles.find(
          (p) => p.name.toLowerCase() === newProfileData.name!.toLowerCase()
        );

        if (existingProfile) {
          // Update existing profile in PocketBase
          const updatedProfile = await updateLenderProfile(existingProfile.id, {
            ...newProfileData,
            tiers: newProfileData.tiers || existingProfile.tiers,
          });
          
          if (updatedProfile) {
            // Update local state
            onUpdateProfiles((prev) =>
              prev.map((p) =>
                p.id === existingProfile.id ? (updatedProfile as unknown as LenderProfile) : p
              )
            );
            updatedCount++;
          } else {
            errorCount++;
          }
        } else {
          // Create new profile in PocketBase
          const { id, ...createData } = newProfileData as any;
          const savedProfile = await saveLenderProfile({
            ...createData,
            name: newProfileData.name,
            active: true,
            tiers: newProfileData.tiers || [],
          } as any);

          if (savedProfile) {
            // Add to local state
            onUpdateProfiles((prev) => [...prev, savedProfile as unknown as LenderProfile]);
            savedCount++;
          } else {
            errorCount++;
          }
        }
      } catch (error) {
        console.error('Error saving lender:', newProfileData.name, error);
        errorCount++;
      }
    }

    setIsLoading(false);
    
    // Show summary message
    const messages = [];
    if (savedCount > 0) messages.push(`${savedCount} new lender(s) saved`);
    if (updatedCount > 0) messages.push(`${updatedCount} lender(s) updated`);
    if (errorCount > 0) messages.push(`${errorCount} error(s)`);
    
    if (messages.length > 0) {
      setCurrentStage(`✅ Complete: ${messages.join(', ')}`);
    }

    // Close after brief delay to show completion message
    setTimeout(() => {
      onClose();
      resetState();
    }, 1500);
  };

  const resetState = () => {
    setFiles([]);
    setIsLoading(false);
    setResults([]);
    setFileProgresses(new Map());
    setOverallProgress(0);
    setCurrentStage('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  if (!isOpen) return null;

  // Progress bar component
  const ProgressSection = () => (
    <div className="space-y-4">
      {/* Overall progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-x-text-primary">Overall Progress</span>
          <span className="text-sm font-bold text-x-blue">{overallProgress}%</span>
        </div>
        <div className="w-full bg-x-hover-dark rounded-full h-3 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Current stage message */}
      {currentStage && (
        <div className="text-center py-2">
          <p className="text-sm text-x-text-secondary animate-pulse">{currentStage}</p>
        </div>
      )}

      {/* Individual file progress */}
      <div className="space-y-3 mt-4">
        {files.map((file, index) => {
          const progress = fileProgresses.get(file.name);
          const stage = progress?.stage || 'uploading';
          const stageProgress = progress?.progress || 0;
          
          return (
            <div key={index} className="bg-x-hover-dark rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getStageIcon(stage)}</span>
                  <span className="text-sm font-medium text-x-text-primary truncate max-w-[200px]">
                    {file.name}
                  </span>
                </div>
                <span className={`text-xs font-semibold ${getStageColor(stage)}`}>
                  {stage.charAt(0).toUpperCase() + stage.slice(1)}
                </span>
              </div>
              <div className="w-full bg-x-black rounded-full h-2 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${
                    stage === 'error' ? 'bg-red-500' :
                    stage === 'complete' ? 'bg-green-500' :
                    'bg-gradient-to-r from-blue-500 to-purple-500'
                  }`}
                  style={{ width: `${stageProgress}%` }}
                />
              </div>
              {progress?.message && (
                <p className="text-xs text-x-text-secondary mt-1 truncate">{progress.message}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Processing stages legend */}
      <div className="flex flex-wrap justify-center gap-3 mt-4 pt-4 border-t border-x-border">
        <div className="flex items-center gap-1 text-xs text-x-text-secondary">
          <span>📤</span> Upload
        </div>
        <div className="flex items-center gap-1 text-xs text-x-text-secondary">
          <span>🔍</span> Extract
        </div>
        <div className="flex items-center gap-1 text-xs text-x-text-secondary">
          <span>✅</span> Validate
        </div>
        <div className="flex items-center gap-1 text-xs text-x-text-secondary">
          <span>🧠</span> Enhance
        </div>
        <div className="flex items-center gap-1 text-xs text-x-text-secondary">
          <span>🎉</span> Complete
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-x-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-x-black border border-x-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex justify-between items-center border-b border-x-border">
          <h2 className="text-xl font-bold text-x-text-primary">
            AI Lender Upload
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-full text-x-text-secondary hover:bg-x-hover-light"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-grow">
          {/* Show progress UI while loading */}
          {isLoading ? (
            <ProgressSection />
          ) : results.length === 0 ? (
            <>
              <div
                className="border-2 border-dashed border-x-border rounded-lg p-8 text-center cursor-pointer hover:border-x-blue bg-x-hover-dark transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".pdf"
                  multiple
                />
                <UploadIcon />
                <p className="mt-2 text-sm text-x-text-secondary">
                  <span className="font-semibold text-x-blue">
                    Click to upload
                  </span>{" "}
                  or drag and drop PDF rate sheets.
                </p>
              </div>
              {files.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-semibold text-x-text-primary mb-2">
                    Selected Files:
                  </h4>
                  <ul className="space-y-1 text-sm list-disc list-inside text-x-text-secondary">
                    {files.map((file, i) => (
                      <li key={i}>{file.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div>
              <h3 className="text-lg font-semibold text-x-text-primary mb-3">
                Analysis Results
              </h3>
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {results.map((res, i) => (
                  <div
                    key={i}
                    className={`p-4 rounded-lg border ${
                      res.status === "success"
                        ? "bg-green-900/20 border-green-500/30"
                        : "bg-red-900/20 border-red-500/30"
                    }`}
                  >
                    <p className="font-semibold text-sm text-x-text-primary mb-2">
                      📄 {res.fileName}
                    </p>
                    {res.status === "success" && res.lenders ? (
                      <div className="space-y-3">
                        <p className="text-xs text-green-300">
                          ✓ Successfully extracted <strong className="font-bold">{res.lenders.length}</strong> lender(s)
                        </p>
                        {res.lenders.map((lender, j) => (
                          <div key={j} className="bg-x-black/40 rounded-md p-3 border border-x-border/50">
                            <p className="font-semibold text-x-text-primary text-sm mb-2">
                              🏦 {lender.name}
                            </p>
                            {lender.tiers && lender.tiers.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs text-x-text-secondary">
                                  {lender.tiers.length} credit tier(s) extracted:
                                </p>
                                <div className="grid gap-2">
                                  {lender.tiers.slice(0, 4).map((tier, k) => {
                                    // Calculate data completeness
                                    const fields = [
                                      tier.maxLtv, tier.minFico, tier.maxFico,
                                      tier.minYear, tier.maxYear, tier.minTerm, tier.maxTerm,
                                      tier.minMileage, tier.maxMileage
                                    ];
                                    const filledFields = fields.filter(f => f !== undefined && f !== null).length;
                                    const completeness = Math.round((filledFields / fields.length) * 100);
                                    
                                    return (
                                      <div key={k} className="bg-x-hover-dark rounded p-2 text-xs">
                                        <div className="flex justify-between items-center mb-1">
                                          <span className="font-medium text-x-blue">{tier.tierName || `Tier ${k + 1}`}</span>
                                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                            completeness >= 80 ? 'bg-green-500/20 text-green-300' :
                                            completeness >= 50 ? 'bg-yellow-500/20 text-yellow-300' :
                                            'bg-red-500/20 text-red-300'
                                          }`}>
                                            {completeness}% complete
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-x-text-secondary">
                                          {tier.minFico !== undefined && tier.maxFico !== undefined && (
                                            <span>FICO: {tier.minFico}-{tier.maxFico}</span>
                                          )}
                                          {tier.maxLtv !== undefined && (
                                            <span>Max LTV: {tier.maxLtv}%</span>
                                          )}
                                          {tier.minYear !== undefined && tier.maxYear !== undefined && (
                                            <span>Years: {tier.minYear}-{tier.maxYear}</span>
                                          )}
                                          {tier.minTerm !== undefined && tier.maxTerm !== undefined && (
                                            <span>Terms: {tier.minTerm}-{tier.maxTerm}mo</span>
                                          )}
                                          {tier.maxMileage !== undefined && (
                                            <span>Max Miles: {tier.maxMileage.toLocaleString()}</span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {lender.tiers.length > 4 && (
                                    <p className="text-xs text-x-text-secondary italic">
                                      +{lender.tiers.length - 4} more tier(s)...
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-yellow-300">⚠️ No credit tiers extracted</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-red-300">❌ Error: {res.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-x-border flex justify-between items-center">
          <p className="text-sm text-x-text-secondary">
            {isLoading
              ? "AI is analyzing documents... please wait."
              : results.length > 0
              ? "Review the results above and confirm."
              : `${files.length} file(s) ready for analysis.`}
          </p>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            {results.length > 0 ? (
              <Button
                onClick={handleConfirm}
                disabled={
                  isLoading || results.every((r) => r.status === "error")
                }
              >
                Confirm and Update
              </Button>
            ) : (
              <Button
                onClick={handleAnalyze}
                disabled={isLoading || files.length === 0}
              >
                Analyze
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiLenderManagerModal;
