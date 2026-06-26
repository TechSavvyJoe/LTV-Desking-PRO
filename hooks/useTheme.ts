import { useEffect, useState, useCallback } from "react";
import { STORAGE_KEYS } from "../constants";

type Theme = "light" | "dark";

const getInitialTheme = (): Theme => {
  // Unified single dark theme: the product is dark-only. We always return
  // "dark" regardless of stored preference or OS setting so the institutional
  // near-black surface is the one and only surface. [redesign 2026-06]
  return "dark";
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    // Apply theme class
    if (theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
    }

    // Persist to local storage
    window.localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme };
}

// Hook retained for API compatibility.
export function useThemeControl(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }, [theme]);
  return [theme, setTheme];
}
