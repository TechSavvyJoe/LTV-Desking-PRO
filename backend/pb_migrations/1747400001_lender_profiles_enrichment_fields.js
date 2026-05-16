/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds the four fields used by the AI rate-sheet enrichment pipeline.
 * Without these, enrichment data gets silently dropped by PocketBase.
 */
migrate(
  (app) => {
    // Skip when the collection doesn't exist yet (fresh DB / CI validation).
    // Production already has lender_profiles created manually before this migration was added.
    let collection;
    try {
      collection = app.findCollectionByNameOrId("lender_profiles");
    } catch (e) {
      console.log("[skip] lender_profiles collection not found");
      return;
    }

    collection.fields.add(new URLField({ name: "website", required: false }));
    collection.fields.add(new URLField({ name: "portalUrl", required: false }));
    collection.fields.add(new TextField({ name: "generalNotes", required: false, max: 4000 }));
    collection.fields.add(
      new JSONField({ name: "enrichmentSources", required: false, maxSize: 100000 })
    );

    app.save(collection);
  },
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("lender_profiles");
    } catch (e) {
      return;
    }

    for (const fieldName of ["website", "portalUrl", "generalNotes", "enrichmentSources"]) {
      const field = collection.fields.getByName(fieldName);
      if (field) {
        collection.fields.removeByName(fieldName);
      }
    }

    app.save(collection);
  }
);
