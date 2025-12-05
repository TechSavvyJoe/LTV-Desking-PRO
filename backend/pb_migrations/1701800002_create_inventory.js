/// <reference path="../pb_data/types.d.ts" />

// Migration: Create inventory collection for vehicle data
migrate(
  (db) => {
    const collection = new Collection({
      id: "inventory",
      name: "inventory",
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
          name: "vin",
          type: "text",
          required: true,
          options: { min: 17, max: 17, pattern: "^[A-HJ-NPR-Z0-9]{17}$" },
        },
        {
          name: "stockNumber",
          type: "text",
          required: false,
          options: { max: 20 },
        },
        {
          name: "year",
          type: "number",
          required: true,
          options: { min: 1900, max: 2100 },
        },
        {
          name: "make",
          type: "text",
          required: true,
          options: { max: 50 },
        },
        {
          name: "model",
          type: "text",
          required: true,
          options: { max: 100 },
        },
        {
          name: "trim",
          type: "text",
          required: false,
          options: { max: 100 },
        },
        {
          name: "mileage",
          type: "number",
          required: false,
          options: { min: 0 },
        },
        {
          name: "price",
          type: "number",
          required: true,
          options: { min: 0 },
        },
        {
          name: "unitCost",
          type: "number",
          required: false,
          options: { min: 0 },
        },
        {
          name: "jdPower",
          type: "number",
          required: false,
          options: { min: 0 },
        },
        {
          name: "jdPowerRetail",
          type: "number",
          required: false,
          options: { min: 0 },
        },
        {
          name: "status",
          type: "select",
          required: true,
          options: {
            maxSelect: 1,
            values: ["available", "pending", "sold", "hold"],
          },
        },
        {
          name: "images",
          type: "file",
          required: false,
          options: {
            maxSelect: 10,
            maxSize: 10485760,
            mimeTypes: ["image/jpeg", "image/png", "image/webp"],
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
        "CREATE UNIQUE INDEX idx_inventory_vin_dealer ON inventory (vin, dealer)",
        "CREATE INDEX idx_inventory_status ON inventory (status)",
        "CREATE INDEX idx_inventory_dealer ON inventory (dealer)",
      ],
      listRule: "@request.auth.dealer = dealer",
      viewRule: "@request.auth.dealer = dealer",
      createRule:
        "@request.auth.dealer = dealer && (@request.auth.role = 'admin' || @request.auth.role = 'manager')",
      updateRule: "@request.auth.dealer = dealer",
      deleteRule:
        "@request.auth.dealer = dealer && (@request.auth.role = 'admin' || @request.auth.role = 'manager')",
    });

    return Dao(db).saveCollection(collection);
  },
  (db) => {
    const dao = new Dao(db);
    const collection = dao.findCollectionByNameOrId("inventory");
    return dao.deleteCollection(collection);
  }
);
