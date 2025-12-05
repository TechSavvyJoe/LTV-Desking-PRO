import React, { useEffect, useState } from "react";
import { CheckCircleIcon, ExclamationCircleIcon, XMarkIcon } from "./Icons";

interface ToastProps {
  type?: "success" | "error" | "warning" | "info"; // Added 'info' type and made optional
  message: string;
  onClose: () => void;
  duration?: number; // Still present in interface, but not used in new logic
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = "info", // Default type changed to "info"
  onClose,
  duration = 3000, // Default duration used for auto-close, but progress bar is fixed
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    // Entrance animation
    setIsVisible(true);

    // Progress bar animation
    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.max(0, prev - 100 / (duration / 60))); // Calculate decrement based on duration
    }, 60);

    // Auto-close after 'duration' milliseconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for exit animation
    }, duration);

    return () => {
      clearTimeout(timer);
      clearInterval(progressInterval);
    };
  }, [onClose, duration]); // Added duration to dependency array

  const variantStyles = {
    success:
      "bg-emerald-500/20 text-emerald-800 border-emerald-500 dark:bg-emerald-500/30 dark:text-emerald-200",
    error:
      "bg-red-500/20 text-red-800 border-red-500 dark:bg-red-500/30 dark:text-red-200",
    warning:
      "bg-amber-500/20 text-amber-800 border-amber-500 dark:bg-amber-500/30 dark:text-amber-200",
    info: "bg-blue-500/20 text-blue-800 border-blue-500 dark:bg-blue-500/30 dark:text-blue-200", // Added info style
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircleIcon className="w-full h-full" />;
      case "error":
      case "warning":
      case "info": // Info also uses ExclamationCircleIcon
      default:
        return <ExclamationCircleIcon className="w-full h-full" />;
    }
  };

  const icon = getIcon();

  return (
    <div
      className={`
        fixed top-4 right-4 z-[200] max-w-md
        transform transition-all duration-300 ease-out
        ${
          isVisible
            ? "translate-x-0 opacity-100 scale-100"
            : "translate-x-full opacity-0 scale-95"
        }
      `}
      role="alert"
      aria-live="assertive"
    >
      <div
        className={`
          flex items-start gap-3 p-4 rounded-2xl shadow-2xl backdrop-blur-lg
          border-l-4 overflow-hidden relative
          ${variantStyles[type]}
        `}
      >
        {/* Progress bar */}
        <div
          className="absolute bottom-0 left-0 h-1 bg-white/30 transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />

        {/* Icon with pulse animation */}
        <div
          className={`flex-shrink-0 w-6 h-6 ${
            isVisible ? "animate-scaleIn" : ""
          }`}
        >
          {icon}
        </div>

        {/* Message */}
        <p className="flex-1 text-sm font-medium leading-relaxed">{message}</p>

        {/* Close button with hover effect */}
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(onClose, 300);
          }}
          className="flex-shrink-0 text-current opacity-60 hover:opacity-100 transition-all duration-200 hover:scale-110 active:scale-95 rounded-lg p-1"
          aria-label="Close notification"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
