/// <reference path="../pb_data/types.d.ts" />

/**
 * Harden audit_log create access.
 *
 * The original createRule was `@request.auth.id != "" && @request.body.actor =
 * @request.auth.id`, which let ANY authenticated user (including the lowest
 * 'sales' role) write fabricated audit entries — e.g. forging an
 * "ai_key_updated" record or flooding the log to bury real events. The only
 * legitimate writer is the superadmin AI-key management flow (lib/api.ts
 * writeAuditLog), so restrict creation to superadmin while keeping the
 * self-actor constraint. Reads stay superadmin-only and the log stays
 * append-only (no update/delete).
 */
migrate(
  (app) => {
    let c;
    try {
      c = app.findCollectionByNameOrId("audit_log");
    } catch {
      console.log("[skip] audit_log collection not found");
      return;
    }
    c.createRule =
      '@request.auth.id != "" && @request.auth.role = "superadmin" && @request.body.actor = @request.auth.id';
    app.save(c);
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("audit_log");
      c.createRule = '@request.auth.id != "" && @request.body.actor = @request.auth.id';
      app.save(c);
    } catch {
      // collection gone — nothing to roll back
    }
  }
);
