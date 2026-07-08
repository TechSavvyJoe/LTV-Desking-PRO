/// <reference path="../pb_data/types.d.ts" />

/**
 * Apply deal_events access rules at BOOTSTRAP, not in a run-once migration.
 *
 * Both 1747800003 and 1747810004 hit the migration-time rule-parser quirk on
 * the production database (rules set at migration boot fail to parse and the
 * fail-closed catch leaves createRule NULL), so every client deal-event write
 * has 403'd. Runtime rule edits parse fine — so assert the rules on every
 * boot, after the schema is fully loaded. Idempotent: no-ops once applied,
 * and a transient failure self-heals on the next machine restart.
 */
onBootstrap((e) => {
  e.next();

  try {
    const c = e.app.findCollectionByNameOrId("deal_events");

    const AUTHED = '@request.auth.id != ""';
    const SUPER = '@request.auth.role = "superadmin"';
    const ADMIN_OR_SUPER = '(@request.auth.role = "superadmin" || @request.auth.role = "admin")';
    const dealerScopedRead =
      AUTHED + " && (" + SUPER + " || (" + ADMIN_OR_SUPER + " && dealer = @request.auth.dealer))";
    const dealerScopedCreate = AUTHED + " && (" + SUPER + " || @request.body.dealer = @request.auth.dealer)";

    if (c.listRule === dealerScopedRead && c.createRule === dealerScopedCreate) {
      return; // already applied — the common case after the first successful boot
    }

    c.listRule = dealerScopedRead;
    c.viewRule = dealerScopedRead;
    c.createRule = dealerScopedCreate;
    c.updateRule = null;
    c.deleteRule = null;
    e.app.save(c);
    console.log("[ok] deal_events dealer-scoped rules applied at bootstrap");
  } catch (err) {
    console.log(
      "[ACTION-REQUIRED] deal_events bootstrap rule apply failed — client deal events " +
        "will 403 until rules are set via the PB admin UI. Error: " + err
    );
  }
});

/**
 * Retry via cron: bootstrap fires before same-boot migrations finish, so a
 * boot that REPAIRS the schema (e.g. 1747810005 adding the dealer relation)
 * still ends with unapplied rules until the next restart. This idempotent
 * cron closes that gap within a minute and no-ops forever after.
 */
cronAdd("deal_events_rules_retry", "* * * * *", () => {
  try {
    const c = $app.findCollectionByNameOrId("deal_events");

    const AUTHED = '@request.auth.id != ""';
    const SUPER = '@request.auth.role = "superadmin"';
    const ADMIN_OR_SUPER = '(@request.auth.role = "superadmin" || @request.auth.role = "admin")';
    const dealerScopedRead =
      AUTHED + " && (" + SUPER + " || (" + ADMIN_OR_SUPER + " && dealer = @request.auth.dealer))";
    const dealerScopedCreate = AUTHED + " && (" + SUPER + " || @request.body.dealer = @request.auth.dealer)";

    if (c.listRule === dealerScopedRead && c.createRule === dealerScopedCreate) {
      return; // applied — stays a cheap no-op
    }

    c.listRule = dealerScopedRead;
    c.viewRule = dealerScopedRead;
    c.createRule = dealerScopedCreate;
    c.updateRule = null;
    c.deleteRule = null;
    $app.save(c);
    console.log("[ok] deal_events dealer-scoped rules applied by cron retry");
  } catch (err) {
    console.log("[retry] deal_events cron rule apply failed (will retry): " + err);
  }
});
