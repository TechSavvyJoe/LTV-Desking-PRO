import React from "react";
import Button from "./common/Button";
import * as Icons from "./common/Icons";

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
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant="primary"
        size="sm"
        className="h-9 px-3 font-medium"
        onClick={onSaveDeal}
        disabled={!canSave}
      >
        <Icons.SaveIcon className="w-4 h-4 mr-2" />
        Save Deal
      </Button>

      <Button
        variant="secondary"
        size="sm"
        className="h-9 px-3 border-slate-200 dark:border-slate-700 hover:border-green-300 dark:hover:border-green-700 transition-colors group"
        onClick={onDownloadFavorites}
        disabled={favoritesCount === 0}
      >
        <Icons.DocumentDuplicateIcon className="w-4 h-4 mr-2 text-slate-400 group-hover:text-green-500 transition-colors" />
        PDF
        {favoritesCount > 0 && (
          <span className="ml-2 text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300 px-1.5 py-0.5 rounded-full font-bold">
            {favoritesCount}
          </span>
        )}
      </Button>
    </div>
  );
};

export default ActionBar;
