import React, { useEffect, useState } from "react";
import { XMarkIcon } from "./Icons";
import { subscribe } from "../../lib/toast";

type ToastType = "success" | "error" | "warning" | "info";

/** Badge tint + glyph per type — success is the mockup's green check pill;
    error/warning/info swap the badge onto danger/warning/muted tokens. */
const BADGE: Record<ToastType, { bg: string; color: string; glyph: string }> = {
  success: { bg: "var(--color-primary-subtle)", color: "var(--color-primary)", glyph: "✓" },
  error: { bg: "var(--color-danger-subtle)", color: "var(--color-danger)", glyph: "!" },
  warning: { bg: "var(--color-warning-subtle)", color: "var(--color-warning)", glyph: "!" },
  info: { bg: "var(--color-bg-muted)", color: "var(--color-text-muted)", glyph: "i" },
};

/**
 * Bottom-center toast pill (dc mockup): opaque bg, strong border, 18px round
 * status badge + 14px/500 message, `.toast-pop` entrance. Keeps the existing
 * lib/toast pub/sub API, auto-dismiss timing (success/info: 5.5s, paused on
 * hover/focus; error/warning: persist until dismissed) and aria semantics.
 */
export const Toast: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<ToastType>("info");
  const [isPaused, setIsPaused] = useState(false);
  // Bumped per publish so a repeat toast restarts the .toast-pop entrance.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    return subscribe((msg, t) => {
      setMessage(msg);
      setType(t);
      setIsVisible(true);
      setIsPaused(false);
      setNonce((n) => n + 1);
    });
  }, []);

  // Errors and warnings persist until dismissed; success/info auto-dismiss after
  // a comfortable window and pause while the user hovers/focuses the toast. [a11y]
  const persistent = type === "error" || type === "warning";

  useEffect(() => {
    if (!isVisible || persistent || isPaused) return;

    const duration = 5500;
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, duration);

    return () => {
      clearTimeout(timer);
    };
  }, [isVisible, message, persistent, isPaused]); // Reset timer when message changes

  if (!isVisible) return null;

  const badge = BADGE[type];

  // Errors and warnings are assertive (announce immediately); success/info
  // are polite (wait for screen reader to finish its current utterance).
  const ariaLive = persistent ? "assertive" : "polite";
  const role = persistent ? "alert" : "status";

  return (
    <div
      key={nonce}
      className="toast-pop"
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      style={{
        position: "fixed",
        left: "50%",
        bottom: 26,
        transform: "translateX(-50%)",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--color-bg)",
        border: "1px solid var(--color-border-strong)",
        borderRadius: 10,
        padding: "10px 16px",
        boxShadow: "var(--shadow-md)",
        color: "var(--color-text)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: badge.bg,
          color: badge.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {badge.glyph}
      </span>
      <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>{message}</span>
      {persistent && (
        <button
          onClick={() => setIsVisible(false)}
          aria-label="Dismiss notification"
          className="lift-btn"
          style={{
            background: "transparent",
            border: "none",
            padding: 2,
            marginLeft: 2,
            cursor: "pointer",
            color: "var(--color-text-muted)",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <XMarkIcon className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
