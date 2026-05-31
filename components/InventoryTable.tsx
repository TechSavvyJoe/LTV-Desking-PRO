import React, { useMemo } from "react";
import type { CalculatedVehicle, SortConfig } from "../types";
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
import { EmptyState } from "./common/states";
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
  setPagination?: (pagination: { currentPage: number; itemsPerPage: number }) => void;
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

  // Check if any row is expanded in favorites view
  const hasExpandedRow = isFavoritesView && expandedRows && expandedRows.size > 0;

  // Calculate dynamic height for favorites view
  // When a row is expanded, allow more height to show content
  const tableHeight =
    customHeight ||
    (isFavoritesView
      ? hasExpandedRow
        ? `${Math.min(safeVehicles.length * 60 + 450, 800)}px` // More height when expanded
        : `${Math.min(Math.max(safeVehicles.length * 60 + 60, 120), 400)}px`
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
              className="group relative p-1.5 rounded text-[var(--color-text-subtle)] hover:bg-[var(--color-warning-subtle)] hover:text-[var(--color-warning)] transition-colors"
              title={favoriteVins?.has(item.vin) ? "Remove from favorites" : "Add to favorites"}
            >
              {favoriteVins?.has(item.vin) ? (
                <Icons.StarIcon className="w-5 h-5 text-[var(--color-warning)] fill-current" />
              ) : (
                <Icons.StarIcon className="w-5 h-5 group-hover:text-[var(--color-warning)] transition-colors" />
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
              className="group relative px-2.5 py-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded transition-colors duration-[120ms]"
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
        width: "minmax(60px, 80px)",
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
        width: "minmax(80px, 1fr)",
      },
      {
        header: "Model",
        accessor: "model" as const,
        className: "text-slate-500 dark:text-gray-400",
        width: "minmax(120px, 2fr)",
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
        width: "minmax(70px, 100px)",
      },
      {
        header: "Miles",
        accessor: "mileage" as const,
        isNumeric: true,
        width: "minmax(70px, 100px)",
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
        width: "minmax(85px, 120px)",
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
        width: "minmax(85px, 120px)",
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
        width: "minmax(70px, 100px)",
        render: (item: CalculatedVehicle) => <LtvCell value={item.frontEndLtv} />,
      },
      {
        header: "Front Gross",
        accessor: "frontEndGross" as const,
        isNumeric: true,
        className: "text-right",
        width: "minmax(80px, 110px)",
        render: (item: CalculatedVehicle) => <GrossCell value={item.frontEndGross} />,
      },
      {
        header: "Amt to Fin",
        accessor: "amountToFinance" as const,
        isNumeric: true,
        className: "text-right font-semibold text-blue-600 dark:text-blue-400",
        width: "minmax(95px, 130px)",
        render: (item: CalculatedVehicle) => (
          <CopyToClipboard valueToCopy={item.amountToFinance}>
            <span className="tabular-nums">{formatCurrency(item.amountToFinance)}</span>
          </CopyToClipboard>
        ),
      },
      {
        header: "OTD LTV",
        accessor: "otdLtv" as const,
        isNumeric: true,
        className: "text-right",
        width: "minmax(70px, 100px)",
        render: (item: CalculatedVehicle) => <OtdLtvCell value={item.otdLtv} />,
      },
      {
        header: "Payment",
        accessor: "monthlyPayment" as const,
        isNumeric: true,
        className: "text-right",
        width: "minmax(80px, 110px)",
        render: (item: CalculatedVehicle) => <PaymentCell value={item.monthlyPayment} />,
      },
      {
        header: "VIN",
        accessor: "vin" as const,
        className: "",
        width: "minmax(180px, 1.5fr)",
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
        data={safeVehicles}
        sortConfig={sortConfig}
        onSort={onSort}
        emptyMessage={
          emptyMessage || (
            <EmptyState
              icon={<Icons.CloudArrowDownIcon className="w-full h-full" />}
              title={isFavoritesView ? "No favorites yet" : "No vehicles in inventory"}
              description={
                isFavoritesView
                  ? "Star a vehicle from the inventory table to build a shortlist you can structure deals against."
                  : "Upload a CSV or XLSX of your inventory to get started, or try the bundled sample data."
              }
              primaryAction={
                !isFavoritesView && onLoadSampleData
                  ? { label: "Try with sample inventory", onClick: onLoadSampleData }
                  : undefined
              }
            />
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
