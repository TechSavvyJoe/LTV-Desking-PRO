import { useEffect } from "react";

/**
 * Forces the `.dark` class on <html> while a component is mounted.
 * Restores whatever classes were present on unmount.
 *
 * Used by routes that must always render in dark mode regardless of the
 * user's theme preference (e.g. Owner Console, Owner Login).
 */
export function useForceDarkMode(): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    const hadLight = root.classList.contains("light");

    root.classList.add("dark");
    root.classList.remove("light");

    return () => {
      if (!hadDark) root.classList.remove("dark");
      if (hadLight) root.classList.add("light");
    };
  }, []);
}
