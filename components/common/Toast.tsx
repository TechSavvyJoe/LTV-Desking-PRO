import React, { useEffect } from "react";
import { CheckCircleIcon, ExclamationCircleIcon, XMarkIcon } from "./Icons";

interface ToastProps {
  type: "success" | "error";
  message: string;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  type,
  message,
  onClose,
  duration = 3000,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border ${
          type === "success"
            ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
            : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
        }`}
      >
        {type === "success" ? (
          <CheckCircleIcon className="w-5 h-5" />
        ) : (
          <ExclamationCircleIcon className="w-5 h-5" />
        )}
        <p className="text-sm font-medium">{message}</p>
        <button
          onClick={onClose}
          className={`ml-2 p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${
            type === "success"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
