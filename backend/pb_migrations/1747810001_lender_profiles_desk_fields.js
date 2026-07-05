/// <reference path="../pb_data/types.d.ts" />

/**
 * Desk/Lenders-screen display fields for `lender_profiles` (dc redesign).
 *
 *  - reservePct: optional dealer reserve percentage shown on the lender
 *    matrix row / expansion block.
 *  - fundingDays: optional short free-text funding turnaround (e.g. "1-2",
 *    "same day") — text, not number, because lenders quote ranges.
 *
 * Idempotent at the field level (same convention as
 * 1746999001_baseline_users_fields): both adds are guarded, so re-runs and
 * already-migrated databases noop.
 */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("lender_profiles");
    } catch (e) {
      console.log("[skip] lender_profiles collection not found");
      return;
    }

    let changed = false;

    if (!collection.fields.getByName("reservePct")) {
      collection.fields.add(new NumberField({ name: "reservePct", required: false, min: 0 }));
      changed = true;
    } else {
      console.log("[skip] lender_profiles.reservePct already present");
    }

    if (!collection.fields.getByName("fundingDays")) {
      collection.fields.add(new TextField({ name: "fundingDays", required: false, max: 40 }));
      changed = true;
    } else {
      console.log("[skip] lender_profiles.fundingDays already present");
    }

    if (changed) app.save(collection);
  },
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("lender_profiles");
    } catch (e) {
      // already gone
      return;
    }

    for (const fieldName of ["reservePct", "fundingDays"]) {
      if (collection.fields.getByName(fieldName)) {
        collection.fields.removeByName(fieldName);
      }
    }
    app.save(collection);
  }
);
