/// <reference path="../pb_data/types.d.ts" />

/**
 * Baseline migration for the `dealers` collection.
 *
 * Idempotent: noops on production (where dealers was created manually before
 * any migrations existed) and creates it from scratch in fresh CI / dev
 * environments.
 *
 * Rules are set to admin-only here; the `1747400002_tighten_api_rules`
 * migration replaces them with the real RBAC rules after all baselines have
 * run.
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId("dealers");
      console.log("[skip] dealers collection already exists");
      return;
    } catch (e) {
      // does not exist — proceed to create
    }

    const collection = new Collection({
      type: "base",
      name: "dealers",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        new TextField({ name: "name", required: true, max: 200 }),
        new TextField({ name: "code", required: true, max: 20 }),
        new TextField({ name: "address", required: false, max: 200 }),
        new TextField({ name: "city", required: false, max: 100 }),
        new TextField({ name: "state", required: false, max: 100 }),
        new TextField({ name: "phone", required: false, max: 30 }),
        new EmailField({ name: "email", required: false }),
        new FileField({ name: "logo", required: false, maxSelect: 1, maxSize: 5242880 }),
        new BoolField({ name: "active", required: false }),
        new JSONField({ name: "settings", required: false, maxSize: 1000000 }),
      ],
    });

    app.save(collection);
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("dealers");
      app.delete(c);
    } catch (e) {
      // already gone
    }
  }
);
