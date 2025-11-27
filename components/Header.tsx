import React from "react";
import Button from "./common/Button";
import * as Icons from "./common/Icons";
import ThemeToggle from "./common/ThemeToggle";
import { useDealContext } from "../context/DealContext";

interface HeaderProps {
  onOpenAiModal: () => void;
  onOpenSettingsModal: () => void;
}

const Header: React.FC<HeaderProps> = ({
  onOpenAiModal,
  onOpenSettingsModal,
}) => {
  const { isShowroomMode, setIsShowroomMode } = useDealContext();

  return (
    <header className="sticky top-0 z-30 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-900 text-white shadow-lg px-4">
      <div className="flex flex-wrap justify-between items-center gap-4 py-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            LTV & Desking Pro
          </h1>
          <p className="mt-1 text-sm sm:text-base text-slate-200/80">
            Precision deal structuring, lender intelligence, and desking in one
            refined workspace.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsShowroomMode(!isShowroomMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              isShowroomMode
                ? "bg-green-500/20 text-green-400 border border-green-500/50"
                : "bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700"
            }`}
            title="Toggle Showroom Mode (Hides Profit/Cost)"
          >
            {isShowroomMode ? (
              <>
                <Icons.EyeIcon className="w-4 h-4" /> Showroom On
              </>
            ) : (
              <>
                <Icons.EyeSlashIcon className="w-4 h-4" /> Desk Mode
              </>
            )}
          </button>
          <div className="h-6 w-px bg-slate-700 mx-1" />
          <ThemeToggle />
          <Button
            variant="secondary"
            onClick={onOpenSettingsModal}
            size="sm"
            className="!rounded-full gap-2"
          >
            <Icons.CogIcon className="w-4 h-4" /> Settings
          </Button>
          <Button
            onClick={onOpenAiModal}
            size="sm"
            className="!rounded-full gap-2 bg-gradient-to-r from-purple-500 to-pink-500"
          >
            <Icons.SparklesIcon className="w-4 h-4" /> AI Lender Tools
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
