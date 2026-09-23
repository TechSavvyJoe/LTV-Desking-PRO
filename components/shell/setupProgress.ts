import type { LenderProfile, SavedDeal, Vehicle } from "../../types";

/** Exact shape the empty-dealer seed migration stamps on illustrative units
 * (e.g. SAMPLE01AAAA1000) — a real 17-character VIN can never match it. */
const SAMPLE_VIN = /^SAMPLE\d{2}[A-Z]{4}\d{4}$/i;

/** True for a unit the seed migration created, never for a dealer's own stock. */
export const isSampleVehicle = (v: Pick<Vehicle, "vin">): boolean => SAMPLE_VIN.test(v.vin ?? "");

/** True for a lender program the seed migration created (`isSample`). */
export const isSampleLender = (p: Pick<LenderProfile, "isSample">): boolean => p.isSample === true;

export interface SetupProgress {
  inventoryCount: number;
  lenderCount: number;
  savedDealCount: number;
}

/**
 * Counts that drive the first-run checklist. A new dealership is seeded with
 * sample vehicles and sample lender programs (backend/pb_migrations/
 * 1747810007_seed_empty_dealer_samples.js) so the desk isn't empty on day
 * one — those must not count as "imported your inventory" or "loaded your
 * lender programs", or the checklist would vanish before the dealer has done
 * either. Saved deals count as-is: desking a sample unit still teaches the
 * flow. [codex review]
 */
export function setupProgress(
  inventory: readonly Pick<Vehicle, "vin">[],
  lenderProfiles: readonly Pick<LenderProfile, "isSample">[],
  savedDeals: readonly Pick<SavedDeal, "id">[]
): SetupProgress {
  return {
    inventoryCount: inventory.filter((v) => !isSampleVehicle(v)).length,
    lenderCount: lenderProfiles.filter((p) => !isSampleLender(p)).length,
    savedDealCount: savedDeals.length,
  };
}
