/// <reference path="../pb_data/types.d.ts" />

/**
 * Add autodate `created`/`updated` fields to the four JS-created collections
 * that were built without them (system_settings, ai_provider_keys, audit_log,
 * deal_events).
 *
 * PocketBase ≥ 0.23 only adds timestamps when the migration defines them, and
 * these migrations didn't — so every frontend read that sorts by `created`
 * (getSystemSettings, listAuditLog, getAiProviderKeys) has been 400-ing in
 * production, masked by cache/default fallbacks. It also means audit_log and
 * deal_events rows — evidentiary records — carry no timestamp at all.
 *
 * Rows that existed before this migration get empty `created` values (PB does
 * not backfill); readers must tolerate that. New rows are stamped from here on.
 *
 * Idempotent at the field level, same convention as 1747810001.
 */
migrate(
  (app) => {
    const collections = ["system_settings", "ai_provider_keys", "audit_log", "deal_events"];

    for (const name of collections) {
      let collection;
      try {
        collection = app.findCollectionByNameOrId(name);
      } catch (e) {
        console.log("[skip] " + name + " collection not found");
        continue;
      }

      let changed = false;

      if (!collection.fields.getByName("created")) {
        collection.fields.add(new AutodateField({ name: "created", onCreate: true }));
        changed = true;
      } else {
        console.log("[skip] " + name + ".created already present");
      }

      if (!collection.fields.getByName("updated")) {
        collection.fields.add(
          new AutodateField({ name: "updated", onCreate: true, onUpdate: true })
        );
        changed = true;
      } else {
        console.log("[skip] " + name + ".updated already present");
      }

      if (changed) app.save(collection);
    }
  },
  (app) => {
    const collections = ["system_settings", "ai_provider_keys", "audit_log", "deal_events"];

    for (const name of collections) {
      let collection;
      try {
        collection = app.findCollectionByNameOrId(name);
      } catch (e) {
        continue; // already gone
      }

      let changed = false;
      for (const fieldName of ["created", "updated"]) {
        if (collection.fields.getByName(fieldName)) {
          collection.fields.removeByName(fieldName);
          changed = true;
        }
      }
      if (changed) app.save(collection);
    }
  }
);
