import React, { useCallback, useEffect, useRef, useState } from "react";
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

/** At most 3 toasts on screen; older ones are dropped first. */
const MAX_VISIBLE_TOASTS = 3;
const AUTO_DISMISS_MS = 5500;

interface ToastEntry {
  id: number;
  message: string;
  type: ToastType;
}

/**
 * Single toast pill (dc mockup): opaque bg, strong border, 18px round status
 * badge + 14px/500 message, `.toast-pop` entrance. Errors and warnings persist
 * until dismissed; success/info auto-dismiss after a comfortable window and
 * pause while the user hovers/focuses the toast. [a11y]
 */
const ToastItem: React.FC<{ entry: ToastEntry; onDismiss: (id: number) => void }> = ({
  entry,
  onDismiss,
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const persistent = entry.type === "error" || entry.type === "warning";

  useEffect(() => {
    if (persistent || isPaused) return;

    const timer = setTimeout(() => onDismiss(entry.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [persistent, isPaused, entry.id, onDismiss]);

  const badge = BADGE[entry.type];

  // Errors and warnings are assertive (announce immediately); success/info
  // are polite (wait for screen reader to finish its current utterance).
  const ariaLive = persistent ? "assertive" : "polite";
  const role = persistent ? "alert" : "status";

  return (
    <div
      className="toast-pop"
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      style={{
        pointerEvents: "auto",
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
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          maxWidth: "min(92vw, 480px)",
          overflowWrap: "anywhere",
        }}
      >
        {entry.message}
      </span>
      {persistent && (
        <button
          onClick={() => onDismiss(entry.id)}
          aria-label="Dismiss notification"
          className="transition-colors"
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

/**
 * Bottom-center toast stack. Keeps the existing lib/toast pub/sub API —
 * every publish appends a toast (newest at the bottom) instead of replacing
 * the current one, so rapid events don't clobber each other. The container
 * layers at the --z-toast token (200), above modals (--z-modal: 100).
 */
export const Toast: React.FC = () => {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    return subscribe((message, type) => {
      setToasts((prev) =>
        [...prev, { id: nextId.current++, message, type }].slice(-MAX_VISIBLE_TOASTS)
      );
    });
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 26,
        zIndex: "var(--z-toast)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((entry) => (
        <ToastItem key={entry.id} entry={entry} onDismiss={dismiss} />
      ))}
    </div>
  );
};
