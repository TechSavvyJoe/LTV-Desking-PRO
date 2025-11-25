import React from "react";
import Button from "./common/Button";
import * as Icons from "./common/Icons";

interface ActionBarProps {
  activeTab: "inventory" | "favorites" | "lenders" | "saved" | "scratchpad";
  favoritesCount: number;
  onDownloadFavorites: () => void;
  onDownloadCheatSheet: () => void;
}

const ActionBar: React.FC<ActionBarProps> = ({
  activeTab,
  favoritesCount,
  onDownloadFavorites,
  onDownloadCheatSheet,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-4">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
        Actions
      </h3>

      <div className="space-y-3">
        <Button
          variant="secondary"
          className="w-full justify-start"
          onClick={onDownloadFavorites}
          disabled={favoritesCount === 0}
        >
          <Icons.DocumentDuplicateIcon className="w-5 h-5 mr-2 text-blue-500" />
          Download Favorites PDF
          <span className="ml-auto text-xs bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-400">
            {favoritesCount}
          </span>
        </Button>

        <Button
          variant="secondary"
          className="w-full justify-start"
          onClick={onDownloadCheatSheet}
        >
          <Icons.BanknotesIcon className="w-5 h-5 mr-2 text-emerald-500" />
          Lender Cheat Sheet
        </Button>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
        <p className="text-xs text-slate-400 text-center">
          LTV Desking Pro v2.0
        </p>
      </div>
    </div>
  );
};

export default ActionBar;
