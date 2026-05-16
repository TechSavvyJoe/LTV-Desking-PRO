/// <reference path="../pb_data/types.d.ts" />

/**
 * Creates the singleton `system_settings` collection used by the Owner Console
 * Settings tab. Public read so login pages can render the announcement banner;
 * writes restricted to users with role = "superadmin".
 */
migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "system_settings",
      listRule: "",
      viewRule: "",
      createRule: '@request.auth.id != "" && @request.auth.role = "superadmin"',
      updateRule: '@request.auth.id != "" && @request.auth.role = "superadmin"',
      deleteRule: '@request.auth.id != "" && @request.auth.role = "superadmin"',
      fields: [
        new EmailField({ name: "supportEmail", required: false }),
        new TextField({ name: "announcementBanner", required: false, max: 500 }),
        new BoolField({ name: "signupsEnabled", required: false }),
        new JSONField({ name: "defaultLtvThresholds", required: false, maxSize: 2000000 }),
      ],
    });

    app.save(collection);

    const record = new Record(collection, {
      supportEmail: "",
      announcementBanner: "",
      signupsEnabled: true,
      defaultLtvThresholds: {},
    });
    app.save(record);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("system_settings");
    app.delete(collection);
  }
);
