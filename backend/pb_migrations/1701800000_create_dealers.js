/// <reference path="../pb_data/types.d.ts" />

// Migration: Create dealers collection for multi-tenant support
migrate(
  (db) => {
    const collection = new Collection({
      id: "dealers",
      name: "dealers",
      type: "base",
      system: false,
      schema: [
        {
          name: "name",
          type: "text",
          required: true,
          options: { min: 2, max: 100 },
        },
        {
          name: "code",
          type: "text",
          required: true,
          options: { min: 2, max: 20, pattern: "^[A-Z0-9_]+$" },
        },
        {
          name: "address",
          type: "text",
          required: false,
          options: { max: 500 },
        },
        {
          name: "city",
          type: "text",
          required: false,
          options: { max: 100 },
        },
        {
          name: "state",
          type: "text",
          required: false,
          options: { max: 2, pattern: "^[A-Z]{2}$" },
        },
        {
          name: "phone",
          type: "text",
          required: false,
          options: { max: 20 },
        },
        {
          name: "email",
          type: "email",
          required: false,
        },
        {
          name: "logo",
          type: "file",
          required: false,
          options: {
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ["image/png", "image/jpeg", "image/webp"],
          },
        },
        {
          name: "active",
          type: "bool",
          required: false,
          options: {},
        },
        {
          name: "settings",
          type: "json",
          required: false,
          options: {},
        },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_dealer_code ON dealers (code)"],
      createRule: "@request.auth.role = 'superadmin'",
      listRule: "@request.auth.id != ''",
      viewRule:
        "@request.auth.dealer = id || @request.auth.role = 'superadmin'",
      updateRule: "@request.auth.role = 'admin' && @request.auth.dealer = id",
      deleteRule: "@request.auth.role = 'superadmin'",
    });

    return Dao(db).saveCollection(collection);
  },
  (db) => {
    const dao = new Dao(db);
    const collection = dao.findCollectionByNameOrId("dealers");
    return dao.deleteCollection(collection);
  }
);
