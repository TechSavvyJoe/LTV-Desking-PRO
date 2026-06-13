/// <reference path="../pb_data/types.d.ts" />

/**
 * Heal production schema drift: the original 1747400000 create migration is
 * marked applied on the prod DB but the `system_settings` collection does not
 * exist there (every GET returns the generic 400 a nonexistent collection
 * gets), and the later 1747600001 aiDefaults migration skip-guarded itself
 * into a no-op on top of it. [Report G52]
 *
 * This migration is fully idempotent: it (re)creates the collection if
 * missing, adds any missing fields (including aiDefaults), and guarantees the
 * singleton record exists. Safe to run on databases where everything is
 * already correct — it does nothing there.
 */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("system_settings");
    } catch {
      collection = null;
    }

    if (!collection) {
      collection = new Collection({
        type: "base",
        name: "system_settings",
        fields: [
          new EmailField({ name: "supportEmail", required: false }),
          new TextField({ name: "announcementBanner", required: false, max: 500 }),
          new BoolField({ name: "signupsEnabled", required: false }),
          new JSONField({ name: "defaultLtvThresholds", required: false, maxSize: 2000000 }),
          new JSONField({ name: "aiDefaults", required: false, maxSize: 100000 }),
        ],
      });
      app.save(collection);
      console.log("[heal] system_settings collection created");
    } else if (!collection.fields.getByName("aiDefaults")) {
      collection.fields.add(new JSONField({ name: "aiDefaults", required: false, maxSize: 100000 }));
      app.save(collection);
      console.log("[heal] aiDefaults field added to system_settings");
    }

    // ALWAYS (re)assert the access rules, whether the collection was just
    // created or already existed. The original create migration passed
    // listRule/viewRule: "" but PB 0.26's Collection constructor stored them as
    // NULL (superuser-only) — so login pages got 403/400 reading the banner.
    // An empty-string rule = "public"; null = "superusers only". Set both
    // public-read fields by string assignment, which PB persists verbatim. [G52]
    collection.listRule = "";
    collection.viewRule = "";
    collection.createRule = '@request.auth.id != "" && @request.auth.role = "superadmin"';
    collection.updateRule = '@request.auth.id != "" && @request.auth.role = "superadmin"';
    collection.deleteRule = '@request.auth.id != "" && @request.auth.role = "superadmin"';
    app.save(collection);
    console.log("[heal] system_settings access rules asserted (public read)");

    // Guarantee the singleton record the Owner Console expects. (No sort — a
    // freshly-created collection's sort fields aren't resolvable inside this
    // same migration transaction.)
    const existing = app.findRecordsByFilter("system_settings", "id != ''", "", 1, 0);
    if (!existing || existing.length === 0) {
      const record = new Record(collection, {
        supportEmail: "",
        announcementBanner: "",
        signupsEnabled: true,
        defaultLtvThresholds: {},
        aiDefaults: {},
      });
      app.save(record);
      console.log("[heal] system_settings singleton record created");
    }
  },
  (app) => {
    // Down: intentionally a no-op. This is a healer migration; reversing it
    // would re-introduce the drift it exists to fix.
  }
);
