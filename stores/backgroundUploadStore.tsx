import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import type { ProcessingProgress } from "../services/aiProcessor";
import type { LenderProfile } from "../types";

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

const BackgroundUploadContext =
  createContext<BackgroundUploadContextValue | null>(null);

export const BackgroundUploadProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
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
