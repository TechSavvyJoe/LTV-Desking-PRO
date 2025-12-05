import React, { useState, useEffect, useMemo } from "react";
import type {
  CalculatedVehicle,
  SortConfig,
  Vehicle,
  LenderProfile,
  DealData,
  FilterData,
  DealPdfData,
  Settings,
} from "../types";
import { useDealContext } from "../context/DealContext";
import { useSafeData } from "../hooks/useSafeData";
import { VirtualizedTable, VirtualizedColumn } from "./common/VirtualizedTable";
import * as Icons from "./common/Icons";
import CopyToClipboard from "./common/CopyToClipboard";
import {
  formatCurrency,
  formatNumber,
  LtvCell,
  GrossCell,
  OtdLtvCell,
  PaymentCell,
} from "./common/TableCell";
import Button from "./common/Button";
import Pagination from "./common/Pagination";

interface InventoryTableProps {
  data: CalculatedVehicle[];
  sortConfig: SortConfig;
  onSort: (key: keyof CalculatedVehicle) => void;
  onRowClick: (vin: string) => void;
  expandedRows: Set<string>;
  toggleFavorite: (vin: string) => void;
  favoriteVins: Set<string>;
  onStructureDeal?: (vehicle: CalculatedVehicle) => void;
  emptyMessage?: React.ReactNode;
  onLoadSampleData?: () => void;
  renderExpandedRow?: (vehicle: CalculatedVehicle) => React.ReactNode;
  pagination?: {
    currentPage: number;
    itemsPerPage: number;
  };
  setPagination?: (pagination: {
    currentPage: number;
    itemsPerPage: number;
  }) => void;
  totalRows?: number;
  isFavoritesView?: boolean;
  customHeight?: string;
}

