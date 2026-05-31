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
        group relative px-5 py-2 text-sm font-medium rounded
        transition-colors duration-[120ms]
        ${
          active
            ? "text-[var(--color-primary)] bg-[var(--color-bg)] shadow-sm"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-muted)]"
        }
      `}
      aria-current={active ? "page" : undefined}
    >
      {/* Active indicator bar with smooth slide animation */}
      <span
        className={`flex items-center justify-center transition-colors ${
          active
            ? "text-[var(--color-primary)]"
            : "text-[var(--color-text-subtle)] group-hover:text-[var(--color-text-muted)]"
        }`}
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
                ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                : "bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]"
            }
          `}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}

      {/* Active indicator underline */}
      {active && (
        <span
          className="absolute bottom-0 left-3 right-3 h-0.5 bg-[var(--color-primary)] rounded-t"
          aria-hidden="true"
        />
      )}
    </button>
  );
};
