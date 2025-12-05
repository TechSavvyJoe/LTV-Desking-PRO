import { useEffect, useCallback } from "react";

type KeyHandler = (event: KeyboardEvent) => void;
type KeyMap = Record<string, KeyHandler>;

/**
 * Hook for handling keyboard shortcuts throughout the application
 * Supports modifier keys (Ctrl, Cmd, Shift, Alt)
 *
 * @example
 * useKeyboardShortcuts({
 *   'ctrl+s': () => handleSave(),
 *   'escape': () => handleClose(),
 *   'ctrl+shift+p': () => togglePanel(),
 * });
 */
export const useKeyboardShortcuts = (
  keyMap: KeyMap,
  enabled: boolean = true
) => {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Build key string
      const parts: string[] = [];
      if (event.ctrlKey || event.metaKey) parts.push("ctrl");
      if (event.shiftKey) parts.push("shift");
      if (event.altKey) parts.push("alt");
      parts.push(event.key.toLowerCase());

      const keyString = parts.join("+");
      const handler = keyMap[keyString];

      if (handler) {
        event.preventDefault();
        handler(event);
      }

      // Also check without modifiers for simple keys like 'escape'
      const simpleHandler = keyMap[event.key.toLowerCase()];
      if (
        simpleHandler &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        // Only prevent default for escape and similar, not for regular typing
        if (
          ["escape", "f1", "f2", "f3", "f4", "f5"].includes(
            event.key.toLowerCase()
          )
        ) {
          event.preventDefault();
          simpleHandler(event);
        }
      }
    },
    [keyMap, enabled]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
};

/**
 * Hook for trapping focus within a modal or dialog
 * Essential for accessibility - keeps keyboard focus inside the modal
 */
export const useFocusTrap = (
  containerRef: React.RefObject<HTMLElement>,
  isActive: boolean = true
) => {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus first element when trap activates
    firstElement?.focus();

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener("keydown", handleTabKey);
    return () => container.removeEventListener("keydown", handleTabKey);
  }, [containerRef, isActive]);
};

/**
 * Hook for restoring focus when a modal closes
 */
export const useRestoreFocus = (isOpen: boolean) => {
  useEffect(() => {
    if (isOpen) {
      // Store the currently focused element
      const previouslyFocused = document.activeElement as HTMLElement;

      return () => {
        // Restore focus when modal closes
        previouslyFocused?.focus();
      };
    }
  }, [isOpen]);
};
