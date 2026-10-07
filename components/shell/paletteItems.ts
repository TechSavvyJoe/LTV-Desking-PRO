import type { Vehicle } from "../../types";
import type { PaletteItem } from "./CommandPalette";

/** Actions the command palette needs to wire up a vehicle's onSelect handler. */
export interface VehiclePaletteActions {
  setSearchQuery: (query: string) => void;
  setFocusVin: (vin: string | null) => void;
  navigate: (path: string) => void;
}

/**
 * Builds the command-palette item for a single inventory unit.
 *
 * Imports without a stock column default to the literal string "N/A" (see
 * DealContext.mapInventoryItem / fileParser); treat that as missing so we
 * fall back to the VIN instead of searching for "N/A".
 */
export const vehiclePaletteItem = (
  v: Vehicle,
  i: number,
  actions: VehiclePaletteActions
): PaletteItem => {
  const stock = v.stock && v.stock !== "N/A" ? v.stock : "";
  return {
    id: `veh-${i}-${v.vin || v.stock}`,
    label: v.vehicle,
    detail: [stock && `STK ${stock}`, v.vin && `VIN ${v.vin}`].filter(Boolean).join(" · "),
    group: "Inventory",
    keywords: [v.vin, stock, v.make ?? "", v.model ?? ""],
    onSelect: () => {
      // Narrow the desk to this unit and focus it. The term lands in the
      // desk's own search box so the user can see and clear it.
      actions.setSearchQuery(stock || v.vin);
      actions.setFocusVin(v.vin || null);
      actions.navigate("/desk");
    },
  };
};
