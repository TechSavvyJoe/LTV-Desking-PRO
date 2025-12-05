import React from "react";

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}

export const TabButton: React.FC<TabButtonProps> = ({
  active,
  onClick,
  icon,
  label,
  count,
}) => {
  return (
    <button
      onClick={onClick}
      className={`
        group relative px-6 py-3 text-sm font-semibold rounded-xl
        transition-all duration-300 ease-out
        hover:scale-105 active:scale-95
        ${
          active
            ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 shadow-sm"
            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80"
        }
      `}
      aria-current={active ? "page" : undefined}
    >
      {/* Active indicator bar with smooth slide animation */}
      <span
        className={`
            : "text-slate-400 dark:text-slate-500"
        }
      `}
      >
        {icon}
      </span>

      {/* Label */}
      <span className="hidden sm:inline">{label}</span>

      {/* Count Badge */}
      {count !== undefined && (
        <span
          className={`
            min-w-[1.375rem] h-[1.375rem] px-1.5
            flex items-center justify-center
            text-[10px] font-bold rounded-full
            transition-all duration-200
            ${
              active
                ? "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300"
                : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
            }
          `}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}

      {/* Active indicator underline */}
      {active && (
        <span
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
          aria-hidden="true"
        />
      )}
    </button>
  );
};
