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
    <div className="flex items-center gap-1 p-1 rounded-full bg-white/20 dark:bg-white/10 backdrop-blur border border-white/30 shadow-sm">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => setTheme(option.value)}
          className={`flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
            theme === option.value
              ? 'bg-white text-slate-900 shadow-md'
              : 'text-white/80 hover:text-white'
          }`}
          aria-label={`Switch to ${option.name} mode`}
        >
          {option.icon}
          <span className="hidden sm:inline">{option.name}</span>
        </button>
      ))}
    </div>
  );
};

export default ThemeToggle;
