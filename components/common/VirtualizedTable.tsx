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
  const expandedRowsArray = useMemo(() => 
    expandedRows ? Array.from(expandedRows) : [], 
    [expandedRows]
  );

  // Dynamic size estimation - expanded rows are much taller
  const getRowSize = useCallback((index: number) => {
    const item = safeData[index];
    if (!item) return 50;
    const key = item[rowKey];
    const isExpanded = expandedRows?.has(key);
    // Expanded rows need ~400px for the expanded content
    return isExpanded ? 450 : 50;
  }, [safeData, rowKey, expandedRows]);

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
      {/* Header */}
      <div
        className="sticky top-0 z-10 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-400 dark:text-gray-400 text-sm"
        style={{
          display: "grid",
          gridTemplateColumns,
          minWidth: "100%",
        }}
      >
        {safeColumns.map((col, index) => (
          <div
            key={index}
            className={`p-2 flex items-center gap-2 cursor-pointer select-none ${
              col.isNumeric ? "justify-end" : "justify-start"
            } ${col.className || ""}`}
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
          <div className="absolute top-0 left-0 w-full p-6 text-center text-slate-500 dark:text-gray-400">
            {emptyMessage}
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
                  className={`grid border-b border-slate-200 dark:border-slate-800 transition-colors ${
                    onRowClick
                      ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"
                      : ""
                  }`}
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
