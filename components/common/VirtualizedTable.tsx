import React, { useRef, useEffect, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { SortConfig } from "../../types";

export interface VirtualizedColumn<T> {
  header: string;
  accessor?: keyof T;
  className?: string;
  isNumeric?: boolean;
  render?: (item: T) => React.ReactNode;
  width?: string; // e.g., "150px" or "1fr"
}

interface VirtualizedTableProps<T> {
  columns: VirtualizedColumn<T>[];
  data: T[];
  sortConfig: SortConfig;
  onSort: (key: keyof T) => void;
  emptyMessage?: React.ReactNode;
  rowKey: keyof T;
  expandedRows?: Set<string | number>;
  onRowClick?: (rowKey: string | number) => void;
  renderExpandedRow?: (item: T) => React.ReactNode;
  height?: number | string;
}

const SortIcon = ({ direction }: { direction: "asc" | "desc" | null }) => {
  if (!direction)
    return (
      <svg
        className="w-4 h-4 opacity-30"
        fill="currentColor"
        viewBox="0 0 16 16"
      >
        <path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z" />
      </svg>
    );
  if (direction === "asc")
    return (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
        <path d="m7.247 4.86-4.796 5.481c-.566.647-.106 1.659.753 1.659h9.592a1 1 0 0 0 .753-1.659l-4.796-5.48a1 1 0 0 0-1.506 0z" />
      </svg>
    );
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
      <path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z" />
    </svg>
  );
};

export const VirtualizedTable = <T extends { [key: string]: any }>({
  columns,
  data,
  sortConfig,
  onSort,
  emptyMessage = "No data available.",
  rowKey,
  expandedRows,
  onRowClick,
  renderExpandedRow,
  height = "600px",
}: VirtualizedTableProps<T>) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const safeData = Array.isArray(data)
    ? data.filter((item) => item !== null && item !== undefined)
    : [];
  const safeColumns = Array.isArray(columns)
    ? columns.filter((col) => col !== null && col !== undefined)
    : [];

  // Create a stable set of expanded row keys for comparison
  const expandedRowsArray = useMemo(
    () => (expandedRows ? Array.from(expandedRows) : []),
    [expandedRows]
  );

  // Dynamic size estimation - expanded rows are much taller
  const getRowSize = useCallback(
    (index: number) => {
      const item = safeData[index];
      if (!item) return 50;
      const key = item[rowKey];
      const isExpanded = expandedRows?.has(key);
      // Expanded rows need ~400px for the expanded content
      return isExpanded ? 450 : 50;
    },
    [safeData, rowKey, expandedRows]
  );

  const rowVirtualizer = useVirtualizer({
    count: safeData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getRowSize,
    overscan: 5,
    // Force recalculation when expanded rows change
    measureElement: (element) => {
      return element?.getBoundingClientRect().height ?? 50;
    },
  });

  // Re-measure all rows when expandedRows changes
  useEffect(() => {
    // Reset measurements to force recalculation
    rowVirtualizer.measure();
  }, [expandedRowsArray.length, rowVirtualizer]);

  // CSS Grid Template
  const gridTemplateColumns = safeColumns
    .map((col) => col.width || "1fr")
    .join(" ");

  return (
    <div
      ref={parentRef}
      className="table-container overflow-auto relative border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950"
      style={{ height }}
    >
      {/* Header with premium shadow */}
      <div
        className="sticky top-0 z-10 bg-gradient-to-b from-white via-white to-white/95 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950/95 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-500 dark:text-gray-400 text-xs uppercase tracking-wider shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)]"
        style={{
          display: "grid",
          gridTemplateColumns,
          minWidth: "100%",
        }}
      >
        {safeColumns.map((col, index) => (
          <div
            key={index}
            className={`p-3 flex items-center gap-2 transition-colors duration-150 hover:text-slate-700 dark:hover:text-slate-200 ${
              col.accessor ? "cursor-pointer select-none" : ""
            } ${col.isNumeric ? "justify-end" : "justify-start"} ${
              col.className || ""
            }`}
            onClick={() => col.accessor && onSort(col.accessor as keyof T)}
          >
            {col.header}
            {col.accessor && (
              <SortIcon
                direction={
                  sortConfig.key === col.accessor ? sortConfig.direction : null
                }
              />
            )}
          </div>
        ))}
      </div>

      {/* Body */}
      <div
        style={{
          minHeight: `${rowVirtualizer.getTotalSize()}px`,
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {safeData.length === 0 ? (
          <div className="absolute top-0 left-0 w-full p-12 text-center">
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-slate-400 dark:text-slate-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z"
                  />
                </svg>
              </div>
              <div className="text-slate-500 dark:text-slate-400 font-medium">
                {emptyMessage}
              </div>
            </div>
          </div>
        ) : (
          rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = safeData[virtualRow.index];
            if (!item) return null;
            const key =
              item[rowKey] !== undefined
                ? item[rowKey]
                : `row-${virtualRow.index}`;
            const isExpanded = expandedRows ? expandedRows.has(key) : false;

            return (
              <div
                key={key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="text-sm"
              >
                {/* Main Row */}
                <div
                  className={`grid border-b border-slate-100 dark:border-slate-800/50 transition-all duration-150 ${
                    onRowClick
                      ? "cursor-pointer hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/30 dark:hover:from-blue-500/5 dark:hover:to-indigo-500/5 hover:shadow-[inset_3px_0_0_0_rgba(59,130,246,0.5)]"
                      : ""
                  } ${isExpanded ? "bg-slate-50/50 dark:bg-white/[0.02]" : ""}`}
                  style={{ gridTemplateColumns }}
                  onClick={() => onRowClick && onRowClick(key)}
                >
                  {safeColumns.map((col, colIndex) => (
                    <div
                      key={colIndex}
                      className={`p-2 whitespace-normal break-words ${
                        col.isNumeric ? "text-right" : "text-left"
                      } ${col.className || ""}`}
                    >
                      {col.render
                        ? col.render(item)
                        : col.accessor
                        ? item[col.accessor]
                        : null}
                    </div>
                  ))}
                </div>

                {/* Expanded Row */}
                {isExpanded && renderExpandedRow && (
                  <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5">
                    {renderExpandedRow(item)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
