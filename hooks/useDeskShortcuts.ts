import { useEffect, useRef } from "react";

export interface DeskShortcutOptions {
  /** VINs in the CURRENT sorted+filtered row order (arrow-nav walks this). */
  orderedVins: string[];
  /** The resolved focused VIN (row fallback included), not the raw context value. */
  focusedVin: string | null;
  onFocusVin: (vin: string) => void;
  /** "c" — toggle the compare pin on the focused vehicle. */
  onToggleCompare: (vin: string) => void;
  /** True while the DealSheetModal is open — suppresses all shortcuts but Escape. */
  isModalOpen: boolean;
  onCloseModal: () => void;
}

/**
 * Desk keyboard shortcuts, per the dc design contract (mockup componentDidMount
 * key handler): "/" focuses #desk-search, ArrowUp/ArrowDown move the focused
 * row through the current visible order, "c" toggles the compare pin, Escape
 * closes the deal sheet. Skipped while typing in an input/select/textarea and
 * (except Escape) while the modal is open. Modifier chords (⌘C copy etc.) are
 * deliberately ignored — the mockup didn't guard these, we must. [dc-redesign]
 */
export function useDeskShortcuts(options: DeskShortcutOptions): void {
  // Always-fresh options without re-binding the window listener per render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { orderedVins, focusedVin, onFocusVin, onToggleCompare, isModalOpen, onCloseModal } =
        optionsRef.current;

      if (e.key === "Escape") {
        if (isModalOpen) onCloseModal();
        return;
      }
      if (isModalOpen) return;

      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea" || target?.isContentEditable)
        return;
      // Never hijack browser/OS chords (⌘C, Ctrl+/, …).
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "/") {
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
