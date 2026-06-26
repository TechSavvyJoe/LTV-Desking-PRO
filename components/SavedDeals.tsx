import React from "react";
import Button from "./common/Button";
import * as Icons from "./common/Icons";
import { EmptyState } from "./common/states";
import { SavedDeal } from "../types";
import { useStaggerAnimation } from "../hooks/useAnimation";

interface SavedDealsProps {
  deals: SavedDeal[];
  onLoad: (deal: SavedDeal) => void;
  onDelete: (id: string) => void;
}

/**
 * Client-side CSV export of saved deals — the dealer's data-portability /
 * pilot-rollback path promised in the Privacy Policy. [G75]
 */
const exportDealsCsv = (deals: SavedDeal[]): void => {
  const esc = (v: unknown): string => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    [
      "Date",
      "Customer",
      "Salesperson",
      "Vehicle",
      "VIN",
      "Price",
      "Down Payment",
      "Trade Value",
      "Trade Payoff",
      "Term (mo)",
      "APR (%)",
      "Backend ($)",
      "Monthly Payment",
      "Amount Financed",
      "Notes",
    ].map(esc),
    ...deals.map((d) =>
      [
        d.date || d.createdAt || "",
        d.customerName,
        d.salespersonName,
        d.vehicle?.vehicle ?? "",
        d.vehicle?.vin ?? "",
        d.vehicle?.price ?? "",
        d.dealData?.downPayment ?? "",
        d.dealData?.tradeInValue ?? "",
        d.dealData?.tradeInPayoff ?? "",
        d.dealData?.loanTerm ?? "",
        d.dealData?.interestRate ?? "",
        d.dealData?.backendProducts ?? "",
        d.vehicle?.monthlyPayment ?? "",
        d.vehicle?.amountToFinance ?? "",
        d.notes ?? "",
      ].map(esc)
    ),
  ];
  const csv = rows.map((r) => r.join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `saved-deals-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

const SavedDeals: React.FC<SavedDealsProps> = ({ deals, onLoad, onDelete }) => {
  const visibleItems = useStaggerAnimation(deals.length, 100, 60);
  if (deals.length === 0) {
    return (
      <EmptyState
        icon={<Icons.FolderIcon className="w-full h-full" />}
        title="No saved deals yet"
        description="Structure a deal from the inventory tab and click Save — it'll appear here so you can come back to it tomorrow or share it with another desk."
      />
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Saved Deals</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {deals.length} {deals.length === 1 ? "deal" : "deals"} saved
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => exportDealsCsv(deals)}>
          <Icons.DocumentArrowDownIcon className="w-4 h-4 mr-1.5" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4">
        {deals.map((deal, index) => (
          <div
            key={deal.id}
            className={`group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden hover:shadow-lg hover:border-green-200 dark:hover:border-slate-700 transition-all duration-300 ${
              visibleItems[index] ? "animate-slideInUp" : "opacity-0"
            }`}
          >
            {/* Subtle gradient accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--color-primary)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                {/* Left: Deal Info */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <Icons.UserIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                        {deal.customerName}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-1">
                        <Icons.CalendarDaysIcon className="w-4 h-4" />
                        {new Date(deal.date || deal.createdAt || Date.now()).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {/* Vehicle Info */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                      <Icons.CarIcon className="w-4 h-4 text-slate-400" />
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {/* The vehicle name string already starts with the model
                            year — prefixing it again rendered "2021 2021 Honda". */}
                        {deal.vehicle?.vehicle ||
                          deal.vehicleSnapshot?.vehicle ||
                          deal.vehicle?.modelYear ||
                          "N/A"}
                      </span>
                    </div>

                    {/* Salesperson (if available) */}
                    {deal.salespersonName && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                        <Icons.BriefcaseIcon className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-600 dark:text-slate-400">
                          {deal.salespersonName}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex sm:flex-col gap-2 sm:items-end">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onLoad(deal)}
                    className="flex-1 sm:flex-none"
                  >
                    <Icons.ArrowPathIcon className="w-4 h-4 mr-2" />
                    Load
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(deal.id)}
                    className="flex-1 sm:flex-none text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <Icons.TrashIcon className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders when deals array hasn't changed
export default React.memo(SavedDeals);
