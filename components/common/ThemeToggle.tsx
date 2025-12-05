import React from "react";
import { useThemeControl } from "../../hooks/useTheme";
import * as Icons from "./Icons";

const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useThemeControl();
  const isDark = theme === "dark";

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      onClick={toggleTheme}
      className="
        relative flex items-center
        w-14 h-8
        p-1
        bg-slate-200 dark:bg-slate-700
        rounded-full
        transition-colors duration-300 ease-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
      "
      role="switch"
      aria-checked={isDark}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {/* Track Icons */}
      <span className="absolute inset-0 flex items-center justify-between px-1.5">
        <Icons.SunIcon
          className={`w-4 h-4 transition-opacity duration-200 ${
            isDark ? "opacity-40 text-slate-500" : "opacity-0"
          }`}
        />
        <Icons.MoonIcon
          className={`w-4 h-4 transition-opacity duration-200 ${
            isDark ? "opacity-0" : "opacity-40 text-slate-400"
          }`}
        />
      </span>

      {/* Toggle Knob */}
      <span
        className={`
          relative z-10
          flex items-center justify-center
          w-6 h-6
          bg-white dark:bg-slate-900
          rounded-full
          shadow-md
          transition-transform duration-300 ease-out
          ${isDark ? "translate-x-6" : "translate-x-0"}
        `}
      >
        {isDark ? (
          <Icons.MoonIcon className="w-3.5 h-3.5 text-indigo-400" />
        ) : (
          <Icons.SunIcon className="w-3.5 h-3.5 text-amber-500" />
        )}
      </span>
    </button>
  );
};

export default ThemeToggle;
