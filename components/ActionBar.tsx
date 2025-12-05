import React from "react";
import Button from "./common/Button";
import * as Icons from "./common/Icons";
import { useStaggerAnimation } from "../hooks/useAnimation";

interface ActionBarProps {
  activeTab: "inventory" | "lenders" | "saved" | "scratchpad";
  favoritesCount: number;
  onDownloadFavorites: () => void;
  onSaveDeal: () => void;
  canSave: boolean;
}

const ActionBar: React.FC<ActionBarProps> = ({
  activeTab,
  favoritesCount,
  onDownloadFavorites,
  onSaveDeal,
  canSave,
}) => {
  const visibleButtons = useStaggerAnimation(4, 200, 80);
  return (
    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-5 sticky top-24 transition-all duration-300">
      <h3 className="flex items-center gap-2 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
        <Icons.WrenchIcon className="w-4 h-4" />
        Actions & Tools
      </h3>

      <div className="space-y-3">
        <Button
          variant="primary"
          className="w-full justify-start h-11 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all font-semibold"
          onClick={onSaveDeal}
          disabled={!canSave}
        >
          <Icons.SaveIcon className="w-5 h-5 mr-3" />
          Save Deal Structure
        </Button>

        <Button
          variant="secondary"
          className="w-full justify-start h-11 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group"
          onClick={onDownloadFavorites}
          disabled={favoritesCount === 0}
        >
          <Icons.DocumentDuplicateIcon className="w-5 h-5 mr-3 text-slate-400 group-hover:text-blue-500 transition-colors" />
          <span className="flex-grow text-left">Favorites PDF</span>
          {favoritesCount > 0 && (
            <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded-full font-bold">
              {favoritesCount}
            </span>
          )}
        </Button>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800/50">
        <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-600">
          <span>LTV Pro v2.0</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Online
          </span>
        </div>
      </div>
    </div>
  );
};

export default ActionBar;
