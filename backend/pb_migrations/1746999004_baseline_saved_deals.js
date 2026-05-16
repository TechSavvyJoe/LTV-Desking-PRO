/// <reference path="../pb_data/types.d.ts" />

/**
 * Baseline migration for the `saved_deals` collection.
 * Depends on dealers, users, and inventory existing first.
 * Idempotent — see baseline_dealers.js for rationale.
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId("saved_deals");
      console.log("[skip] saved_deals collection already exists");
      return;
    } catch (e) {
      // proceed
    }

    let dealersId, usersId, inventoryId;
    try {
      dealersId = app.findCollectionByNameOrId("dealers").id;
      usersId = app.findCollectionByNameOrId("users").id;
      inventoryId = app.findCollectionByNameOrId("inventory").id;
    } catch (e) {
      console.log("[skip] missing prerequisite collection (dealers/users/inventory)");
      return;
    }

    const collection = new Collection({
      type: "base",
      name: "saved_deals",
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
        new RelationField({
          name: "user",
          required: true,
          collectionId: usersId,
          maxSelect: 1,
          cascadeDelete: false,
        }),
        new RelationField({
          name: "vehicle",
          required: false,
          collectionId: inventoryId,
          maxSelect: 1,
          cascadeDelete: false,
        }),
        new TextField({ name: "name", required: true, max: 200 }),
        new TextField({ name: "customerName", required: false, max: 200 }),
        new TextField({ name: "salespersonName", required: false, max: 200 }),
        new JSONField({ name: "vehicleData", required: true, maxSize: 2000000 }),
        new JSONField({ name: "dealData", required: true, maxSize: 2000000 }),
        new JSONField({ name: "customerFilters", required: false, maxSize: 1000000 }),
        new JSONField({ name: "calculatedData", required: false, maxSize: 2000000 }),
        new SelectField({
          name: "status",
          required: false,
          values: ["draft", "pending", "submitted", "approved", "funded", "cancelled"],
          maxSelect: 1,
        }),
        new TextField({ name: "notes", required: false, max: 10000 }),
      ],
    });

    app.save(collection);
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("saved_deals");
      app.delete(c);
    } catch (e) {
      // already gone
    }
  }
);
