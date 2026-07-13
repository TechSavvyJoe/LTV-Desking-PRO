/// <reference path="../pb_data/types.d.ts" />

/**
 * Durable, server-owned AI rate-limit buckets.
 *
 * No record API access is exposed. The /api/ltv/ai-rate-limit hook is the only
 * regular-user surface and updates these rows transactionally.
 */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("ai_rate_limits");
    } catch (error) {
      collection = new Collection({
        type: "base",
        name: "ai_rate_limits",
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
      });
      app.save(collection);
      collection = app.findCollectionByNameOrId("ai_rate_limits");
    }

    const fields = [
      {
        name: "bucketKey",
        build: () => new TextField({ name: "bucketKey", required: true, min: 1, max: 200 }),
      },
      {
        name: "subjectType",
        build: () =>
          new SelectField({
            name: "subjectType",
            required: true,
            values: ["user", "dealer"],
            maxSelect: 1,
          }),
      },
      {
        name: "subjectId",
        build: () => new TextField({ name: "subjectId", required: true, min: 1, max: 40 }),
      },
      {
        name: "route",
        build: () => new TextField({ name: "route", required: true, min: 1, max: 64 }),
      },
      {
        name: "count",
        build: () =>
          new NumberField({ name: "count", required: true, min: 0, onlyInt: true }),
      },
      {
        name: "resetAt",
        build: () =>
          new NumberField({ name: "resetAt", required: true, min: 0, onlyInt: true }),
      },
      {
        name: "created",
        build: () => new AutodateField({ name: "created", onCreate: true }),
      },
      {
        name: "updated",
        build: () => new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
      },
    ];

    let changed = false;
    for (const field of fields) {
      if (!collection.fields.getByName(field.name)) {
        collection.fields.add(field.build());
        changed = true;
      }
    }

    collection.listRule = null;
    collection.viewRule = null;
    collection.createRule = null;
    collection.updateRule = null;
    collection.deleteRule = null;
    collection.addIndex("idx_ai_rate_limits_bucket_key", true, "bucketKey", "");
    app.save(collection);
    console.log(
      changed
        ? "[ok] ai_rate_limits collection created/repaired"
        : "[ok] ai_rate_limits collection already current"
    );
  },
  () => {
    // Forward-only operational state. Dropping counters during a rollback would
    // create a temporary quota bypass.
  }
);
