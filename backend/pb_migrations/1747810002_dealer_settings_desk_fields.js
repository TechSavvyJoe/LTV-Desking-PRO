/// <reference path="../pb_data/types.d.ts" />

/**
 * Desk F&I fields for `dealer_settings` (dc redesign, reconciliations 4/6/14).
 *
 * dealer_settings stores discrete columns (not a JSON blob — see
 * 1746999005_baseline_dealer_settings), so persisting the new Settings-modal
 * values needs real fields:
 *
 *  - vscPrice: default VSC (service contract) price for the desk add-on
 *    toggle (client seeds 2495 when unset).
 *  - gapPrice: default GAP price for the desk add-on toggle (client seeds 895
 *    when unset).
 *  - miTradeInCreditCap: Michigan trade-in sales-tax-credit cap used by the
 *    calculator (client seeds the statutory default when unset).
 *
 * No server-side value seeding: absent values fall back to INITIAL_SETTINGS
 * on the client, matching how every other dealer_settings field behaves.
 *
 * Idempotent at the field level (same convention as
 * 1746999001_baseline_users_fields): each add is guarded, so re-runs and
 * already-migrated databases noop.
 */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("dealer_settings");
    } catch (e) {
      console.log("[skip] dealer_settings collection not found");
      return;
    }

    let changed = false;

    for (const name of ["vscPrice", "gapPrice", "miTradeInCreditCap"]) {
      if (!collection.fields.getByName(name)) {
        collection.fields.add(new NumberField({ name: name, required: false, min: 0 }));
        changed = true;
      } else {
        console.log(`[skip] dealer_settings.${name} already present`);
      }
    }

    if (changed) app.save(collection);
  },
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("dealer_settings");
    } catch (e) {
      // already gone
      return;
    }

    for (const fieldName of ["vscPrice", "gapPrice", "miTradeInCreditCap"]) {
      if (collection.fields.getByName(fieldName)) {
        collection.fields.removeByName(fieldName);
      }
    }
    app.save(collection);
  }
);
