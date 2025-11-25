import React from 'react';
import { useThemeControl } from '../../hooks/useTheme';
import * as Icons from './Icons';

const ThemeToggle: React.FC = () => {
  const [theme] = useThemeControl();

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-xs font-semibold shadow-sm">
      <Icons.MoonIcon className="w-4 h-4" />
      <span className="hidden sm:inline">Dark Mode</span>
      <span className="inline sm:hidden capitalize">{theme}</span>
    </div>
  );
};

export default ThemeToggle;