const InventoryTable: React.FC<InventoryTableProps> = ({
  data,
  sortConfig,
  onSort,
  onRowClick,
  expandedRows,
  toggleFavorite,
  favoriteVins,
  onStructureDeal,
  emptyMessage,
  onLoadSampleData,
  renderExpandedRow,
  pagination,
  setPagination,
  totalRows,
  isFavoritesView,
  customHeight,
}) => {
  const safeVehicles = useSafeData(data);
  const normalizedVehicles = safeVehicles;
  const handleSort = onSort;

  // Calculate dynamic height for favorites view
  const tableHeight =
    customHeight ||
    (isFavoritesView
      ? `${Math.min(Math.max(safeVehicles.length * 60 + 60, 120), 400)}px`
      : "calc(100vh - 250px)");

  // Memoize columns to prevent re-renders
  const columns = useMemo<VirtualizedColumn<CalculatedVehicle>[]>(
    () => [
      {
        header: "",
        className: "text-center",
        width: "50px",
        render: (item: CalculatedVehicle) => {
          if (!item || !item.vin) return null;
          const isExpanded = expandedRows?.has(item.vin) || false;
          return (
            <button
              className="flex justify-center items-center h-full w-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 rounded-md"
              onClick={(e) => {
                e.stopPropagation();
                onRowClick(item.vin);
              }}
              aria-label={isExpanded ? "Collapse row" : "Expand row"}
              aria-expanded={isExpanded}
            >
              <Icons.ChevronDownIcon
                className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
                  isExpanded ? "rotate-180" : "-rotate-90"
                }`}
              />
            </button>
          );
        },
      },
      {
        header: "Actions",
        className: "text-center",
        width: "120px",
        render: (item: CalculatedVehicle) => (
          <div className="flex justify-center items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(item.vin);
              }}
              className="group relative p-2 hover:bg-gradient-to-br hover:from-amber-50 hover:to-yellow-50 dark:hover:from-amber-900/20 dark:hover:to-yellow-900/20 rounded-lg transition-all duration-200 hover:scale-105"
              title={
                favoriteVins?.has(item.vin)
                  ? "Remove from favorites"
                  : "Add to favorites"
              }
            >
              {favoriteVins?.has(item.vin) ? (
                <Icons.StarIcon className="w-5 h-5 text-yellow-500 fill-current drop-shadow-sm" />
              ) : (
                <Icons.StarIcon className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-yellow-400 transition-colors" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStructureDeal &&
                  onStructureDeal({
                    ...item,
                    stock: item.stock || "",
                    vehicle: `${item.modelYear} ${item.make} ${item.model} ${item.trim}`,
                  });
              }}
              className="group relative px-2.5 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 dark:from-blue-600 dark:to-indigo-600 dark:hover:from-blue-500 dark:hover:to-indigo-500 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md hover:scale-105"
              title="Structure Deal"
            >
              <Icons.CurrencyDollarIcon className="w-5 h-5 text-white" />
            </button>
          </div>
        ),
      },
      {
        header: "Year",
        accessor: "modelYear" as const,
        isNumeric: true,
        width: "60px",
        render: (item: CalculatedVehicle) => (
          <CopyToClipboard valueToCopy={item.modelYear}>
            <span className="tabular-nums">{item.modelYear}</span>
          </CopyToClipboard>
        ),
      },
      {
        header: "Make",
        accessor: "make" as const,
        className: "font-medium text-slate-900 dark:text-gray-100",
        width: "100px",
      },
      {
        header: "Model",
        accessor: "model" as const,
        className: "text-slate-500 dark:text-gray-400",
        width: "150px",
        render: (item: CalculatedVehicle) => (
          <span>
            {item.model} {item.trim}
          </span>
        ),
      },
      {
        header: "Stock #",
        accessor: "stock" as const,
        className: "text-slate-500 dark:text-gray-400",
        width: "80px",
      },
      {
        header: "Miles",
        accessor: "mileage" as const,
        isNumeric: true,
        width: "80px",
        render: (item: CalculatedVehicle) => (
          <CopyToClipboard valueToCopy={item.mileage}>
            <span className="tabular-nums">{formatNumber(item.mileage)}</span>
          </CopyToClipboard>
        ),
      },
      {
        header: "Price",
        accessor: "price" as const,
        isNumeric: true,
        className: "text-right font-medium",
        width: "100px",
        render: (item: CalculatedVehicle) => (
          <CopyToClipboard valueToCopy={item.price}>
            <span className="tabular-nums">{formatCurrency(item.price)}</span>
          </CopyToClipboard>
        ),
      },
      {
        header: "Book (Trade)",
        accessor: "jdPower" as const,
        isNumeric: true,
        className: "text-right",
        width: "100px",
        render: (item: CalculatedVehicle) => (
          <CopyToClipboard valueToCopy={item.jdPower}>
            <span className="tabular-nums">{formatCurrency(item.jdPower)}</span>
          </CopyToClipboard>
        ),
      },
      {
        header: "Front LTV",
        accessor: "frontEndLtv" as const,
        isNumeric: true,
        className: "text-right",
        width: "80px",
        render: (item: CalculatedVehicle) => (
          <LtvCell value={item.frontEndLtv} />
        ),
      },
      {
        header: "Front Gross",
        accessor: "frontEndGross" as const,
        isNumeric: true,
        className: "text-right",
        width: "100px",
        render: (item: CalculatedVehicle) => (
          <GrossCell value={item.frontEndGross} />
        ),
      },
      {
        header: "Amt to Fin",
        accessor: "amountToFinance" as const,
        isNumeric: true,
        className: "text-right font-semibold text-blue-600 dark:text-blue-400",
        width: "120px",
        render: (item: CalculatedVehicle) => (
          <CopyToClipboard valueToCopy={item.amountToFinance}>
            <span className="tabular-nums">
              {formatCurrency(item.amountToFinance)}
            </span>
          </CopyToClipboard>
        ),
      },
      {
        header: "OTD LTV",
        accessor: "otdLtv" as const,
        isNumeric: true,
        className: "text-right",
        width: "80px",
        render: (item: CalculatedVehicle) => <OtdLtvCell value={item.otdLtv} />,
      },
      {
        header: "Payment",
        accessor: "monthlyPayment" as const,
        isNumeric: true,
        className: "text-right",
        width: "100px",
        render: (item: CalculatedVehicle) => (
          <PaymentCell value={item.monthlyPayment} />
        ),
      },
      {
        header: "VIN",
        accessor: "vin" as const,
        className: "max-w-[220px]",
        width: "220px",
        render: (item: CalculatedVehicle) => (
          <CopyToClipboard valueToCopy={item.vin}>
            <span className="font-mono text-xs break-all">{item.vin}</span>
          </CopyToClipboard>
        ),
      },
    ],
    [expandedRows, favoriteVins, toggleFavorite, onStructureDeal]
  );

  const visibleColumns = useMemo(() => {
    return columns;
  }, [columns]);

  return (
    <div className="h-full flex flex-col">
      <VirtualizedTable
        columns={visibleColumns}
        data={normalizedVehicles}
        sortConfig={sortConfig}
        onSort={handleSort}
        emptyMessage={
          emptyMessage || (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <p className="text-slate-500 dark:text-slate-400 text-lg">
                No vehicles found.
              </p>
              {onLoadSampleData && (
                <Button onClick={onLoadSampleData} variant="primary">
                  <Icons.CloudArrowDownIcon className="w-5 h-5 mr-2" />
                  Load Sample Inventory
                </Button>
              )}
            </div>
          )
        }
        rowKey="vin"
        expandedRows={expandedRows}
        onRowClick={(key) => onRowClick(String(key))}
        renderExpandedRow={renderExpandedRow}
        height={tableHeight}
      />
      {pagination && setPagination && !isFavoritesView && (
        <Pagination
          totalItems={totalRows ?? safeVehicles.length}
          pagination={pagination}
          setPagination={setPagination}
        />
      )}
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export default React.memo(InventoryTable);
