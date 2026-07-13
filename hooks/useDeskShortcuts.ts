import { useEffect, useRef } from "react";

export interface DeskShortcutOptions {
  /** VINs in the CURRENT sorted+filtered row order (arrow-nav walks this). */
  orderedVins: string[];
  /** The resolved focused VIN (row fallback included), not the raw context value. */
  focusedVin: string | null;
  onFocusVin: (vin: string) => void;
  /** "c" — toggle the compare pin on the focused vehicle. */
  onToggleCompare: (vin: string) => void;
  /** True while the DealSheetModal is open — the dialog owns all keyboard input. */
  isModalOpen: boolean;
  /** Optional Cmd/Ctrl+S — save the focused deal when available. */
  onSaveDeal?: () => void;
  /** Whether the shortcuts cheat sheet overlay is open. */
  shortcutsHelpOpen?: boolean;
  onOpenShortcutsHelp?: () => void;
  onCloseShortcutsHelp?: () => void;
}

/**
 * Desk keyboard shortcuts, per the dc design contract (mockup componentDidMount
 * key handler): "/" focuses #desk-search, ArrowUp/ArrowDown move the focused
 * row through the current visible order, "c" toggles the compare pin, Escape
 * closes the deal sheet / shortcuts help. Skipped while typing in an
 * input/select/textarea and while the modal is open. Modifier chords other
 * than Cmd/Ctrl+S are deliberately ignored. [dc-redesign]
 */
export function useDeskShortcuts(options: DeskShortcutOptions): void {
  // Always-fresh options without re-binding the window listener per render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const {
        orderedVins,
        focusedVin,
        onFocusVin,
        onToggleCompare,
        isModalOpen,
        onSaveDeal,
        shortcutsHelpOpen,
        onOpenShortcutsHelp,
        onCloseShortcutsHelp,
      } = optionsRef.current;

      if (isModalOpen) return;

      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || "").toLowerCase();
      const typing =
        tag === "input" || tag === "select" || tag === "textarea" || target?.isContentEditable;

      // Escape closes the shortcuts overlay even while an input is focused.
      if (e.key === "Escape" && shortcutsHelpOpen) {
        e.preventDefault();
        onCloseShortcutsHelp?.();
        return;
      }

      // Cmd/Ctrl+S saves the focused deal (allowed even with other modifiers off).
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "s") {
        if (!onSaveDeal || typing) return;
        e.preventDefault();
        onSaveDeal();
        return;
      }

      // Never hijack other browser/OS chords (⌘C copy etc.).
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing) return;

      if (shortcutsHelpOpen) {
        // While help is open, only Escape (handled above) is meaningful.
        return;
      }

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        onOpenShortcutsHelp?.();
      } else if (e.key === "/") {
        const el = document.getElementById("desk-search");
        if (el) {
          e.preventDefault();
          (el as HTMLElement).focus();
        }
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (orderedVins.length === 0) return;
        e.preventDefault();
        const cur = focusedVin ? orderedVins.indexOf(focusedVin) : -1;
        let idx = cur < 0 ? 0 : cur + (e.key === "ArrowDown" ? 1 : -1);
        idx = Math.max(0, Math.min(orderedVins.length - 1, idx));
        const nextVin = orderedVins[idx];
        if (nextVin !== undefined) onFocusVin(nextVin);
      } else if (e.key === "c" || e.key === "C") {
        if (focusedVin) onToggleCompare(focusedVin);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

export default useDeskShortcuts;
