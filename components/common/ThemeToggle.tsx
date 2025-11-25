import React from 'react';
import { useThemeControl } from '../../hooks/useTheme';
import * as Icons from './Icons';

const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useThemeControl();

  const options = [
    { name: 'Light', value: 'light', icon: <Icons.SunIcon /> },
    { name: 'Dark', value: 'dark', icon: <Icons.MoonIcon /> },
    { name: 'System', value: 'system', icon: <Icons.ComputerDesktopIcon /> },
  ] as const;

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200 dark:bg-x-border">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => setTheme(option.value)}
          className={`flex items-center justify-center gap-2 px-3 py-1 text-xs font-bold rounded-md transition-colors ${
            theme === option.value
              ? 'bg-white text-slate-800 dark:bg-x-hover-light dark:text-x-text-primary'
              : 'text-slate-500 hover:text-slate-800 dark:text-x-text-secondary dark:hover:text-x-text-primary'
          }`}
          aria-label={`Switch to ${option.name} mode`}
        >
          {option.icon}
          <span>{option.name}</span>
        </button>
      ))}
    </div>
  );
};

export default ThemeToggle;
