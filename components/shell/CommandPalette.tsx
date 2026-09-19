import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useFocusTrap, useRestoreFocus } from "../../hooks/useKeyboard";

export interface PaletteItem {
  id: string;
  label: string;
  /** Secondary line, e.g. "STK 4402 · 2020 Toyota Camry SE". */
  detail?: string;
  /** Group heading the item is listed under. */
  group: string;
  /** Shortcut hint shown in mono on the right, e.g. "/" or "⌘S". */
  hint?: string;
  /** Extra match terms (VIN, stock number, customer…). */
  keywords?: string[];
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
  placeholder?: string;
}

const MAX_RESULTS = 40;

/** Ranked substring match: label prefix > label > keywords > detail. */
const scoreItem = (item: PaletteItem, q: string): number => {
  const label = item.label.toLowerCase();
  if (label.startsWith(q)) return 100;
  if (label.includes(q)) return 80;
  if (item.keywords?.some((k) => k.toLowerCase().includes(q))) return 60;
  if (item.detail?.toLowerCase().includes(q)) return 40;
  return 0;
};

const SearchGlyph = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.8-3.8" />
  </svg>
);

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd
    className="inline-block rounded border border-[var(--color-border-strong)] px-1.5 py-0.5 text-[11px] leading-none text-[var(--color-text-subtle)]"
    style={{ fontFamily: "var(--mono)" }}
  >
    {children}
  </kbd>
);

/**
 * Global command palette (⌘K / Ctrl+K). Keyboard-first switching between
 * screens, actions, saved deals, and inventory — the pattern queue-working
 * F&I users expect from Tekion/CDK-class tools. ARIA combobox + listbox with
 * roving aria-activedescendant, focus-trapped, focus restored on close.
 * [takeover-P1 #8]
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  items,
  placeholder = "Search deals, vehicles, lenders — or jump to a screen…",
}) => {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useFocusTrap(panelRef as React.RefObject<HTMLElement>, open);
  useRestoreFocus(open);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, MAX_RESULTS);
    return items
      .map((item) => [item, scoreItem(item, q)] as const)
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_RESULTS)
      .map(([item]) => item);
  }, [items, query]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  const grouped = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const r of results) {
      const list = map.get(r.group) ?? [];
      list.push(r);
      map.set(r.group, list);
    }
    return Array.from(map.entries());
  }, [results]);

  if (!open) return null;

  const select = (item: PaletteItem) => {
    onClose();
    item.onSelect();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, results.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[active];
      if (item) select(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const optionId = (item: PaletteItem) => `${listId}-opt-${item.id}`;
  const activeItem = results[active];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[12vh]"
      role="presentation"
    >
      <div className="dc-scrim fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="toast-pop relative w-full max-w-xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] shadow-[var(--shadow-md)]"
      >
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 text-[var(--color-text-subtle)]">
          <SearchGlyph />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeItem ? optionId(activeItem) : undefined}
            aria-autocomplete="list"
            aria-label="Search or jump to"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 border-0 bg-transparent py-3.5 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-subtle)]"
          />
          <Kbd>esc</Kbd>
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label="Results"
          className="custom-scrollbar max-h-[52vh] overflow-y-auto py-2"
        >
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
              No matches for “{query.trim()}”. Try a customer name, stock #, VIN, or a screen.
            </p>
          ) : (
            grouped.map(([group, list]) => (
              <div key={group} role="group" aria-label={group}>
                <div
                  className="px-4 pb-1 pt-2 text-[11px] uppercase tracking-[0.12em] text-[var(--color-text-subtle)]"
                  style={{ fontFamily: "var(--mono)" }}
                >
                  {group}
                </div>
                {list.map((item) => {
                  const idx = results.indexOf(item);
                  const isActive = idx === active;
                  return (
                    <button
                      key={item.id}
                      id={optionId(item)}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => select(item)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-[var(--color-text)] outline-none ${
                        isActive ? "bg-[var(--color-primary-subtle)]" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.label}</span>
                        {item.detail && (
                          <span className="block truncate text-xs text-[var(--color-text-muted)]">
                            {item.detail}
                          </span>
                        )}
                      </span>
                      {item.hint && <Kbd>{item.hint}</Kbd>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-[var(--color-border)] px-4 py-2 text-[11px] text-[var(--color-text-subtle)]">
          <span className="flex items-center gap-1">
            <Kbd>↑↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
};

/** Global ⌘K / Ctrl+K hotkey. Works even while typing in a field (it's a chord). */
export const useCommandPaletteHotkey = (onOpen: () => void): void => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
};

export default CommandPalette;
