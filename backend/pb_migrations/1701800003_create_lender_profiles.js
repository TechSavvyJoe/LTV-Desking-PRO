/// <reference path="../pb_data/types.d.ts" />

// Migration: Create lender_profiles collection
migrate(
  (db) => {
    const collection = new Collection({
      id: "lender_profiles",
      name: "lender_profiles",
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
          name: "name",
          type: "text",
          required: true,
          options: { min: 1, max: 100 },
        },
        {
          name: "active",
          type: "bool",
          required: false,
          options: {},
        },
        {
          name: "tiers",
          type: "json",
          required: true,
          options: {},
        },
        {
          name: "notes",
          type: "text",
          required: false,
          options: { max: 1000 },
        },
        {
          name: "contactName",
          type: "text",
          required: false,
          options: { max: 100 },
        },
        {
          name: "contactPhone",
          type: "text",
          required: false,
          options: { max: 20 },
        },
        {
          name: "contactEmail",
          type: "email",
          required: false,
        },
      ],
      indexes: [
        "CREATE INDEX idx_lender_profiles_dealer ON lender_profiles (dealer)",
        "CREATE INDEX idx_lender_profiles_active ON lender_profiles (active)",
      ],
      listRule: "@request.auth.dealer = dealer",
      viewRule: "@request.auth.dealer = dealer",
      createRule:
        "@request.auth.dealer = dealer && (@request.auth.role = 'admin' || @request.auth.role = 'manager')",
      updateRule:
        "@request.auth.dealer = dealer && (@request.auth.role = 'admin' || @request.auth.role = 'manager')",
      deleteRule:
        "@request.auth.dealer = dealer && @request.auth.role = 'admin'",
    });

    return Dao(db).saveCollection(collection);
  },
  (db) => {
    const dao = new Dao(db);
    const collection = dao.findCollectionByNameOrId("lender_profiles");
    return dao.deleteCollection(collection);
  }
);
