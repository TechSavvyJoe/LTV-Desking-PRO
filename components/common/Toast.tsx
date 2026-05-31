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
  }, [isVisible, message]); // Reset timer when message changes

  if (!isVisible) return null;

  // Opaque status surfaces (no blur). Left border carries the status color.
  const variantStyles = {
    success:
      "bg-[var(--color-success-subtle)] text-[var(--color-success)] border-[var(--color-success)]",
    error:
      "bg-[var(--color-danger-subtle)] text-[var(--color-danger)] border-[var(--color-danger)]",
    warning:
      "bg-[var(--color-warning-subtle)] text-[var(--color-warning)] border-[var(--color-warning)]",
    info: "bg-[var(--color-primary-subtle)] text-[var(--color-primary)] border-[var(--color-primary)]",
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

  // Errors and warnings are assertive (announce immediately); success/info
  // are polite (wait for screen reader to finish its current utterance).
  const ariaLive = type === "error" || type === "warning" ? "assertive" : "polite";
  const role = type === "error" || type === "warning" ? "alert" : "status";

  return (
    <div
      className="fixed top-4 right-4 z-[200] max-w-md animate-slideIn"
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
    >
      <div
        className={`
          flex items-start gap-3 p-4 rounded-md shadow-md
          border-l-4 overflow-hidden relative
          ${variantStyles[type]}
        `}
      >
        <div
          className="absolute bottom-0 left-0 h-1 bg-white/30 transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />

        <div className="flex-shrink-0 w-6 h-6" aria-hidden="true">
          {getIcon()}
        </div>

        <p className="flex-1 text-sm font-medium leading-relaxed">{message}</p>

        <button
          onClick={() => setIsVisible(false)}
          className="flex-shrink-0 text-current opacity-60 hover:opacity-100 transition-all"
          aria-label="Dismiss notification"
        >
          <XMarkIcon className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
