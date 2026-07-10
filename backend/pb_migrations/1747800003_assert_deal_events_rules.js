/// <reference path="../pb_data/types.d.ts" />

/**
 * Assert deal_events access rules in a SEPARATE migration that runs AFTER the
 * collection (and the users.dealer relation it traverses) already exist. [minor]
 *
 * 1747800002 creates deal_events with NULL rules and applies the dealer-scoped
 * rules "best effort" — but on a same-boot fresh DB the rule parser can't yet
 * resolve `@request.auth.dealer`, so it skips and the collection would stay
 * admin-only with no re-run. Running the assertion here, one migration later,
 * means the schema cache is settled and the rules apply cleanly. Idempotent and
 * fail-closed: if it still can't apply, the collection remains admin-only (safe).
 */
migrate(
  (app) => {
    let c;
    try {
      c = app.findCollectionByNameOrId("deal_events");
    } catch {
      console.log("[skip] deal_events not found");
      return;
    }

    const AUTHED = '@request.auth.id != ""';
    const SUPER = '@request.auth.role = "superadmin"';
    const ADMIN_OR_SUPER = '(@request.auth.role = "superadmin" || @request.auth.role = "admin")';
    const dealerScopedRead = `${AUTHED} && (${SUPER} || (${ADMIN_OR_SUPER} && dealer = @request.auth.dealer))`;
    const dealerScopedCreate = `${AUTHED} && (${SUPER} || @request.body.dealer = @request.auth.dealer)`;

    // Only write if not already correct (keeps the migration a no-op on DBs
    // where 1747800002 already applied the rules).
    if (c.listRule === dealerScopedRead && c.createRule === dealerScopedCreate) {
      console.log("[skip] deal_events rules already correct");
      return;
    }

    try {
      c.listRule = dealerScopedRead;
      c.viewRule = dealerScopedRead;
      c.createRule = dealerScopedCreate;
      c.updateRule = null;
      c.deleteRule = null;
      app.save(c);
      console.log("[ok] deal_events dealer-scoped rules asserted");
    } catch (e) {
      console.log(
        "[SKIP-DRIFT-RISK] deal_events rule assertion failed — stays admin-only (fail-closed): " + e
      );
    }
  },
  (app) => {
    // Down: no-op (leaving stricter rules in place is safe).
  }
);
