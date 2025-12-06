import React from "react";

interface BackgroundUploadIndicatorProps {
  isProcessing: boolean;
  isMinimized: boolean;
  overallProgress: number;
  currentStage: string;
  onRestore: () => void;
}

const BackgroundUploadIndicator: React.FC<BackgroundUploadIndicatorProps> = ({
  isProcessing,
  isMinimized,
  overallProgress,
  currentStage,
  onRestore,
}) => {
  if (!isProcessing || !isMinimized) return null;

  return (
    <button
      onClick={onRestore}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 group"
      title="Click to view upload progress"
    >
      <div className="relative w-8 h-8">
        <svg
          className="absolute inset-0 w-8 h-8 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${overallProgress * 0.628} 62.8`}
            strokeLinecap="round"
            className="transition-all duration-300"
            style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
      </div>

      <div className="flex flex-col items-start min-w-0">
        <span className="text-sm font-semibold">
          AI Processing {overallProgress}%
        </span>
        <span className="text-xs opacity-75 truncate max-w-[150px]">
          {currentStage || "Working..."}
        </span>
      </div>

      <svg
        className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
        />
      </svg>
    </button>
  );
};

export default BackgroundUploadIndicator;
