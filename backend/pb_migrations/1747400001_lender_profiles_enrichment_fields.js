/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds the four fields used by the AI rate-sheet enrichment pipeline.
 * Without these, enrichment data gets silently dropped by PocketBase.
 */
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("lender_profiles");

    collection.fields.add(new URLField({ name: "website", required: false }));
    collection.fields.add(new URLField({ name: "portalUrl", required: false }));
    collection.fields.add(new TextField({ name: "generalNotes", required: false, max: 4000 }));
    collection.fields.add(
      new JSONField({ name: "enrichmentSources", required: false, maxSize: 100000 })
    );

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("lender_profiles");

    for (const fieldName of ["website", "portalUrl", "generalNotes", "enrichmentSources"]) {
      const field = collection.fields.getByName(fieldName);
      if (field) {
        collection.fields.removeByName(fieldName);
      }
    }

    app.save(collection);
  }
);
