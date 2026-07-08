/// <reference path="../pb_data/types.d.ts" />

/**
 * Append-only evidentiary record of customer-facing events. [G44/G45/G46]
 *
 * Answers "what payment did we show this customer, when, and who showed it" —
 * the question the dealer's deal jacket must answer in a dispute. The plan's
 * original idea (extend audit_log) was invalidated when audit_log creation was
 * locked to superadmin; this dealer-scoped collection replaces it.
 *
 * Rows are immutable: create-only for same-dealer authenticated users (the
 * dealer_guard hook force-stamps the dealer relation), readable by dealership
 * admins and the platform owner, never updatable or deletable via the API.
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId("deal_events");
      console.log("[skip] deal_events already exists");
      return;
    } catch {
      // proceed
    }

    let dealersId, usersId;
    try {
      dealersId = app.findCollectionByNameOrId("dealers").id;
      usersId = app.findCollectionByNameOrId("users").id;
    } catch {
      console.log("[SKIP-DRIFT-RISK] deal_events: dealers/users collection missing (fresh DB)");
      return;
    }

    const AUTHED = '@request.auth.id != ""';
    const SUPER = '@request.auth.role = "superadmin"';
    const ADMIN_OR_SUPER = '(@request.auth.role = "superadmin" || @request.auth.role = "admin")';

    // Created with NULL rules first (admin-only): on a fresh same-boot DB the
    // rule parser cannot resolve @request.auth.dealer (the PB v0.26 schema-
    // cache quirk documented in 1747400002), so applying rules at create time
    // crashes the whole boot. Rules are applied best-effort below; prod (where
    // users.dealer long exists) applies them on the first run.
    const collection = new Collection({
      type: "base",
      name: "deal_events",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        new RelationField({
          name: "dealer",
          required: true,
          collectionId: dealersId,
          maxSelect: 1,
          cascadeDelete: false,
        }),
        new RelationField({
          name: "user",
          required: true,
          collectionId: usersId,
          maxSelect: 1,
          cascadeDelete: false,
        }),
        new TextField({ name: "action", required: true, max: 60 }),
        new TextField({ name: "customerName", required: false, max: 200 }),
        new TextField({ name: "vin", required: false, max: 32 }),
        new JSONField({ name: "snapshot", required: false, maxSize: 400000 }),
      ],
      indexes: [
        "CREATE INDEX IF NOT EXISTS idx_deal_events_dealer ON deal_events (dealer)",
        "CREATE INDEX IF NOT EXISTS idx_deal_events_created ON deal_events (created)",
        "CREATE INDEX IF NOT EXISTS idx_deal_events_action ON deal_events (action)",
      ],
    });

    app.save(collection);

    // Best-effort rule application (see note above). If this skips, the
    // collection stays admin-only until the migration re-runs after restart —
    // fail-closed, never fail-open.
    try {
      const saved = app.findCollectionByNameOrId("deal_events");
      saved.listRule = `${AUTHED} && (${SUPER} || (${ADMIN_OR_SUPER} && dealer = @request.auth.dealer))`;
      saved.viewRule = `${AUTHED} && (${SUPER} || (${ADMIN_OR_SUPER} && dealer = @request.auth.dealer))`;
      saved.createRule = `${AUTHED} && (${SUPER} || @request.body.dealer = @request.auth.dealer)`;
      app.save(saved);
      console.log("[ok] deal_events rules applied");
    } catch (e) {
      console.log(
        "[SKIP-DRIFT-RISK] deal_events rules not applied (fresh-boot schema cache) — collection is admin-only until re-run: " +
          e
      );
    }
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("deal_events");
      app.delete(c);
    } catch {
      // already gone
    }
  }
);
