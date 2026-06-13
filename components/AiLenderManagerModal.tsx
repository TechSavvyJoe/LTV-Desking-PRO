import React, { useState, useCallback, useRef } from "react";
import type { LenderProfile, Settings } from "../types";
import { processLenderSheet, type ProcessingProgress } from "../services/aiProcessor";
import { saveLenderProfile, updateLenderProfile } from "../lib/api";
import Button from "./common/Button";

interface AiLenderManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfiles: LenderProfile[];
  onUpdateProfiles: React.Dispatch<React.SetStateAction<LenderProfile[]>>;
  onMinimize?: () => void;
  isMinimized?: boolean;
  settings: Settings;
  /** Names of lenders already saved, used to flag silent overwrites in the review step. */
  existingLenderNames?: string[];
  /** Mirrors the internal batch progress so a parent can show it (e.g. while minimized). */
  onProgress?: (progress: number, stage: string) => void;
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

const MinimizeIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="w-5 h-5"
  >
    <path
      fillRule="evenodd"
      d="M14.77 4.21a.75.75 0 01.02 1.06l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 011.08-1.04L10 8.168l3.71-3.938a.75.75 0 011.06-.02z"
      clipRule="evenodd"
    />
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

const getStageIcon = (stage: ProcessingProgress["stage"]) => {
  switch (stage) {
    case "uploading":
      return "📤";
    case "extracting":
      return "🔍";
    case "validating":
      return "✅";
    case "enhancing":
      return "🧠";
    case "complete":
      return "🎉";
    case "error":
      return "❌";
    default:
      return "⏳";
  }
};

const getStageColor = (stage: ProcessingProgress["stage"]) => {
  switch (stage) {
    case "uploading":
      return "text-blue-400";
    case "extracting":
      return "text-yellow-400";
    case "validating":
      return "text-[var(--color-primary)]";
    case "enhancing":
      return "text-[var(--color-primary)]";
    case "complete":
      return "text-green-400";
    case "error":
      return "text-red-400";
    default:
      return "text-x-text-secondary";
  }
};

// Hoisted to module scope so its identity is stable across renders (defining it
// inside the modal's render body caused a full DOM remount on every render).
type ProgressSectionProps = {
  overallProgress: number;
  currentStage: string;
  files: File[];
  fileProgresses: Map<string, ProcessingProgress>;
};

