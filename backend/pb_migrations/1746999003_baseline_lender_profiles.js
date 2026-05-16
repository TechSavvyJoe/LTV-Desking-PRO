/// <reference path="../pb_data/types.d.ts" />

/**
 * Baseline migration for the `lender_profiles` collection (pre-enrichment).
 *
 * Does NOT include website, portalUrl, generalNotes, enrichmentSources —
 * those are added by 1747400001_lender_profiles_enrichment_fields.js, which
 * runs after this baseline on a fresh CI environment.
 *
 * Idempotent — see baseline_dealers.js for rationale.
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId("lender_profiles");
      console.log("[skip] lender_profiles collection already exists");
      return;
    } catch (e) {
      // proceed
    }

    let dealersId;
    try {
      dealersId = app.findCollectionByNameOrId("dealers").id;
    } catch (e) {
      console.log("[skip] dealers collection not found — cannot create lender_profiles.dealer relation");
      return;
    }

    const collection = new Collection({
      type: "base",
      name: "lender_profiles",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        new RelationField({
          name: "dealer",
          required: true,
          collectionId: dealersId,
          maxSelect: 1,
          cascadeDelete: true,
        }),
        new TextField({ name: "name", required: true, max: 200 }),
        new BoolField({ name: "active", required: false }),
        new JSONField({ name: "tiers", required: true, maxSize: 5000000 }),
        new SelectField({
          name: "bookValueSource",
          required: false,
          values: ["Trade", "Retail"],
          maxSelect: 1,
        }),
        new NumberField({ name: "minIncome", required: false, min: 0 }),
        new NumberField({ name: "maxPti", required: false, min: 0 }),
        new TextField({ name: "notes", required: false, max: 5000 }),
        new TextField({ name: "contactName", required: false, max: 200 }),
        new TextField({ name: "contactPhone", required: false, max: 30 }),
        new EmailField({ name: "contactEmail", required: false }),
      ],
    });

    app.save(collection);
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("lender_profiles");
      app.delete(c);
    } catch (e) {
      // already gone
    }
  }
);
