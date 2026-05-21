import React from "react";

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}

export const TabButton: React.FC<TabButtonProps> = ({ active, onClick, icon, label, count }) => {
  return (
    <button
      onClick={onClick}
      className={`
        group relative flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md
        transition-all duration-150 ease-out
        ${
          active
            ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm"
            : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-white/50 dark:hover:bg-neutral-800/50"
        }
      `}
      aria-current={active ? "page" : undefined}
    >
      <span
        className={`transition-colors ${
          active
            ? "text-neutral-900 dark:text-white"
            : "text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300"
        }`}
      >
        {icon}
      </span>

      <span className="hidden sm:inline">{label}</span>

      {count !== undefined && (
        <span
          className={`
            min-w-[1.25rem] h-5 px-1.5
            flex items-center justify-center
            text-xs font-medium rounded-full
            transition-all duration-150
            ${
              active
                ? "bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
            }
          `}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
};
