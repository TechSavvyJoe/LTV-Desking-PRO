
import React from 'react';
import Button from './common/Button';
import * as Icons from './common/Icons';
import ThemeToggle from './common/ThemeToggle';

interface HeaderProps {
  onOpenAiModal: () => void;
  onOpenSettingsModal: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenAiModal, onOpenSettingsModal }) => (
  <header className="sticky top-0 z-30 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-900 text-white shadow-lg px-4">
    <div className="flex flex-wrap justify-between items-center gap-4 py-4">
        <div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">LTV & Desking Pro</h1>
        <p className="mt-1 text-sm sm:text-base text-slate-200/80">
            Precision deal structuring, lender intelligence, and desking in one refined workspace.
        </p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Button variant="secondary" onClick={onOpenSettingsModal} size="sm" className="!rounded-full gap-2">
            <Icons.CogIcon className="w-4 h-4" /> Settings
          </Button>
          <Button onClick={onOpenAiModal} size="sm" className="!rounded-full gap-2 bg-gradient-to-r from-purple-500 to-pink-500">
            <Icons.SparklesIcon className="w-4 h-4" /> AI Lender Tools
          </Button>
        </div>
    </div>
  </header>
);

export default Header;
