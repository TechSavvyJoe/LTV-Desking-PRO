import React, { useMemo, useState, useEffect } from "react";
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
import { computeApproval, type ApprovalResult } from "../services/approval";
import { getCurrentUser } from "../lib/pocketbase";

// Approval-odds ring — the signature desk visual. Color tracks the score band.
const approvalColor = (s: number) =>
  s >= 72 ? "var(--color-success)" : s >= 50 ? "var(--color-warning)" : "var(--color-danger)";

const ApprovalRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 11;
  const sw = 3;
  const sz = r * 2 + sw + 3;
  const c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  const color = approvalColor(score);
  return (
    <span className="inline-flex items-center gap-2 justify-end">
      <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} className="shrink-0" aria-hidden>
        <circle
          cx={sz / 2}
          cy={sz / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth={sw}
        />
        <circle
          cx={sz / 2}
          cy={sz / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform={`rotate(-90 ${sz / 2} ${sz / 2})`}
        />
      </svg>
      <span className="font-mono font-bold tabular-nums text-[13px]" style={{ color }}>
        {score}
      </span>
    </span>
  );
};

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

  // Live deal context drives the approval-odds + lender-fit columns.
  const { lenderProfiles, dealData, filters, settings } = useDealContext();
  const canSeeGross = getCurrentUser()?.role !== "sales";

  const approvalMap = useMemo(() => {
    const m = new Map<string, ApprovalResult>();
    for (const item of safeVehicles) {
      if (item?.vin) {
        m.set(item.vin, computeApproval(item, { lenderProfiles, dealData, filters, settings }));
      }
    }
    return m;
  }, [safeVehicles, lenderProfiles, dealData, filters, settings]);

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
              className="flex justify-center items-center h-full w-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-500 rounded-md"
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
                // item.vehicle is already the correct display name — the old
                // template rebuild rendered literal "undefined" for missing
                // trim and persisted it into saved deals and PDFs. [C-tables]
                onStructureDeal &&
                  onStructureDeal({
                    ...item,
                    stock: item.stock || "",
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
        // Single Vehicle identity cell — bold name over a mono STK · mileage
        // subline. Replaces the old Year / Make / Model / Stock # / Miles columns.
        // accessor "make" keeps the header click-to-sort behavior intact.
        header: "Vehicle",
        accessor: "make" as const,
        className: "text-left",
        width: "minmax(200px, 2.5fr)",
        render: (item: CalculatedVehicle) => {
          const name =
            item.vehicle ||
            `${item.modelYear ?? ""} ${item.make ?? ""} ${item.model ?? ""} ${
              item.trim || ""
            }`.trim();
          return (
            <div className="min-w-0 py-0.5">
              <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-semibold leading-snug text-[13.5px] tracking-[-0.1px] text-[var(--color-text)]">
                {name}
              </span>
              <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] tabular-nums text-[var(--color-text-subtle)] mt-0.5">
                STK {item.stock || "—"} · {formatNumber(item.mileage)} mi
              </span>
            </div>
          );
        },
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
        className: "text-right font-semibold text-green-600 dark:text-green-400",
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
        header: "Lenders",
        className: "text-right",
        width: "minmax(70px, 90px)",
        render: (item: CalculatedVehicle) => {
          const ap = approvalMap.get(item.vin);
          if (!ap) return null;
          const color =
            ap.fitCount >= 3
              ? "var(--color-success)"
              : ap.fitCount >= 1
                ? "var(--color-warning)"
                : "var(--color-danger)";
          return (
            <span className="font-mono tabular-nums" style={{ color }}>
              {ap.fitCount}
              <span className="text-[var(--color-text-subtle)] text-xs">/{ap.total}</span>
            </span>
          );
        },
      },
      {
        header: "Approval",
        className: "text-right",
        width: "minmax(95px, 130px)",
        render: (item: CalculatedVehicle) => {
          const ap = approvalMap.get(item.vin);
          if (!ap || ap.score == null)
            return <span className="text-[var(--color-text-subtle)]">—</span>;
          return <ApprovalRing score={ap.score} />;
        },
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
    [expandedRows, favoriteVins, toggleFavorite, onStructureDeal, approvalMap]
  );

  // iPad portrait used to scroll Payment (column 14) off-screen — the one
  // number a desk conversation is about. Below the lg breakpoint, drop the
  // reference columns so Price / Payment / OTD LTV always stay visible. [G66]
  const [isWide, setIsWide] = useState(
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 1024px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setIsWide(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const NARROW_HIDDEN = useMemo(
    () => new Set(["Book (Trade)", "Front LTV", "Front Gross", "Amt to Fin", "VIN"]),
    []
  );

  const visibleColumns = useMemo(() => {
    let cols = isWide ? columns : columns.filter((c) => !NARROW_HIDDEN.has(c.header));
    // Salespeople never see dealer margin — hide Front Gross entirely (the backend
    // already strips unitCost; this removes the empty "N/A" column from their view).
    if (!canSeeGross) cols = cols.filter((c) => c.header !== "Front Gross");
    return cols;
  }, [columns, isWide, NARROW_HIDDEN, canSeeGross]);

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
