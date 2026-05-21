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
        onClick={onSaveDeal}
        disabled={!canSave}
        className="gap-1.5"
      >
        <Icons.SaveIcon className="w-3.5 h-3.5" />
        Save Deal
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={onDownloadFavorites}
        disabled={favoritesCount === 0}
        className="gap-1.5"
      >
        <Icons.DocumentDuplicateIcon className="w-3.5 h-3.5" />
        PDF
        {favoritesCount > 0 && (
          <span className="ml-1 text-2xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded-full font-medium tabular">
            {favoritesCount}
          </span>
        )}
      </Button>

      <div className="hidden sm:flex items-center gap-1.5 ml-2 text-xs text-neutral-400 dark:text-neutral-600">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        <span>v2.0</span>
      </div>
    </div>
  );
};

export default ActionBar;
