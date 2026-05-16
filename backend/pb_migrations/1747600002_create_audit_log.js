/// <reference path="../pb_data/types.d.ts" />

/**
 * Append-only audit log for security-sensitive actions, primarily AI
 * provider key changes. Visible only to superadmin.
 *
 * Fields:
 *  - actor:  the user who triggered the action (relation to users)
 *  - action: short identifier, e.g. "ai_key_updated", "ai_key_cleared",
 *            "ai_key_tested"
 *  - target: optional secondary key, e.g. "openai" / "anthropic" / "gemini"
 *  - details: free-form JSON (e.g. { ok: true, error: "..." })
 *
 * Created timestamp uses PB's built-in `created` field — there's no need
 * for a separate `at` column.
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId("audit_log");
      console.log("[skip] audit_log collection already exists");
      return;
    } catch {
      // proceed
    }

    let usersId;
    try {
      usersId = app.findCollectionByNameOrId("users").id;
    } catch {
      console.log("[skip] users collection not found — cannot create audit_log.actor relation");
      return;
    }

    const collection = new Collection({
      type: "base",
      name: "audit_log",
      // Only superadmin can read; create is allowed for any authenticated
      // user so client-side helpers can write log entries for their own
      // actions. Update/delete are blocked to keep the log append-only.
      listRule: '@request.auth.id != "" && @request.auth.role = "superadmin"',
      viewRule: '@request.auth.id != "" && @request.auth.role = "superadmin"',
      createRule: '@request.auth.id != "" && @request.body.actor = @request.auth.id',
      updateRule: null,
      deleteRule: null,
      fields: [
        new RelationField({
          name: "actor",
          required: true,
          collectionId: usersId,
          maxSelect: 1,
          cascadeDelete: false,
        }),
        new TextField({ name: "action", required: true, max: 100 }),
        new TextField({ name: "target", required: false, max: 200 }),
        new JSONField({ name: "details", required: false, maxSize: 10000 }),
      ],
      indexes: [
        "CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created)",
        "CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("audit_log");
      app.delete(c);
    } catch {
      // already gone
    }
  }
);
