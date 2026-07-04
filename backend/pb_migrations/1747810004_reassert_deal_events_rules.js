/// <reference path="../pb_data/types.d.ts" />

/**
 * Re-assert deal_events access rules. [dc-redesign / prod fix]
 *
 * Verified against production (2026-07-04): deal_events.createRule is NULL —
 * 1747800002/1747800003 both hit their fail-closed skip at the PR #3 deploy,
 * so every client deal-event write has 403'd ("Only superusers can perform
 * this action") since then. The desk's deal_saved / deal_sheet_generated /
 * deal_status_changed / buy_rate_applied events are all dropped.
 *
 * This migration re-runs the exact same rule assertion one deploy later, when
 * the users.dealer relation and dealer rows have long existed and the schema
 * cache is settled. Idempotent: no-ops where the rules already applied.
 * Fail-closed like its predecessors — but loudly, so the deploy logs surface
 * a repeat failure instead of burying it.
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
    const dealerScopedRead = `${AUTHED} && (${SUPER} || (${ADMIN_OR_SUPER} && @request.auth.dealer.id ?= dealer.id))`;
    const dealerScopedCreate = `${AUTHED} && (${SUPER} || @request.auth.dealer.id ?= dealer.id)`;

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
      console.log("[ok] deal_events dealer-scoped rules re-asserted");
    } catch (e) {
      console.log(
        "[SKIP-DRIFT-RISK][ACTION-REQUIRED] deal_events rule re-assertion failed AGAIN — " +
          "collection stays superuser-only and client deal events keep 403ing. " +
          "Apply the rules manually via the PB admin UI. Error: " +
          e
      );
    }
  },
  (app) => {
    // Down: no-op (leaving stricter rules in place is safe).
  }
);
