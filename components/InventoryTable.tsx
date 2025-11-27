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
import { useSafeData } from "../hooks/useSafeData";
import { Table } from "./common/Table";
import {
  LtvCell,
  OtdLtvCell,
  GrossCell,
  PaymentCell,
  formatCurrency,
  formatNumber,
} from "./common/TableCell";
import { checkBankEligibility } from "../services/lenderMatcher";
import { generateDealPdf } from "../services/pdfGenerator";
import Button from "./common/Button";
import CopyToClipboard from "./common/CopyToClipboard";
import * as Icons from "./common/Icons";
import { InventoryExpandedRow } from "./InventoryExpandedRow";
import Pagination from "./Pagination";

const DetailItem = ({
  label,
  value,
  valueToCopy,
}: {
  label: string;
  value: React.ReactNode;
  valueToCopy?: string | number | "N/A" | "Error";
}) => (
  <div className="flex justify-between items-center text-sm py-0.5">
    <span className="text-slate-500 dark:text-gray-400">{label}</span>
    {valueToCopy !== undefined ? (
      <CopyToClipboard valueToCopy={valueToCopy}>
        <span className="font-medium text-slate-900 dark:text-gray-100 hover:text-blue-500 transition-colors">
          {value}
        </span>
      </CopyToClipboard>
    ) : (
      <span className="font-medium text-slate-900 dark:text-gray-100">
        {value}
      </span>
    )}
  </div>
);

const StyledSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className="w-28 p-1 text-sm text-right border border-slate-300 dark:border-gray-700 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-transparent text-slate-900 dark:text-gray-100 cursor-pointer"
  />
);

const EditableField = ({
  label,
  value,
  onUpdate,
  type = "number",
  step = "1",
}: {
  label: string;
  value: number | "N/A";
  onUpdate: (newValue: number) => void;
  type?: string;
  step?: string;
}) => {
  const [currentValue, setCurrentValue] = useState(
    value === "N/A" ? "" : value.toString()
  );

  useEffect(() => {
    setCurrentValue(value === "N/A" ? "" : value.toString());
  }, [value]);

  const handleBlur = () => {
    const newValue = parseFloat(currentValue);
    if (!isNaN(newValue) && newValue >= 0) {
      onUpdate(newValue);
    } else {
      setCurrentValue(value === "N/A" ? "" : value.toString()); // Revert if invalid
    }
  };

  return (
    <div className="flex justify-between items-center text-sm py-0.5">
      <label className="text-slate-500 dark:text-gray-400">{label}</label>
      <input
        type={type}
        step={step}
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={handleBlur}
        onClick={(e) => e.stopPropagation()} // Stop click from collapsing row
        className="w-28 p-1 text-sm text-right border border-slate-300 dark:border-gray-700 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-transparent text-slate-900 dark:text-gray-100"
      />
    </div>
  );
};

interface InventoryTableProps {
  vehicles: CalculatedVehicle[];
  favorites: Vehicle[];
  toggleFavorite: (vin: string) => void;
  sortConfig: SortConfig;
  onSort: (key: keyof CalculatedVehicle) => void;
  expandedRows: Set<string>;
  onRowClick: (vin: string) => void;
  onStructureDeal?: (vehicle: CalculatedVehicle) => void;
  lenderProfiles: LenderProfile[];
  dealData: DealData;
  setDealData: React.Dispatch<React.SetStateAction<DealData>>;
  onInventoryUpdate: (vin: string, updatedData: Partial<Vehicle>) => void;
  customerFilters: FilterData;
  customerName: string;
  salespersonName: string;
  settings: Settings;
  title?: string;
  icon?: React.ReactNode;
  onLoadSampleData?: () => void;
  emptyMessage?: React.ReactNode;
  pagination?: { currentPage: number; rowsPerPage: number };
  setPagination?: React.Dispatch<
    React.SetStateAction<{ currentPage: number; rowsPerPage: number }>
  >;
  totalRows?: number;
  isFavoritesView?: boolean;
}

