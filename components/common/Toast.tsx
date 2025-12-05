import React, { useEffect, useState } from "react";
import { CheckCircleIcon, ExclamationCircleIcon, XMarkIcon } from "./Icons";
import { subscribe } from "../../lib/toast";

export const Toast: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"success" | "error" | "warning" | "info">(
    "info"
  );
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    return subscribe((msg, t) => {
      setMessage(msg);
      setType(t);
      setIsVisible(true);
      setProgress(100);
    });
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const duration = 3000;
    const interval = 60;
    const steps = duration / interval;
    const decrement = 100 / steps;

    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.max(0, prev - decrement));
    }, interval);

    const timer = setTimeout(() => {
      setIsVisible(false);
    }, duration);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(timer);
    };
  }, [isVisible, message]); // Reset timer when message changes

  if (!isVisible) return null;

  const variantStyles = {
    success:
      "bg-emerald-500/20 text-emerald-800 border-emerald-500 dark:bg-emerald-500/30 dark:text-emerald-200",
    error:
      "bg-red-500/20 text-red-800 border-red-500 dark:bg-red-500/30 dark:text-red-200",
    warning:
      "bg-amber-500/20 text-amber-800 border-amber-500 dark:bg-amber-500/30 dark:text-amber-200",
    info: "bg-blue-500/20 text-blue-800 border-blue-500 dark:bg-blue-500/30 dark:text-blue-200",
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircleIcon className="w-full h-full" />;
      case "error":
      case "warning":
      case "info":
      default:
        return <ExclamationCircleIcon className="w-full h-full" />;
    }
  };

  return (
    <div
      className="fixed top-4 right-4 z-[200] max-w-md animate-slideIn"
      role="alert"
    >
      <div
        className={`
          flex items-start gap-3 p-4 rounded-2xl shadow-2xl backdrop-blur-lg
          border-l-4 overflow-hidden relative
          ${variantStyles[type]}
        `}
      >
        <div
          className="absolute bottom-0 left-0 h-1 bg-white/30 transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />

        <div className="flex-shrink-0 w-6 h-6">{getIcon()}</div>

        <p className="flex-1 text-sm font-medium leading-relaxed">{message}</p>

        <button
          onClick={() => setIsVisible(false)}
          className="flex-shrink-0 text-current opacity-60 hover:opacity-100 transition-all"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
