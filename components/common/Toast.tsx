import React, { useEffect, useState } from "react";
import { CheckCircleIcon, ExclamationCircleIcon, XMarkIcon } from "./Icons";
import { subscribe } from "../../lib/toast";

export const Toast: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"success" | "error" | "warning" | "info">("info");
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
  }, [isVisible, message]);

  if (!isVisible) return null;

  const variantStyles = {
    success: "bg-neutral-900 dark:bg-neutral-800 text-white border-l-emerald-500",
    error: "bg-neutral-900 dark:bg-neutral-800 text-white border-l-red-500",
    warning: "bg-neutral-900 dark:bg-neutral-800 text-white border-l-amber-500",
    info: "bg-neutral-900 dark:bg-neutral-800 text-white border-l-primary-500",
  };

  const iconColors = {
    success: "text-emerald-400",
    error: "text-red-400",
    warning: "text-amber-400",
    info: "text-primary-400",
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

  const ariaLive = type === "error" || type === "warning" ? "assertive" : "polite";
  const role = type === "error" || type === "warning" ? "alert" : "status";

  return (
    <div
      className="fixed bottom-4 right-4 z-[200] max-w-sm animate-slide-up"
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
    >
      <div
        className={`
          flex items-start gap-3 px-4 py-3 rounded-lg shadow-xl
          border border-neutral-700 dark:border-neutral-700 border-l-4 overflow-hidden relative
          ${variantStyles[type]}
        `}
      >
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-white/20 transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />

        <div className={`flex-shrink-0 w-5 h-5 ${iconColors[type]}`} aria-hidden="true">
          {getIcon()}
        </div>

        <p className="flex-1 text-sm font-medium leading-snug">{message}</p>

        <button
          onClick={() => setIsVisible(false)}
          className="flex-shrink-0 text-neutral-400 hover:text-white transition-colors"
          aria-label="Dismiss notification"
        >
          <XMarkIcon className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