const ProgressSection: React.FC<ProgressSectionProps> = ({
  overallProgress,
  currentStage,
  files,
  fileProgresses,
}) => (
  <div className="space-y-4">
    {/* Overall progress bar */}
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-x-text-primary">Overall Progress</span>
        <span className="text-sm font-bold text-x-blue">{overallProgress}%</span>
      </div>
      <div className="w-full bg-x-hover-dark rounded-full h-3 overflow-hidden">
        <div
          className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-300 ease-out"
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
        const stage = progress?.stage || "uploading";
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
                  stage === "error"
                    ? "bg-red-500"
                    : stage === "complete"
                      ? "bg-green-500"
                      : "bg-[var(--color-primary)]"
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

const AiLenderManagerModal: React.FC<AiLenderManagerModalProps> = ({
  isOpen,
  onClose,
  currentProfiles,
  onUpdateProfiles,
  onMinimize,
  isMinimized,
  settings,
  existingLenderNames,
  onProgress,
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<AiResult[]>([]);
  const [fileProgresses, setFileProgresses] = useState<Map<string, ProcessingProgress>>(new Map());
  const [overallProgress, setOverallProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState<string>("");
  const [enrichWithWebSearch, setEnrichWithWebSearch] = useState<boolean>(true);
  // Keys are `${resultIndex}-${lenderIndex}`; only checked lenders get saved on confirm.
  const [includedLenders, setIncludedLenders] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Set when the user cancels mid-batch so the async analyze loop bails out
  // instead of burning tokens and resurrecting state into a closed modal.
  const cancelledRef = useRef(false);

  const existingNames = existingLenderNames ?? [];

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

  const handleAnalyze = async () => {
    if (files.length === 0) return;
    cancelledRef.current = false;
    setIsLoading(true);
    setResults([]);
    setIncludedLenders(new Set());
    setFileProgresses(new Map());
    setOverallProgress(0);

    const totalFiles = files.length;
    const newResults: AiResult[] = [];

    for (let i = 0; i < files.length; i++) {
      // Bail out silently if the user cancelled mid-batch
      if (cancelledRef.current) return;

      const file = files[i];
      if (!file) continue;

      const baseProgress = (i / totalFiles) * 100;
      const fileWeight = 100 / totalFiles;

      try {
        const lenders = await processLenderSheet(
          file,
          (progress) => {
            if (cancelledRef.current) return;

            // Update individual file progress
            setFileProgresses((prev) => {
              const newMap = new Map(prev);
              newMap.set(file.name, progress);
              return newMap;
            });

            // Update current stage message
            const stageMessage = `${getStageIcon(progress.stage)} ${progress.message}`;
            setCurrentStage(stageMessage);

            // Calculate overall progress
            const fileProgress = (progress.progress / 100) * fileWeight;
            const overall = Math.round(baseProgress + fileProgress);
            setOverallProgress(overall);
            onProgress?.(overall, stageMessage);
          },
          settings.ai,
          { enrich: enrichWithWebSearch }
        );

        // Calculate data quality score
        const totalTiers = lenders.reduce((acc, l) => acc + (l.tiers?.length || 0), 0);
        const tiersWithLtv = lenders.reduce(
          (acc, l) => acc + (l.tiers?.filter((t) => t.maxLtv !== undefined).length || 0),
          0
        );
        const tiersWithTerm = lenders.reduce(
          (acc, l) => acc + (l.tiers?.filter((t) => t.maxTerm !== undefined).length || 0),
          0
        );
        const dataQuality =
          totalTiers > 0
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

    // Bail out silently if the user cancelled while the last file was processing
    if (cancelledRef.current) return;

    // Default every extracted lender to "included" for the review step
    const allKeys = new Set<string>();
    newResults.forEach((result, resultIndex) => {
      if (result.status === "success" && result.lenders) {
        result.lenders.forEach((_, lenderIndex) => {
          allKeys.add(`${resultIndex}-${lenderIndex}`);
        });
      }
    });

    setIncludedLenders(allKeys);
    setResults(newResults);
    setOverallProgress(100);
    setCurrentStage("🎉 All files processed!");
    setIsLoading(false);
    onProgress?.(0, "");
  };

  const toggleLenderIncluded = (key: string) => {
    setIncludedLenders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    // Flatten only the lenders the user left checked in the review step
    const allLenders: Partial<LenderProfile>[] = [];
    results.forEach((result, resultIndex) => {
      if (result.status === "success" && result.lenders && result.lenders.length > 0) {
        result.lenders.forEach((lender, lenderIndex) => {
          if (includedLenders.has(`${resultIndex}-${lenderIndex}`)) {
            allLenders.push(lender);
          }
        });
      }
    });

    if (allLenders.length === 0) return;

    setIsLoading(true);
    setCurrentStage("💾 Saving lenders to database...");

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
        console.error("Error saving lender:", newProfileData.name, error);
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
      setCurrentStage(`✅ Complete: ${messages.join(", ")}`);
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
    setIncludedLenders(new Set());
    setFileProgresses(new Map());
    setOverallProgress(0);
    setCurrentStage("");
  };

  const handleClose = () => {
    // Abort any in-flight batch so the analyze loop stops burning tokens
    // and stops resurrecting state into a closed modal.
    cancelledRef.current = true;
    onProgress?.(0, "");
    resetState();
    onClose();
  };

  // Selection summary for the review step
  const totalExtractedLenders = results.reduce(
    (acc, r) => acc + (r.status === "success" && r.lenders ? r.lenders.length : 0),
    0
  );
  const selectedLenderCount = includedLenders.size;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-950/60 flex justify-center items-center z-50 p-4"
      // While a batch is running, an accidental backdrop tap must not kill it —
      // cancelling requires an explicit Cancel click.
      onClick={isLoading ? undefined : handleClose}
    >
      <div
        className="bg-x-black border border-x-border rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex justify-between items-center border-b border-x-border">
          <h2 className="text-xl font-bold text-x-text-primary">AI Lender Upload</h2>
          <div className="flex items-center gap-2">
            {isLoading && onMinimize && (
              <button
                onClick={onMinimize}
                className="p-2 rounded-full text-x-text-secondary hover:bg-x-hover-light hover:text-blue-400 transition-colors"
                title="Minimize - Processing will continue in background"
              >
                <MinimizeIcon />
              </button>
            )}
            <button
              onClick={isLoading && onMinimize ? onMinimize : handleClose}
              className="p-2 rounded-full text-x-text-secondary hover:bg-x-hover-light"
              title={isLoading ? "Minimize to background" : "Close"}
            >
              {isLoading ? <MinimizeIcon /> : <CloseIcon />}
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-grow">
          {/* Show progress UI while loading */}
          {isLoading ? (
            <ProgressSection
              overallProgress={overallProgress}
              currentStage={currentStage}
              files={files}
              fileProgresses={fileProgresses}
            />
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
                  <span className="font-semibold text-x-blue">Click to upload</span> or drag and
                  drop PDF rate sheets.
                </p>
              </div>
              {files.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-semibold text-x-text-primary mb-2">Selected Files:</h4>
                  <ul className="space-y-1 text-sm list-disc list-inside text-x-text-secondary">
                    {files.map((file, i) => (
                      <li key={i}>{file.name}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex items-start gap-3 p-3 rounded-lg bg-x-hover-dark border border-x-border">
                <input
                  id="enrich-toggle"
                  type="checkbox"
                  checked={enrichWithWebSearch}
                  onChange={(e) => setEnrichWithWebSearch(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-blue-500"
                />
                <label htmlFor="enrich-toggle" className="text-sm cursor-pointer">
                  <span className="font-medium text-x-text-primary">
                    Enrich missing bank data via web search
                  </span>
                  <span className="block text-xs text-x-text-secondary mt-1">
                    After extracting the rate sheet, search the web (Gemini grounding) to fill in
                    any missing contact info, website, portal URL, or general bank notes. Sources
                    are cited. Adds ~10–20s per file.
                  </span>
                </label>
              </div>
            </>
          ) : (
            <div>
              <h3 className="text-lg font-semibold text-x-text-primary mb-3">Analysis Results</h3>
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
                          ✓ Successfully extracted{" "}
                          <strong className="font-bold">{res.lenders.length}</strong> lender(s)
                        </p>
                        {res.lenders.map((lender, j) => {
                          const lenderKey = `${i}-${j}`;
                          const isIncluded = includedLenders.has(lenderKey);
                          const lenderName = (lender.name ?? "").trim().toLowerCase();
                          const matchedExisting = lenderName
                            ? existingNames.find((n) => n.trim().toLowerCase() === lenderName)
                            : undefined;

                          return (
                            <div
                              key={j}
                              className={`bg-x-black/40 rounded-md p-3 border border-x-border/50 ${
                                isIncluded ? "" : "opacity-60"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isIncluded}
                                    onChange={() => toggleLenderIncluded(lenderKey)}
                                    className="w-4 h-4 accent-blue-500"
                                    aria-label={`Include ${lender.name || "this lender"} in the update`}
                                  />
                                  <span className="font-semibold text-x-text-primary text-sm">
                                    🏦 {lender.name}
                                  </span>
                                </label>
                                {matchedExisting && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    {`Will update existing '${matchedExisting}'`}
                                  </span>
                                )}
                              </div>
                              {lender.effectiveDate ? (
                                <p className="text-xs text-x-text-secondary mb-2">
                                  <strong>Effective:</strong> {lender.effectiveDate}
                                </p>
                              ) : (
                                <p className="text-xs text-x-text-secondary/60 italic mb-2">
                                  No effective date on sheet
                                </p>
                              )}
                              {(lender.contactPhone ||
                                lender.contactEmail ||
                                lender.website ||
                                lender.portalUrl ||
                                lender.generalNotes) && (
                                <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-x-text-secondary border-l-2 border-[var(--color-primary)]/40 pl-3">
                                  {lender.contactName && (
                                    <span>
                                      <strong>Contact:</strong> {lender.contactName}
                                    </span>
                                  )}
                                  {lender.contactPhone && (
                                    <span>
                                      <strong>Phone:</strong> {lender.contactPhone}
                                    </span>
                                  )}
                                  {lender.contactEmail && (
                                    <span className="truncate">
                                      <strong>Email:</strong> {lender.contactEmail}
                                    </span>
                                  )}
                                  {lender.website && (
                                    <span className="truncate">
                                      <strong>Site:</strong>{" "}
                                      <a
                                        href={lender.website}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-blue-400 hover:underline"
                                      >
                                        {lender.website}
                                      </a>
                                    </span>
                                  )}
                                  {lender.portalUrl && (
                                    <span className="truncate">
                                      <strong>Portal:</strong>{" "}
                                      <a
                                        href={lender.portalUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-blue-400 hover:underline"
                                      >
                                        {lender.portalUrl}
                                      </a>
                                    </span>
                                  )}
                                  {lender.generalNotes && (
                                    <span className="sm:col-span-2 italic text-x-text-secondary/80">
                                      {lender.generalNotes}
                                    </span>
                                  )}
                                </div>
                              )}
                              {lender.enrichmentSources && lender.enrichmentSources.length > 0 && (
                                <div className="mb-3 flex flex-wrap gap-1.5 items-center text-[10px]">
                                  <span className="text-x-text-secondary">🔎 Sources:</span>
                                  {lender.enrichmentSources.slice(0, 5).map((src, idx) => (
                                    <a
                                      key={idx}
                                      href={src.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      title={src.title || src.url}
                                      className="px-2 py-0.5 rounded-full bg-[var(--color-primary-subtle)] border border-[var(--color-primary)]/30 text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] truncate max-w-[180px]"
                                    >
                                      {(() => {
                                        try {
                                          return new URL(src.url).hostname.replace(/^www\./, "");
                                        } catch {
                                          return src.url;
                                        }
                                      })()}
                                    </a>
                                  ))}
                                  {lender.enrichmentSources.length > 5 && (
                                    <span className="text-x-text-secondary">
                                      +{lender.enrichmentSources.length - 5} more
                                    </span>
                                  )}
                                </div>
                              )}
                              {lender.tiers && lender.tiers.length > 0 ? (
                                <div className="space-y-2">
                                  <p className="text-xs text-x-text-secondary">
                                    {lender.tiers.length} credit tier(s) extracted:
                                  </p>
                                  <div className="grid gap-2 max-h-64 overflow-y-auto pr-1">
                                    {lender.tiers.map((tier, k) => {
                                      // Calculate data completeness
                                      const fields = [
                                        tier.maxLtv,
                                        tier.minFico,
                                        tier.maxFico,
                                        tier.minYear,
                                        tier.maxYear,
                                        tier.minTerm,
                                        tier.maxTerm,
                                        tier.minMileage,
                                        tier.maxMileage,
                                      ];
                                      const filledFields = fields.filter(
                                        (f) => f !== undefined && f !== null
                                      ).length;
                                      const completeness = Math.round(
                                        (filledFields / fields.length) * 100
                                      );

                                      return (
                                        <div
                                          key={k}
                                          className="bg-x-hover-dark rounded p-2 text-xs"
                                        >
                                          <div className="flex justify-between items-center mb-1">
                                            <span className="font-medium text-x-blue">
                                              {/* Extraction populates `name`, not
                                                `tierName` — show it so review
                                                isn't all "Tier 1/2/3". */}
                                              {tier.tierName || tier.name || `Tier ${k + 1}`}
                                            </span>
                                            <span
                                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                                completeness >= 80
                                                  ? "bg-green-500/20 text-green-300"
                                                  : completeness >= 50
                                                    ? "bg-yellow-500/20 text-yellow-300"
                                                    : "bg-red-500/20 text-red-300"
                                              }`}
                                            >
                                              {completeness}% complete
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-x-text-secondary">
                                            {tier.minFico !== undefined &&
                                              tier.maxFico !== undefined && (
                                                <span>
                                                  FICO: {tier.minFico}-{tier.maxFico}
                                                </span>
                                              )}
                                            {tier.maxLtv !== undefined && (
                                              <span>Max LTV: {tier.maxLtv}%</span>
                                            )}
                                            {tier.minYear !== undefined &&
                                              tier.maxYear !== undefined && (
                                                <span>
                                                  Years: {tier.minYear}-{tier.maxYear}
                                                </span>
                                              )}
                                            {tier.minTerm !== undefined &&
                                              tier.maxTerm !== undefined && (
                                                <span>
                                                  Terms: {tier.minTerm}-{tier.maxTerm}mo
                                                </span>
                                              )}
                                            {tier.maxMileage !== undefined && (
                                              <span>
                                                Max Miles: {tier.maxMileage.toLocaleString()}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-yellow-300">
                                  ⚠️ No credit tiers extracted
                                </p>
                              )}
                            </div>
                          );
                        })}
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
                ? "Review the results above, uncheck any lenders to skip, and confirm."
                : `${files.length} file(s) ready for analysis.`}
          </p>
          <div className="flex gap-3 items-center">
            {!isLoading && results.length > 0 && (
              <span className="text-xs text-x-text-secondary whitespace-nowrap">
                {selectedLenderCount} of {totalExtractedLenders} selected
              </span>
            )}
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            {results.length > 0 ? (
              <Button onClick={handleConfirm} disabled={isLoading || selectedLenderCount === 0}>
                Confirm and Update
              </Button>
            ) : (
              <Button onClick={handleAnalyze} disabled={isLoading || files.length === 0}>
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
