/// <reference path="../pb_data/types.d.ts" />

/**
 * Pipeline fields for `saved_deals` (dc redesign, reconciliation 7).
 *
 *  - status: appends "declined" to the select values so the Pipeline screen
 *    can bucket deals as Pending={draft,pending,submitted}, Approved, Funded,
 *    Declined={declined,cancelled}. Existing values are preserved untouched.
 *  - lenderName: optional free-text name of the lender the deal was
 *    submitted to / approved with, shown on the Pipeline rows.
 *
 * Idempotent at the field level (same convention as
 * 1746999001_baseline_users_fields): both changes are guarded, so re-runs and
 * already-migrated databases noop.
 */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("saved_deals");
    } catch (e) {
      console.log("[skip] saved_deals collection not found");
      return;
    }

    let changed = false;

    // status: append "declined" if not already present. Never rewrite the
    // whole field — existing rows keep their stored values.
    const status = collection.fields.getByName("status");
    if (status) {
      const values = [];
      for (let i = 0; i < status.values.length; i++) {
        values.push(String(status.values[i]));
      }
      if (values.indexOf("declined") === -1) {
        values.push("declined");
        status.values = values;
        changed = true;
      } else {
        console.log("[skip] saved_deals.status already includes 'declined'");
      }
    } else {
      console.log("[SKIP-DRIFT-RISK] saved_deals.status field not found");
    }

    if (!collection.fields.getByName("lenderName")) {
      collection.fields.add(new TextField({ name: "lenderName", required: false, max: 120 }));
      changed = true;
    } else {
      console.log("[skip] saved_deals.lenderName already present");
    }

    if (changed) app.save(collection);
  },
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("saved_deals");
    } catch (e) {
      // already gone
      return;
    }

    const status = collection.fields.getByName("status");
    if (status) {
      const values = [];
      for (let i = 0; i < status.values.length; i++) {
        const v = String(status.values[i]);
        if (v !== "declined") values.push(v);
      }
      status.values = values;
    }
    if (collection.fields.getByName("lenderName")) {
      collection.fields.removeByName("lenderName");
    }
    app.save(collection);
  }
);
