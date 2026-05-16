/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds `aiDefaults` (non-sensitive) to system_settings so the Owner Console
 * can configure the default provider and per-task model for every dealership.
 *
 * Provider keys themselves live in `ai_provider_keys` (RBAC-locked); this
 * field just stores which model to use, which is fine to be publicly readable
 * alongside the banner.
 */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("system_settings");
    } catch {
      console.log("[skip] system_settings not found — earlier migration didn't run");
      return;
    }

    if (
      collection.fields &&
      collection.fields.getByName &&
      collection.fields.getByName("aiDefaults")
    ) {
      console.log("[skip] aiDefaults already on system_settings");
      return;
    }

    collection.fields.add(
      new JSONField({ name: "aiDefaults", required: false, maxSize: 100000 })
    );
    app.save(collection);
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("system_settings");
      const field = c.fields.getByName("aiDefaults");
      if (field) {
        c.fields.removeByName("aiDefaults");
        app.save(c);
      }
    } catch {
      // collection gone, nothing to do
    }
  }
);
