import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { ProcessingProgress } from "../services/aiProcessor";
import type { LenderProfile } from "../types";

/**
 * @deprecated DEAD / UNINTEGRATED
 *
 * This BackgroundUploadStore + Provider + hook are **completely unused**.
 * - No imports of BackgroundUploadProvider anywhere in the app tree (index/App/Shell).
 * - useBackgroundUpload() is never called.
 * - The store was apparently intended to drive background AI lender uploads
 *   (see aiProcessor + AiLenderManagerModal), but never wired.
 *
 * Current reality (as of cleanup):
 * - AiLenderManagerModal manages its own progress internally and calls an
 *   onProgress prop (which AppShell never passes).
 * - BackgroundUploadIndicator is a pure presentational component driven by
 *   local stub state in AppShell (aiUploadProgress always {progress:0, stage:""}).
 * - Indicator is shown with crude `isProcessing={isAiModalOpen}`.
 *
 * Per task: "Remove or properly integrate the dead BackgroundUploadStore".
 * - DO NOT USE this. It is kept only to avoid breaking any stray references.
 * - Safe to delete the file + any vestigial types once a real background
 *   upload state (or removal of the minimized indicator) is decided.
 * - See PRODUCTION_READINESS_PLAN state cleanup + AppShell for indicator usage.
 */

export type UploadResult = {
  fileName: string;
  status: "success" | "error";
  lenders?: Partial<LenderProfile>[];
  error?: string;
};

interface BackgroundUploadState {
  isProcessing: boolean;
  files: File[];
  results: UploadResult[];
  fileProgresses: Map<string, ProcessingProgress>;
  overallProgress: number;
  currentStage: string;
  isMinimized: boolean;
}

interface BackgroundUploadContextValue extends BackgroundUploadState {
  minimizeModal: () => void;
  restoreModal: () => void;
  setIsMinimized: (val: boolean) => void;
}

const initialState: BackgroundUploadState = {
  isProcessing: false,
  files: [],
  results: [],
  fileProgresses: new Map(),
  overallProgress: 0,
  currentStage: "",
  isMinimized: false,
};

const BackgroundUploadContext = createContext<BackgroundUploadContextValue | null>(null);

export const BackgroundUploadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<BackgroundUploadState>(initialState);

  const minimizeModal = useCallback(() => {
    setState((prev) => ({ ...prev, isMinimized: true }));
  }, []);

  const restoreModal = useCallback(() => {
    setState((prev) => ({ ...prev, isMinimized: false }));
  }, []);

  const setIsMinimized = useCallback((val: boolean) => {
    setState((prev) => ({ ...prev, isMinimized: val }));
  }, []);

  return (
    <BackgroundUploadContext.Provider
      value={{
        ...state,
        minimizeModal,
        restoreModal,
        setIsMinimized,
      }}
    >
      {children}
    </BackgroundUploadContext.Provider>
  );
};

export const useBackgroundUpload = (): BackgroundUploadContextValue | null => {
  return useContext(BackgroundUploadContext);
};
