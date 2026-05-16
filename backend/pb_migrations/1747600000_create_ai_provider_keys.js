/// <reference path="../pb_data/types.d.ts" />

/**
 * Singleton collection storing AI provider API keys.
 *
 * Stored in its own collection (not `system_settings`) because system_settings
 * has `listRule: ""` for public read of the announcement banner — exposing the
 * whole record. Keys live in a separately-RBAC'd collection where only the
 * owner (role="superadmin") can read or write.
 *
 * Plaintext storage at rest. The hosting VM is the only thing that needs to
 * read these — the Fly volume is encrypted at rest by Fly's storage layer, and
 * SQLite is only accessible inside the container. If we ever introduce shared
 * tenant infra we should add per-row AES-GCM with a master key from Fly secret.
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId("ai_provider_keys");
      console.log("[skip] ai_provider_keys already exists");
      return;
    } catch {
      // proceed
    }

    const SUPER = '@request.auth.id != "" && @request.auth.role = "superadmin"';

    const collection = new Collection({
      type: "base",
      name: "ai_provider_keys",
      listRule: SUPER,
      viewRule: SUPER,
      createRule: SUPER,
      updateRule: SUPER,
      deleteRule: SUPER,
      fields: [
        new TextField({ name: "openaiApiKey", required: false, max: 500 }),
        new TextField({ name: "anthropicApiKey", required: false, max: 500 }),
        new TextField({ name: "geminiApiKey", required: false, max: 500 }),
        new JSONField({ name: "lastTested", required: false, maxSize: 50000 }),
      ],
    });

    app.save(collection);

    const record = new Record(collection, {
      openaiApiKey: "",
      anthropicApiKey: "",
      geminiApiKey: "",
      lastTested: {},
    });
    app.save(record);
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("ai_provider_keys");
      app.delete(c);
    } catch {
      // already gone
    }
  }
);
