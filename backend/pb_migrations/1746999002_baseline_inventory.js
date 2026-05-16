/// <reference path="../pb_data/types.d.ts" />

/**
 * Baseline migration for the `inventory` collection.
 * Idempotent — see baseline_dealers.js for rationale.
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId("inventory");
      console.log("[skip] inventory collection already exists");
      return;
    } catch (e) {
      // proceed
    }

    let dealersId;
    try {
      dealersId = app.findCollectionByNameOrId("dealers").id;
    } catch (e) {
      console.log("[skip] dealers collection not found — cannot create inventory.dealer relation");
      return;
    }

    const collection = new Collection({
      type: "base",
      name: "inventory",
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
        new TextField({ name: "vin", required: true, max: 25 }),
        new TextField({ name: "stockNumber", required: false, max: 50 }),
        new NumberField({ name: "year", required: true, min: 1900, max: 2100, onlyInt: true }),
        new TextField({ name: "make", required: true, max: 100 }),
        new TextField({ name: "model", required: true, max: 100 }),
        new TextField({ name: "trim", required: false, max: 100 }),
        new NumberField({ name: "mileage", required: false, min: 0, onlyInt: true }),
        new NumberField({ name: "price", required: true, min: 0 }),
        new NumberField({ name: "unitCost", required: false, min: 0 }),
        new NumberField({ name: "jdPower", required: false, min: 0 }),
        new NumberField({ name: "jdPowerRetail", required: false, min: 0 }),
        new SelectField({
          name: "status",
          required: false,
          values: ["available", "pending", "sold", "hold"],
          maxSelect: 1,
        }),
        new FileField({ name: "images", required: false, maxSelect: 10, maxSize: 5242880 }),
        new TextField({ name: "notes", required: false, max: 5000 }),
      ],
    });

    app.save(collection);
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("inventory");
      app.delete(c);
    } catch (e) {
      // already gone
    }
  }
);
