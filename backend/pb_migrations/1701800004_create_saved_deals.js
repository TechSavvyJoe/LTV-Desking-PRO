/// <reference path="../pb_data/types.d.ts" />

// Migration: Create saved_deals collection for storing structured deals
migrate(
  (db) => {
    const collection = new Collection({
      id: "saved_deals",
      name: "saved_deals",
      type: "base",
      system: false,
      schema: [
        {
          name: "dealer",
          type: "relation",
          required: true,
          options: {
            collectionId: "dealers",
            cascadeDelete: true,
            maxSelect: 1,
          },
        },
        {
          name: "user",
          type: "relation",
          required: true,
          options: {
            collectionId: "users",
            cascadeDelete: false,
            maxSelect: 1,
          },
        },
        {
          name: "vehicle",
          type: "relation",
          required: false,
          options: {
            collectionId: "inventory",
            cascadeDelete: false,
            maxSelect: 1,
          },
        },
        {
          name: "name",
          type: "text",
          required: true,
          options: { min: 1, max: 200 },
        },
        {
          name: "customerName",
          type: "text",
          required: false,
          options: { max: 100 },
        },
        {
          name: "salespersonName",
          type: "text",
          required: false,
          options: { max: 100 },
        },
        {
          name: "vehicleData",
          type: "json",
          required: true,
          options: {},
        },
        {
          name: "dealData",
          type: "json",
          required: true,
          options: {},
        },
        {
          name: "calculatedData",
          type: "json",
          required: false,
          options: {},
        },
        {
          name: "status",
          type: "select",
          required: true,
          options: {
            maxSelect: 1,
            values: [
              "draft",
              "pending",
              "submitted",
              "approved",
              "funded",
              "cancelled",
            ],
          },
        },
        {
          name: "notes",
          type: "text",
          required: false,
          options: { max: 2000 },
        },
      ],
      indexes: [
        "CREATE INDEX idx_saved_deals_dealer ON saved_deals (dealer)",
        "CREATE INDEX idx_saved_deals_user ON saved_deals (user)",
        "CREATE INDEX idx_saved_deals_status ON saved_deals (status)",
        "CREATE INDEX idx_saved_deals_created ON saved_deals (created)",
      ],
      listRule: "@request.auth.dealer = dealer",
      viewRule: "@request.auth.dealer = dealer",
      createRule: "@request.auth.dealer = dealer",
      updateRule:
        "@request.auth.dealer = dealer && (user = @request.auth.id || @request.auth.role = 'manager' || @request.auth.role = 'admin')",
      deleteRule:
        "@request.auth.dealer = dealer && (@request.auth.role = 'manager' || @request.auth.role = 'admin')",
    });

    return Dao(db).saveCollection(collection);
  },
  (db) => {
    const dao = new Dao(db);
    const collection = dao.findCollectionByNameOrId("saved_deals");
    return dao.deleteCollection(collection);
  }
);
