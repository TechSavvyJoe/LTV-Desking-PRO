/// <reference path="../pb_data/types.d.ts" />

// Migration: Create dealer_settings collection
migrate(
  (db) => {
    const collection = new Collection({
      id: "dealer_settings",
      name: "dealer_settings",
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
          name: "docFee",
          type: "number",
          required: false,
          options: { min: 0, max: 10000 },
        },
        {
          name: "cvrFee",
          type: "number",
          required: false,
          options: { min: 0, max: 1000 },
        },
        {
          name: "defaultState",
          type: "text",
          required: false,
          options: { min: 2, max: 2, pattern: "^[A-Z]{2}$" },
        },
        {
          name: "outOfStateTransitFee",
          type: "number",
          required: false,
          options: { min: 0, max: 5000 },
        },
        {
          name: "customTaxRate",
          type: "number",
          required: false,
          options: { min: 0, max: 20 },
        },
        {
          name: "defaultDownPayment",
          type: "number",
          required: false,
          options: { min: 0 },
        },
        {
          name: "defaultLoanTerm",
          type: "number",
          required: false,
          options: { min: 12, max: 96 },
        },
        {
          name: "defaultInterestRate",
          type: "number",
          required: false,
          options: { min: 0, max: 30 },
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_dealer_settings_dealer ON dealer_settings (dealer)",
      ],
      listRule: "@request.auth.dealer = dealer",
      viewRule: "@request.auth.dealer = dealer",
      createRule:
        "@request.auth.dealer = dealer && @request.auth.role = 'admin'",
      updateRule:
        "@request.auth.dealer = dealer && (@request.auth.role = 'admin' || @request.auth.role = 'manager')",
      deleteRule:
        "@request.auth.dealer = dealer && @request.auth.role = 'admin'",
    });

    return Dao(db).saveCollection(collection);
  },
  (db) => {
    const dao = new Dao(db);
    const collection = dao.findCollectionByNameOrId("dealer_settings");
    return dao.deleteCollection(collection);
  }
);
