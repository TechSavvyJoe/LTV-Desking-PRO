/// <reference path="../pb_data/types.d.ts" />

/**
 * Role separation inside a dealership + employee deactivation. [G37/G38/G40/G46]
 *
 * Before this migration every authenticated same-dealer user — including the
 * default "sales" role — could create/edit/delete lender programs, rewrite
 * inventory prices/book values, and hard-delete saved deals. In a real store,
 * salespeople must not edit the lender sheet the desk quotes from, and deal
 * records must not be silently destroyable by anyone.
 *
 * Changes:
 *  - lender_profiles: all writes become admin-or-superadmin (same dealer).
 *  - inventory: update/delete become admin-or-superadmin; CREATE stays
 *    any-same-dealer so the VIN-decode "add unit" desk flow keeps working.
 *  - saved_deals: delete becomes admin-or-superadmin; update stays same-dealer
 *    (sales legitimately revise their own deals; deal_events logs revisions).
 *  - users: adds an `active` flag for instant offboarding (auth hook enforces
 *    it; missing/undefined treated as active for backward compatibility) and
 *    backfills active=true for all existing users.
 */

const AUTHED = '@request.auth.id != ""';
const SUPER = '@request.auth.role = "superadmin"';
const ADMIN_OR_SUPER = '(@request.auth.role = "superadmin" || @request.auth.role = "admin")';
const SAME_DEALER = `${AUTHED} && (${SUPER} || @request.auth.dealer.id ?= dealer.id)`;
const SAME_DEALER_ADMIN = `${AUTHED} && (${SUPER} || (${ADMIN_OR_SUPER} && @request.auth.dealer.id ?= dealer.id))`;

migrate(
  (app) => {
    // Same fresh-DB guard as 1747400002 (rule parser can't resolve user fields
    // added in the same boot). Loud, not silent: this is a known-drift hazard.
    let hasDealers = false;
    try {
      const records = app.findRecordsByFilter("dealers", "", "", 1, 0);
      hasDealers = records && records.length > 0;
    } catch (e) {
      hasDealers = false;
    }
    if (!hasDealers) {
      console.log(
        "[SKIP-DRIFT-RISK] role_gated_writes: fresh DB — re-run after first dealer exists (see docs/runbooks/db-restore.md)"
      );
      return;
    }

    const apply = (name, patch) => {
      let c;
      try {
        c = app.findCollectionByNameOrId(name);
      } catch (e) {
        console.log(`[SKIP-DRIFT-RISK] ${name} not found`);
        return;
      }
      for (const [k, v] of Object.entries(patch)) c[k] = v;
      app.save(c);
    };

    apply("lender_profiles", {
      createRule: SAME_DEALER_ADMIN,
      updateRule: SAME_DEALER_ADMIN,
      deleteRule: SAME_DEALER_ADMIN,
    });
    apply("inventory", {
      updateRule: SAME_DEALER_ADMIN,
      deleteRule: SAME_DEALER_ADMIN,
    });
    apply("saved_deals", {
      deleteRule: SAME_DEALER_ADMIN,
    });

    // users.active — instant offboarding switch.
    try {
      const users = app.findCollectionByNameOrId("users");
      if (!users.fields.getByName("active")) {
        users.fields.add(new BoolField({ name: "active", required: false }));
        app.save(users);
      }
      // perPage=0 = ALL users. Adding the BoolField writes the zero value
      // (false) into every existing row; capping the backfill at 500 would lock
      // out user #501+ on the login path (the auth hook denies active=false).
      // Matches the perPage=0 precedent in 1747500000_backfill_email_visibility.
      const all = app.findRecordsByFilter("users", "", "", 0, 0);
      for (const u of all) {
        if (!u.getBool("active")) {
          u.set("active", true);
          app.save(u);
        }
      }
      console.log(`[ok] users.active backfilled for ${all.length} users`);
    } catch (e) {
      console.log("[SKIP-DRIFT-RISK] users.active setup failed: " + e);
    }
  },
  (app) => {
    // Down: restore the pre-existing same-dealer-any-role write rules.
    const restore = (name, patch) => {
      try {
        const c = app.findCollectionByNameOrId(name);
        for (const [k, v] of Object.entries(patch)) c[k] = v;
        app.save(c);
      } catch {
        /* ignore */
      }
    };
    restore("lender_profiles", {
      createRule: SAME_DEALER,
      updateRule: SAME_DEALER,
      deleteRule: SAME_DEALER,
    });
    restore("inventory", { updateRule: SAME_DEALER, deleteRule: SAME_DEALER });
    restore("saved_deals", { deleteRule: SAME_DEALER });
    try {
      const users = app.findCollectionByNameOrId("users");
      if (users.fields.getByName("active")) {
        users.fields.removeByName("active");
        app.save(users);
      }
    } catch {
      /* ignore */
    }
  }
);
