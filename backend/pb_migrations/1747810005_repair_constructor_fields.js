/// <reference path="../pb_data/types.d.ts" />

/**
 * Repair the four collections created via `new Collection({ fields: [...] })`.
 *
 * Verified in production (2026-07-05): that constructor pattern silently
 * DROPS typed Field instances in this PB version — system_settings,
 * ai_provider_keys, audit_log and deal_events all exist with NO custom
 * columns (a live system_settings record carries only id/created/updated +
 * aiDefaults, which a later fields.add migration added). Consequences until
 * now: announcement banner / signupsEnabled writes silently dropped, AI
 * provider keys never persisted, audit_log rows stored no action/target
 * detail, and deal_events rules could not even be applied because their
 * expressions reference the missing `dealer` relation.
 *
 * This migration re-adds every missing field with the PROVEN pattern
 * (collection.fields.add + app.save — same as 1747810001, which works).
 * Field-level idempotent, so it no-ops anywhere the fields exist. Once the
 * `dealer` relation exists, the deal_events bootstrap hook
 * (pb_hooks/deal_events_rules.pb.js) applies the access rules on the same
 * boot.
 */
migrate(
  (app) => {
    const ensure = (collectionName, makeFields) => {
      let collection;
      try {
        collection = app.findCollectionByNameOrId(collectionName);
      } catch (e) {
        console.log("[skip] " + collectionName + " collection not found");
        return;
      }
      let changed = false;
      const fields = makeFields();
      for (const f of fields) {
        if (!collection.fields.getByName(f.name)) {
          collection.fields.add(f.field);
          changed = true;
          console.log("[repair] " + collectionName + "." + f.name + " added");
        }
      }
      if (changed) app.save(collection);
      else console.log("[skip] " + collectionName + " fields already present");
    };

    ensure("system_settings", () => [
      { name: "supportEmail", field: new EmailField({ name: "supportEmail", required: false }) },
      {
        name: "announcementBanner",
        field: new TextField({ name: "announcementBanner", required: false, max: 500 }),
      },
      {
        name: "signupsEnabled",
        field: new BoolField({ name: "signupsEnabled", required: false }),
      },
      {
        name: "defaultLtvThresholds",
        field: new JSONField({ name: "defaultLtvThresholds", required: false, maxSize: 2000000 }),
      },
    ]);

    ensure("ai_provider_keys", () => [
      {
        name: "openaiApiKey",
        field: new TextField({ name: "openaiApiKey", required: false, max: 500 }),
      },
      {
        name: "anthropicApiKey",
        field: new TextField({ name: "anthropicApiKey", required: false, max: 500 }),
      },
      {
        name: "geminiApiKey",
        field: new TextField({ name: "geminiApiKey", required: false, max: 500 }),
      },
      {
        name: "lastTested",
        field: new JSONField({ name: "lastTested", required: false, maxSize: 50000 }),
      },
    ]);

    let usersId = null;
    let dealersId = null;
    try {
      usersId = app.findCollectionByNameOrId("users").id;
      dealersId = app.findCollectionByNameOrId("dealers").id;
    } catch (e) {
      console.log("[skip] users/dealers missing — relation repairs skipped (fresh DB)");
    }

    if (usersId) {
      ensure("audit_log", () => [
        {
          name: "actor",
          field: new RelationField({
            name: "actor",
            required: false, // rows written while the column was missing have no actor
            collectionId: usersId,
            maxSelect: 1,
            cascadeDelete: false,
          }),
        },
        { name: "action", field: new TextField({ name: "action", required: false, max: 100 }) },
        { name: "target", field: new TextField({ name: "target", required: false, max: 200 }) },
        { name: "details", field: new JSONField({ name: "details", required: false, maxSize: 10000 }) },
      ]);
    }

    if (usersId && dealersId) {
      ensure("deal_events", () => [
        {
          name: "dealer",
          field: new RelationField({
            name: "dealer",
            required: false, // required enforced by dealer_guard hook; rows predating repair may lack it
            collectionId: dealersId,
            maxSelect: 1,
            cascadeDelete: false,
          }),
        },
        {
          name: "user",
          field: new RelationField({
            name: "user",
            required: false,
            collectionId: usersId,
            maxSelect: 1,
            cascadeDelete: false,
          }),
        },
        { name: "action", field: new TextField({ name: "action", required: false, max: 60 }) },
        {
          name: "customerName",
          field: new TextField({ name: "customerName", required: false, max: 200 }),
        },
        { name: "vin", field: new TextField({ name: "vin", required: false, max: 32 }) },
        {
          name: "snapshot",
          field: new JSONField({ name: "snapshot", required: false, maxSize: 400000 }),
        },
      ]);
    }
  },
  (app) => {
    // Down: no-op. Removing repaired columns would re-break production.
  }
);
