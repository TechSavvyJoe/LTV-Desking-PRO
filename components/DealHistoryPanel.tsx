import React, { useState, useMemo, useRef } from "react";
import type { SavedDeal } from "../types";
import Button from "./common/Button";
import * as Icons from "./common/Icons";
import { formatCurrency, formatDateTime } from "./common/TableCell";

type SortKey =
  | "date"
  | "customerName"
  | "vehicle.vehicle"
  | "vehicle.monthlyPayment"
  | "createdAt";

const sortOptions: { label: string; value: SortKey }[] = [
  { label: "Date", value: "date" },
  { label: "Customer", value: "customerName" },
  { label: "Vehicle", value: "vehicle.vehicle" },
  { label: "Payment", value: "vehicle.monthlyPayment" },
  { label: "Created", value: "createdAt" },
];

interface DealHistoryPanelProps {
  deals: SavedDeal[];
  onLoadDeal: (deal: SavedDeal) => void;
  onDeleteDeal: (id: string) => void;
}

const getNestedValue = (obj: any, path: string) => {
  if (!obj || !path) return undefined;
  return path
    .split(".")
    .reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
};

const DealHistoryPanel: React.FC<DealHistoryPanelProps> = ({
  deals,
  onLoadDeal,
  onDeleteDeal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const safeDeals = Array.isArray(deals) ? deals : [];

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setIsOpen(true);
    }, 150);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 250);
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [salespersonFilter, setSalespersonFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState({ start: "", end: "" });
  const [sortConfig, setSortConfig] = useState<{
    key: SortKey;
    direction: "asc" | "desc";
  }>({ key: "createdAt", direction: "desc" });

  const salespersons = useMemo(() => {
    const names = new Set(
      safeDeals.map((d) => d?.salespersonName).filter(Boolean)
    );
    return ["all", ...Array.from(names)];
  }, [safeDeals]);

  const filteredAndSortedDeals = useMemo(() => {
    let filtered = safeDeals.filter((deal) => {
      if (!deal) return false;

      // General Search
      const query = (searchQuery || "").toLowerCase().trim();
      const custName = deal.customerName
        ? String(deal.customerName).toLowerCase()
        : "";
      const vehicleLabel =
        deal.vehicle?.vehicle || deal.vehicleSnapshot?.vehicle || "";
      const vehName = vehicleLabel.toLowerCase();

      const searchMatch =
        !query || custName.includes(query) || vehName.includes(query);

      // Salesperson Filter
      const salespersonMatch =
        salespersonFilter === "all" ||
        deal.salespersonName === salespersonFilter;

      // Date Filter
      let dateMatch = true;
      if (dateFilter.start || dateFilter.end) {
        const dealDate = new Date(deal.date || deal.createdAt || 0);
        if (dateFilter.start) {
          const startDate = new Date(dateFilter.start);
          startDate.setHours(0, 0, 0, 0);
          if (dealDate < startDate) dateMatch = false;
        }
        if (dateMatch && dateFilter.end) {
          const endDate = new Date(dateFilter.end);
          endDate.setHours(23, 59, 59, 999);
          if (dealDate > endDate) dateMatch = false;
        }
      }

      return searchMatch && salespersonMatch && dateMatch;
    });

    filtered.sort((a, b) => {
      const valA =
        getNestedValue(a, sortConfig.key) ??
        getNestedValue(
          a,
          sortConfig.key.replace("vehicle.", "vehicleSnapshot.")
        );
      const valB =
        getNestedValue(b, sortConfig.key) ??
        getNestedValue(
          b,
          sortConfig.key.replace("vehicle.", "vehicleSnapshot.")
        );

      const isDateKey =
        sortConfig.key === "date" || sortConfig.key === "createdAt";
      const resolvedA = isDateKey
        ? new Date(valA || a.date || a.createdAt || 0).getTime()
        : valA;
      const resolvedB = isDateKey
        ? new Date(valB || b.date || b.createdAt || 0).getTime()
        : valB;

      if (resolvedA === undefined || resolvedA === null) return 1;
      if (resolvedB === undefined || resolvedB === null) return -1;

      let comparison = 0;
      if (typeof resolvedA === "number" && typeof resolvedB === "number") {
        comparison = resolvedA - resolvedB;
      } else {
        comparison = String(resolvedA).localeCompare(
          String(resolvedB),
          undefined,
          { sensitivity: "base" }
        );
      }

      return sortConfig.direction === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [safeDeals, searchQuery, sortConfig, salespersonFilter, dateFilter]);

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [key, direction] = e.target.value.split(":");
    setSortConfig({
      key: key as SortKey,
      direction: direction as "asc" | "desc",
    });
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSalespersonFilter("all");
    setDateFilter({ start: "", end: "" });
    setSortConfig({ key: "createdAt", direction: "desc" });
  };

  return (
    <div
      className="fixed top-40 left-0 h-40 z-[60] pointer-events-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`fixed top-0 left-0 h-full transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } pointer-events-auto`}
      >
        <div className="h-full w-full max-w-md bg-slate-950 shadow-2xl flex flex-col border-r border-slate-800">
          <div className="p-4 flex justify-between items-center border-b border-slate-800 flex-shrink-0">
            <h3 className="text-xl font-semibold text-white">Deal History</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-full text-slate-300 hover:bg-slate-800"
              title="Close deal history panel"
              aria-label="Close deal history panel"
            >
              <Icons.ChevronLeftIcon />
            </button>
          </div>
          <div className="p-4 border-b border-slate-800 space-y-3 flex-shrink-0">
            <input
              type="text"
              placeholder="Search by deal #, customer, vehicle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg placeholder-slate-500 text-slate-100 focus:outline-none focus:border-sky-400 focus:ring-0"
              title="Search deals"
              aria-label="Search by deal number, customer, or vehicle"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={salespersonFilter}
                onChange={(e) => setSalespersonFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-sky-400 focus:ring-0"
                title="Filter by salesperson"
                aria-label="Filter by salesperson"
              >
                {salespersons.map((name) => (
                  <option key={name} value={name}>
                    {name === "all" ? "All Salespeople" : name}
                  </option>
                ))}
              </select>
              <select
                value={`${sortConfig.key}:${sortConfig.direction}`}
                onChange={handleSortChange}
                className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-sky-400 focus:ring-0"
                title="Sort deals"
                aria-label="Sort deals by field and direction"
              >
                {sortOptions.flatMap((opt) => [
                  <option key={`${opt.value}:desc`} value={`${opt.value}:desc`}>
                    {opt.label} (Newest/High)
                  </option>,
                  <option key={`${opt.value}:asc`} value={`${opt.value}:asc`}>
                    {opt.label} (Oldest/Low)
                  </option>,
                ])}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3 items-center">
              <input
                type="date"
                value={dateFilter.start}
                onChange={(e) =>
                  setDateFilter((p) => ({ ...p, start: e.target.value }))
                }
                className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-sky-400 focus:ring-0"
                title="Start date filter"
                aria-label="Filter deals from start date"
              />
              <input
                type="date"
                value={dateFilter.end}
                onChange={(e) =>
                  setDateFilter((p) => ({ ...p, end: e.target.value }))
                }
                className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-sky-400 focus:ring-0"
                title="End date filter"
                aria-label="Filter deals to end date"
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={clearFilters}
            >
              Clear All Filters
            </Button>
          </div>

          <div className="p-4 flex-grow overflow-y-auto">
            {filteredAndSortedDeals.length === 0 ? (
              <p className="text-center text-slate-500 dark:text-slate-400 mt-8">
                {safeDeals.length > 0
                  ? "No deals match your search."
                  : "No deals saved yet."}
              </p>
            ) : (
              <div className="space-y-3">
                {filteredAndSortedDeals.map((deal) => (
                  <div
                    key={deal.id}
                    className="p-3 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-sm"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-base text-slate-900 dark:text-slate-100">
                          Deal {deal.id}
                        </p>
                        <p className="font-medium text-blue-600 dark:text-blue-400">
                          {deal.vehicle?.vehicle ||
                            deal.vehicleSnapshot?.vehicle ||
                            "Unknown Vehicle"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          className="!px-4 !py-1.5"
                          onClick={() => {
                            onLoadDeal(deal);
                            setIsOpen(false);
                          }}
                        >
                          Load
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          className="!p-2"
                          onClick={() => onDeleteDeal(deal.id)}
                          aria-label={`Delete deal #${deal.dealNumber}`}
                        >
                          <Icons.TrashIcon />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">
                          Customer:
                        </span>{" "}
                        <span className="font-medium text-slate-700 dark:text-slate-100">
                          {deal.customerName || "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">
                          Salesperson:
                        </span>{" "}
                        <span className="font-medium text-slate-700 dark:text-slate-100">
                          {deal.salespersonName || "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">
                          Payment:
                        </span>{" "}
                        <span className="font-medium text-green-600 dark:text-green-400">
                          {formatCurrency(deal.vehicleSnapshot?.monthlyPayment)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">
                          Amt Financed:
                        </span>{" "}
                        <span className="font-medium text-slate-700 dark:text-slate-100">
                          {formatCurrency(
                            deal.vehicleSnapshot?.amountToFinance
                          )}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-right">
                      {formatDateTime(deal.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div
        className="absolute top-0 left-0 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-4 rounded-r-lg shadow-lg cursor-pointer pointer-events-auto"
        aria-hidden="true"
      >
        <div className="flex flex-col items-center gap-2">
          <Icons.HistoryIcon />
          <span className="font-bold text-sm [writing-mode:vertical-rl] rotate-180">
            History
          </span>
        </div>
      </div>
    </div>
  );
};

export default DealHistoryPanel;
