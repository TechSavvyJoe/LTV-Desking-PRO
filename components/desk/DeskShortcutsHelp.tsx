import React, { useEffect, useRef } from "react";

const SHORTCUTS: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: "/", action: "Focus inventory search" },
  { keys: "↑ / ↓", action: "Move focus through ranked inventory" },
  { keys: "C", action: "Pin or unpin focused vehicle to compare" },
  { keys: "⌘/Ctrl+S", action: "Save focused deal to pipeline" },
  { keys: "?", action: "Show this shortcuts cheat sheet" },
  { keys: "Esc", action: "Close this overlay" },
];

interface DeskShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Lightweight desk shortcuts overlay. Owned by desk so AppShell/common stay untouched.
 */
export const DeskShortcutsHelp: React.FC<DeskShortcutsHelpProps> = ({ open, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="desk-shortcuts-title"
      className="desk-shortcuts-help"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.35)",
        padding: 16,
      }}
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          boxShadow: "var(--shadow)",
          padding: "18px 20px 16px",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <h2
            id="desk-shortcuts-title"
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 650,
              letterSpacing: "-0.01em",
            }}
          >
            Desk shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            style={{
              background: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              color: "var(--color-text-muted)",
              cursor: "pointer",
              fontSize: 12,
              padding: "4px 9px",
            }}
          >
            Esc
          </button>
        </div>

        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: 8,
          }}
        >
          {SHORTCUTS.map((row) => (
            <li
              key={row.keys}
              style={{
                display: "grid",
                gridTemplateColumns: "118px 1fr",
                gap: 12,
                alignItems: "baseline",
                fontSize: 13,
              }}
            >
              <kbd
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--color-text-muted)",
                  background: "var(--color-bg-subtle)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  padding: "3px 7px",
                  width: "fit-content",
                }}
              >
                {row.keys}
              </kbd>
              <span style={{ color: "var(--color-text)" }}>{row.action}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default DeskShortcutsHelp;
