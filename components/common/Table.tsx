
import React from 'react';
import type { SortConfig } from '../../types';

interface Column<T> {
  header: string;
  accessor: keyof T;
  className?: string;
  isNumeric?: boolean;
  render?: (item: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  sortConfig: SortConfig;
  onSort: (key: keyof T) => void;
  emptyMessage?: string;
  rowKey: keyof T;
  expandedRows?: Set<string | number>;
  onRowClick?: (rowKey: string | number) => void;
  renderExpandedRow?: (item: T) => React.ReactNode;
}

const SortIcon = ({ direction }: { direction: 'asc' | 'desc' | null }) => {
    if (!direction) return <svg className="w-4 h-4 opacity-30" fill="currentColor" viewBox="0 0 16 16"><path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z" /></svg>;
    if (direction === 'asc') return <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><path d="m7.247 4.86-4.796 5.481c-.566.647-.106 1.659.753 1.659h9.592a1 1 0 0 0 .753-1.659l-4.796-5.48a1 1 0 0 0-1.506 0z" /></svg>;
    return <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z" /></svg>;
};


export const Table = <T extends { [key: string]: any }>({ columns, data, sortConfig, onSort, emptyMessage = "No data available.", rowKey, expandedRows, onRowClick, renderExpandedRow }: TableProps<T>) => {
    // Defensive check: If data/columns is undefined or not an array, default to empty array
    const safeData = Array.isArray(data) ? data.filter(item => item !== null && item !== undefined) : [];
    const safeColumns = Array.isArray(columns) ? columns.filter(col => col !== null && col !== undefined) : [];

    return (
        <div className="table-container overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-x-border">
                        {safeColumns.map((col, index) => (
                            <th
                                key={index}
                                className={`p-3 font-bold text-x-text-secondary text-left ${col.className || ''}`}
                                onClick={() => col.accessor && onSort(col.accessor as keyof T)}
                            >
                                <div className="flex items-center gap-2 cursor-pointer select-none">
                                    {col.header}
                                    {col.accessor && (
                                        <SortIcon direction={sortConfig.key === col.accessor ? sortConfig.direction : null} />
                                    )}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {safeData.length === 0 ? (
                        <tr>
                            <td colSpan={safeColumns.length > 0 ? safeColumns.length : 1} className="p-6 text-center text-x-text-secondary">{emptyMessage}</td>
                        </tr>
                    ) : (
                        safeData.map((item, rowIndex) => {
                            // Extra safety check in case filter failed or array was mutated
                            if (!item) return null;
                            
                            const key = item[rowKey] || rowIndex;
                            const isExpanded = expandedRows?.has(key);
                            return (
                                <React.Fragment key={key}>
                                    <tr
                                        className={`border-b border-x-border transition-colors ${onRowClick ? 'cursor-pointer hover:bg-x-hover-dark' : ''}`}
                                        onClick={() => onRowClick && onRowClick(key)}
                                    >
                                        {safeColumns.map((col, colIndex) => (
                                            <td key={colIndex} className={`p-3 whitespace-nowrap align-top ${col.className || ''}`}>
                                                {col.render ? col.render(item) : item[col.accessor]}
                                            </td>
                                        ))}
                                    </tr>
                                    {isExpanded && renderExpandedRow && (
                                        <tr className="border-b border-x-border bg-x-hover-dark">
                                            <td colSpan={safeColumns.length} className="p-0">
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
