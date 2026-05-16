/// <reference path="../pb_data/types.d.ts" />

/**
 * Baseline migration for the `dealer_settings` collection.
 * Idempotent — see baseline_dealers.js for rationale.
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId("dealer_settings");
      console.log("[skip] dealer_settings collection already exists");
      return;
    } catch (e) {
      // proceed
    }

    let dealersId;
    try {
      dealersId = app.findCollectionByNameOrId("dealers").id;
    } catch (e) {
      console.log("[skip] dealers collection not found — cannot create dealer_settings.dealer relation");
      return;
    }

    const collection = new Collection({
      type: "base",
      name: "dealer_settings",
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
        new NumberField({ name: "defaultTerm", required: false, min: 0, onlyInt: true }),
        new NumberField({ name: "defaultApr", required: false, min: 0 }),
        new TextField({ name: "defaultState", required: false, max: 50 }),
        new NumberField({ name: "docFee", required: false, min: 0 }),
        new NumberField({ name: "cvrFee", required: false, min: 0 }),
        new NumberField({ name: "defaultStateFees", required: false, min: 0 }),
        new NumberField({ name: "outOfStateTransitFee", required: false, min: 0 }),
        new NumberField({ name: "customTaxRate", required: false, min: 0 }),
        new JSONField({ name: "ltvThresholds", required: false, maxSize: 1000000 }),
      ],
    });

    app.save(collection);
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("dealer_settings");
      app.delete(c);
    } catch (e) {
      // already gone
    }
  }
);
