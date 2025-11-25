
import React from 'react';
import Button from './common/Button';
import * as Icons from './common/Icons';
import ThemeToggle from './common/ThemeToggle';

interface HeaderProps {
  onOpenAiModal: () => void;
  onOpenSettingsModal: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenAiModal, onOpenSettingsModal }) => (
  <header className="sticky top-0 z-30 backdrop-blur-md bg-slate-50/80 dark:bg-x-black/80 border-b border-slate-200 dark:border-x-border px-4">
    <div className="flex flex-wrap justify-between items-center gap-4 py-3">
        <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-x-text-primary tracking-tight">LTV & Desking Pro</h1>
        <p className="mt-1 text-base text-slate-500 dark:text-x-text-secondary">
            Your all-in-one automotive deal structuring tool.
        </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="secondary" onClick={onOpenSettingsModal} size="sm" className="!rounded-md"><Icons.CogIcon /> Settings</Button>
          <Button variant="secondary" onClick={onOpenAiModal} size="sm" className="!rounded-md"><Icons.WandIcon /> AI Lender Tools</Button>
        </div>
    </div>
  </header>
);

export default Header;