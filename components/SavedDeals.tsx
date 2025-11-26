import React from "react";
import Button from "./common/Button";
import { SavedDeal } from "../types";

interface SavedDealsProps {
  deals: SavedDeal[];
  onLoad: (deal: SavedDeal) => void;
  onDelete: (id: string) => void;
}

const SavedDeals: React.FC<SavedDealsProps> = ({ deals, onLoad, onDelete }) => {
  if (deals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500">
        <p className="text-lg font-medium">No saved deals yet</p>
        <p className="text-sm">
          Structure a deal and click "Save Deal" to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th className="px-6 py-3 font-semibold">Date</th>
            <th className="px-6 py-3 font-semibold">Customer</th>
            <th className="px-6 py-3 font-semibold">Vehicle</th>
            <th className="px-6 py-3 font-semibold">Salesperson</th>
            <th className="px-6 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {deals.map((deal) => (
            <tr
              key={deal.id}
              className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <td className="px-6 py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                {new Date(deal.date || deal.createdAt || Date.now()).toLocaleDateString()}
              </td>
              <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                {deal.customerName}
              </td>
              <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                {deal.vehicle?.modelYear || deal.vehicleSnapshot?.modelYear || "N/A"}{" "}
                {deal.vehicle?.vehicle || deal.vehicleSnapshot?.vehicle || ""}
              </td>
              <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                {deal.salespersonName || "-"}
              </td>
              <td className="px-6 py-4 text-right space-x-2">
                <Button size="sm" onClick={() => onLoad(deal)}>
                  Load
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => onDelete(deal.id)}
                >
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SavedDeals;
