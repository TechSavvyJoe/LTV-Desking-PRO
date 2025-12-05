import React from "react";
import type { SortConfig } from "../../types";

interface Column<T> {
  header: string;
  accessor?: keyof T;
  className?: string;
  isNumeric?: boolean;
  render?: (item: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  sortConfig: SortConfig;
  onSort: (key: keyof T) => void;
  emptyMessage?: React.ReactNode;
  rowKey: keyof T;
  expandedRows?: Set<string | number>;
  onRowClick?: (rowKey: string | number) => void;
  renderExpandedRow?: (item: T) => React.ReactNode;
}

const SortIcon = ({ direction }: { direction: "asc" | "desc" | null }) => {
  return (
    <span
      className={`
      inline-flex items-center justify-center
      w-4 h-4 ml-1
      transition-all duration-200
      ${direction ? "opacity-100" : "opacity-30 group-hover:opacity-50"}
    `}
    >
      {direction === "asc" ? (
        <svg
          className="w-3.5 h-3.5 text-blue-500"
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="m7.247 4.86-4.796 5.481c-.566.647-.106 1.659.753 1.659h9.592a1 1 0 0 0 .753-1.659l-4.796-5.48a1 1 0 0 0-1.506 0z" />
        </svg>
      ) : direction === "desc" ? (
        <svg
          className="w-3.5 h-3.5 text-blue-500"
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
          <path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z" />
        </svg>
      )}
    </span>
  );
};

export const Table = <T extends { [key: string]: any }>({
  columns,
  data,
  sortConfig,
  onSort,
  emptyMessage = "No data available.",
  rowKey,
  expandedRows,
  onRowClick,
  renderExpandedRow,
}: TableProps<T>) => {
  // Defensive check: If data/columns is undefined or not an array, default to empty array
  const safeData = Array.isArray(data)
    ? data.filter((item) => item !== null && item !== undefined)
    : [];
  const safeColumns = Array.isArray(columns)
    ? columns.filter((col) => col !== null && col !== undefined)
    : [];

  return (
    <div className="table-container overflow-x-auto custom-scrollbar">
      <table className="w-full text-sm">
        {/* Header */}
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700/50">
            {safeColumns.map((col, index) => (
              <th
                key={index}
                className={`
                  group
                  px-4 py-3.5
                  text-left
                  text-xs font-semibold uppercase tracking-wider
                  text-slate-500 dark:text-slate-400
                  bg-slate-50/80 dark:bg-slate-800/50
                  ${col.isNumeric ? "text-right" : ""}
                  ${
                    col.accessor
                      ? "cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200"
                      : ""
                  }
                  ${col.className || ""}
                  transition-colors duration-150
                `}
                onClick={() => col.accessor && onSort(col.accessor as keyof T)}
              >
                <div
                  className={`
                    inline-flex items-center gap-1
                    ${col.isNumeric ? "justify-end w-full" : ""}
                  `}
                >
                  <span>{col.header}</span>
                  {col.accessor && (
                    <SortIcon
                      direction={
                        sortConfig.key === col.accessor
                          ? sortConfig.direction
                          : null
                      }
                    />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
          {safeData.length === 0 ? (
            <tr>
              <td
                colSpan={safeColumns.length > 0 ? safeColumns.length : 1}
                className="px-4 py-12 text-center"
              >
                <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                  {emptyMessage}
                </div>
              </td>
            </tr>
          ) : (
            safeData.map((item, rowIndex) => {
              if (!item) return null;

              // SAFE KEY GENERATION: If rowKey is missing, use rowIndex (less safe for React but prevents crash)
              const key =
                item[rowKey] !== undefined ? item[rowKey] : `row-${rowIndex}`;

              // Ensure expandedRows exists before checking
              const isExpanded = expandedRows ? expandedRows.has(key) : false;

              return (
                <React.Fragment key={key}>
                  <tr
                    className={`
                      group
                      transition-colors duration-150
                      ${
                        onRowClick
                          ? "cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-500/5"
                          : ""
                      }
                      ${isExpanded ? "bg-slate-50 dark:bg-slate-800/30" : ""}
                    `}
                    onClick={() => onRowClick && onRowClick(key)}
                  >
                    {safeColumns.map((col, colIndex) => (
                      <td
                        key={colIndex}
                        className={`
                          px-4 py-3.5
                          text-slate-700 dark:text-slate-300
                          ${
                            col.isNumeric
                              ? "text-right tabular-nums"
                              : "text-left"
                          }
                          ${col.className || ""}
                        `}
                      >
                        {col.render
                          ? col.render(item)
                          : col.accessor
                          ? item[col.accessor]
                          : null}
                      </td>
                    ))}
                  </tr>

                  {/* Expanded Row */}
                  {isExpanded && renderExpandedRow && (
                    <tr className="bg-slate-50/80 dark:bg-slate-800/20">
                      <td
                        colSpan={safeColumns.length}
                        className="p-0 border-b border-slate-200 dark:border-slate-700/50"
                      >
                        {renderExpandedRow(item)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
