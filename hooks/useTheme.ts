import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
    ? "dark"
    : "light";
};

export function useTheme() {
  // Always return 'dark'
  const theme: Theme = "dark";

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    // Force dark class
    root.classList.add("dark");
    // Ensure local storage is consistent (optional, but good for other tabs)
    window.localStorage.setItem("theme", "dark");
  }, []);

  // No-op toggle
  const toggleTheme = () => {};

  return { theme, toggleTheme };
}

// Hook retained for API compatibility.
export function useThemeControl(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  useEffect(() => {
    window.localStorage.setItem("theme", theme);
  }, [theme]);
  return [theme, setTheme];
}