const InventoryTable: React.FC<InventoryTableProps> = ({
  vehicles,
  favorites,
  toggleFavorite,
  sortConfig,
  onSort,
  expandedRows,
  onRowClick,
  onStructureDeal,
  lenderProfiles,
  dealData,
  setDealData,
  onInventoryUpdate,
  customerFilters,
  customerName,
  salespersonName,
  settings,
  title = "Inventory",
  icon,
  onLoadSampleData,
  emptyMessage,
  pagination,
  setPagination,
  totalRows,
  isFavoritesView,
}) => {
  // Defensive: Ensure favorites is an array and items are valid objects
  const favoriteVins = useMemo(() => {
    if (!Array.isArray(favorites)) return new Set<string>();
    return new Set(
      favorites
        .filter((f) => f && typeof f === "object" && f.vin)
        .map((f) => f.vin)
    );
  }, [favorites]);

  const isShareSupported =
    typeof navigator !== "undefined" && !!navigator.share;

  const handleSort = (key: keyof CalculatedVehicle) => {
    onSort(key);
  };

  // Memoize columns to prevent re-renders
  const columns = useMemo(
    () => [
      {
        header: "",
        accessor: "expand" as const,
        className: "w-10 text-center",
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
        className: "text-center w-24",
        render: (item: CalculatedVehicle) => (
          <div className="flex justify-center items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(item.vin);
              }}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              title={
                favoriteVins.has(item.vin)
                  ? "Remove from favorites"
                  : "Add to favorites"
              }
            >
              {favoriteVins.has(item.vin) ? (
                <Icons.StarIcon className="w-5 h-5 text-yellow-500 fill-current" />
              ) : (
                <Icons.StarIcon className="w-5 h-5 text-slate-400" />
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
              className="p-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 rounded-lg transition-colors group"
              title="Structure Deal"
            >
              <Icons.CurrencyDollarIcon className="w-6 h-6 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        ),
      },
      {
        header: "Make",
        accessor: "make" as const,
        className: "font-medium text-slate-900 dark:text-gray-100",
      },
      {
        header: "Model",
        accessor: "model" as const,
        className: "text-slate-500 dark:text-gray-400",
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
      },
      {
        header: "Year",
        accessor: "modelYear" as const,
        isNumeric: true,
        render: (item: CalculatedVehicle) => (
          <CopyToClipboard valueToCopy={item.modelYear}>
            <span className="tabular-nums">{item.modelYear}</span>
          </CopyToClipboard>
        ),
      },
      {
        header: "Miles",
        accessor: "mileage" as const,
        isNumeric: true,
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
        render: (item: CalculatedVehicle) => (
          <LtvCell value={item.frontEndLtv} />
        ),
      },
      {
        header: "Front Gross",
        accessor: "frontEndGross" as const,
        isNumeric: true,
        className: "text-right",
        render: (item: CalculatedVehicle) => (
          <GrossCell value={item.frontEndGross} />
        ),
      },
      {
        header: "Amt to Fin",
        accessor: "amountToFinance" as const,
        isNumeric: true,
        className: "text-right font-semibold text-blue-600 dark:text-blue-400",
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
        render: (item: CalculatedVehicle) => <OtdLtvCell value={item.otdLtv} />,
      },
      {
        header: "Payment",
        accessor: "monthlyPayment" as const,
        isNumeric: true,
        className: "text-right",
        render: (item: CalculatedVehicle) => (
          <PaymentCell value={item.monthlyPayment} />
        ),
      },
      {
        header: "VIN",
        accessor: "vin" as const,
        className: "max-w-[220px]",
        render: (item: CalculatedVehicle) => (
          <CopyToClipboard valueToCopy={item.vin}>
            <span className="font-mono text-xs break-all">{item.vin}</span>
          </CopyToClipboard>
        ),
      },
    ],
    [expandedRows, favoriteVins, toggleFavorite, onStructureDeal]
  ); // Dependencies

  const preparePdfData = (vehicle: CalculatedVehicle): DealPdfData => {
    const safeProfiles = (
      Array.isArray(lenderProfiles) ? lenderProfiles : []
    ).filter((p) => p && typeof p === "object");

    const eligibilityDetails = safeProfiles.map((bank) => {
      try {
        return {
          name: bank.name,
          ...checkBankEligibility(
            vehicle,
            { ...dealData, ...customerFilters },
            bank
          ),
        };
      } catch (e) {
        return {
          name: bank.name || "Unknown",
          eligible: false,
          reasons: ["Error checking eligibility"],
          matchedTier: null,
        };
      }
    });

    return {
      vehicle,
      dealData,
      customerFilters: {
        creditScore: customerFilters.creditScore,
        monthlyIncome: customerFilters.monthlyIncome,
      },
      customerName,
      salespersonName,
      lenderEligibility: eligibilityDetails,
    };
  };

  const handleDownloadPdf = async (
    e: React.MouseEvent,
    vehicle: CalculatedVehicle
  ) => {
    e.stopPropagation();
    try {
      const pdfData = preparePdfData(vehicle);
      const blob = await generateDealPdf(pdfData, settings);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please check deal data.");
    }
  };

  const handleSharePdf = async (
    e: React.MouseEvent,
    vehicle: CalculatedVehicle
  ) => {
    e.stopPropagation();
    try {
      const pdfData = preparePdfData(vehicle);
      const blob = await generateDealPdf(pdfData, settings);
      const file = new File([blob], `Deal_Sheet_${vehicle.vehicle}.pdf`, {
        type: "application/pdf",
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Deal Sheet for ${vehicle.vehicle}`,
          text: `Here are the numbers for the ${vehicle.vehicle}.`,
          files: [file],
        });
      } else {
        alert("Sharing is not supported on this device.");
      }
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const renderExpandedRow = (item: CalculatedVehicle) => {
    if (!item) return null;
    return (
      <InventoryExpandedRow
        item={item}
        lenderProfiles={lenderProfiles}
        dealData={dealData}
        setDealData={setDealData}
        onInventoryUpdate={onInventoryUpdate}
        customerFilters={customerFilters}
        settings={settings}
        onDownloadPdf={handleDownloadPdf}
        onSharePdf={handleSharePdf}
        isShareSupported={isShareSupported}
      />
    );
  };

  const safeVehicles = useSafeData(vehicles);
  const normalizedVehicles = safeVehicles.map(
    (v: CalculatedVehicle, idx: number) => {
      const vin =
        v.vin && v.vin !== "N/A" && v.vin.length >= 11
          ? v.vin
          : `VIN-${v.stock || "ROW"}-${v.vehicle || "VEH"}-${idx}`;
      return { ...v, vin };
    }
  );

  return (
    <div className="my-8">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-200 dark:border-gray-700 flex items-center gap-2">
        {icon || <Icons.CarIcon className="w-6 h-6 text-blue-500" />} {title}
      </h2>
      <Table
        columns={columns}
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
        onRowClick={onRowClick}
        renderExpandedRow={renderExpandedRow}
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

export default InventoryTable;
