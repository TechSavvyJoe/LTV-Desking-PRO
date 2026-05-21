import React from "react";
import * as Icons from "./Icons";

interface ThemeToggleProps {
  theme?: "light" | "dark";
  onToggle?: () => void;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  const isDark = theme === "dark";

  return (
    <button
      onClick={onToggle}
      className="
        p-2 rounded-lg
        text-neutral-500 dark:text-neutral-400
        hover:text-neutral-700 dark:hover:text-neutral-200
        hover:bg-neutral-100 dark:hover:bg-neutral-800
        transition-colors duration-150
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
      "
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? <Icons.SunIcon className="w-5 h-5" /> : <Icons.MoonIcon className="w-5 h-5" />}
    </button>
  );
};

export default ThemeToggle;
