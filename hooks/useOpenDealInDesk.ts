import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDealContext } from "../context/DealContext";
import type { SavedDeal } from "../types";

/**
 * Restores a saved deal onto the desk — customer, salesperson, structure,
 * credit filters, notes — and focuses the saved unit if it's still in live
 * inventory (legacy SavedDeals.onLoad semantics). Shared by the pipeline's
 * "Open in desk" and the ⌘K palette so the two can never drift. [takeover-P1 #8]
 */
export function useOpenDealInDesk(): (deal: SavedDeal) => void {
  const {
    setCustomerName,
    setSalespersonName,
    setDealData,
    setFilters,
    setScratchPadNotes,
    setActiveVehicle,
    setFocusVin,
    processedInventory,
    setMessage,
  } = useDealContext();
  const navigate = useNavigate();

  return useCallback(
    (deal: SavedDeal) => {
      setCustomerName(deal.customerName);
      setSalespersonName(deal.salespersonName || "");
      setDealData(deal.dealData);
      setFilters((prev) => ({
        ...prev,
        creditScore: deal.customerFilters?.creditScore ?? null,
        monthlyIncome: deal.customerFilters?.monthlyIncome ?? null,
      }));
      setScratchPadNotes(deal.notes || "");

      // Focus the saved vehicle only if it still exists in live inventory.
      const vin = deal.vehicle?.vin;
      const live = vin ? processedInventory.find((v) => v.vin === vin) : undefined;
      if (live) {
        setFocusVin(live.vin);
        setActiveVehicle(live);
        setMessage({ type: "success", text: "Deal loaded successfully." });
      } else {
        setFocusVin(null);
        setActiveVehicle(null);
        setMessage({
          type: "warning",
          text: "Vehicle no longer in inventory; deal terms restored",
        });
      }
      navigate("/desk");
    },
    [
      setCustomerName,
      setSalespersonName,
      setDealData,
      setFilters,
      setScratchPadNotes,
      setActiveVehicle,
      setFocusVin,
      processedInventory,
      setMessage,
      navigate,
    ]
  );
}

export default useOpenDealInDesk;
