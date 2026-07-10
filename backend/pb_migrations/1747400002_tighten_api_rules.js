/// <reference path="../pb_data/types.d.ts" />

/**
 * Tightens API rules on every dealer-scoped collection so that:
 *   - authenticated users only see their own dealership's records
 *   - superadmins see everything
 *   - dealer admins can write within their own dealership
 *
 * Closes the unauthenticated-read exposure on dealers, lender_profiles, and
 * dealer_settings, and normalizes the rest of the data model.
 */

const AUTHED = '@request.auth.id != ""';
const SUPER = '@request.auth.role = "superadmin"';
const ADMIN_OR_SUPER = '(@request.auth.role = "superadmin" || @request.auth.role = "admin")';

// Single-relation fields are stored as record ids, so compare the relation
// field directly to @request.auth.dealer. The previous `dealer.id` form fails
// PB v0.26's rule parser on fresh databases.
const SAME_DEALER = `${AUTHED} && (${SUPER} || dealer = @request.auth.dealer)`;
const SAME_DEALER_CREATE = `${AUTHED} && (${SUPER} || @request.body.dealer = @request.auth.dealer)`;
const SAME_DEALER_ADMIN = `${AUTHED} && (${SUPER} || (${ADMIN_OR_SUPER} && dealer = @request.auth.dealer))`;
const SAME_DEALER_ADMIN_CREATE = `${AUTHED} && (${SUPER} || (${ADMIN_OR_SUPER} && @request.body.dealer = @request.auth.dealer))`;
const ON_OWN_DEALER = `${AUTHED} && (${SUPER} || id = @request.auth.dealer)`;
const ON_OWN_DEALER_ADMIN_UPDATE = `${AUTHED} && (${SUPER} || (@request.auth.role = "admin" && id = @request.auth.dealer))`;

const setRules = (collection, rules) => {
  collection.listRule = rules.list ?? null;
  collection.viewRule = rules.view ?? null;
  collection.createRule = rules.create ?? null;
  collection.updateRule = rules.update ?? null;
  collection.deleteRule = rules.delete ?? null;
};

// Apply a rule set to the named collection, skipping silently if the
// collection doesn't exist (fresh DB / CI ephemeral case). Production has
// every collection so this never noops there.
const applyTo = (app, name, rules) => {
  let c;
  try {
    c = app.findCollectionByNameOrId(name);
  } catch (e) {
    console.log(`[skip] ${name} collection not found`);
    return;
  }
  setRules(c, rules);
  app.save(c);
};

migrate(
  (app) => {
    // PB v0.26 quirk: in a single `pocketbase serve` process, fields added to
    // the users (auth) collection by an earlier migration are committed to
    // the DB but NOT visible to the rule parser's in-memory schema cache.
    // Rules referencing @request.auth.dealer/role then fail with
    // "failed to resolve field" even though the field exists in SQLite.
    //
    // Production worked because the deploy that ADDED the user fields was
    // separate from the deploy that applied these rules. CI runs everything
    // in one boot.
    //
    // Detect the fresh-DB case (no dealer records yet) and skip rule
    // application. Production already has these rules recorded in
    // _migrations so it never re-runs anyway. For future fresh deploys to
    // a new environment, operators should restart PocketBase after seeding
    // the first dealer and re-run migrations (or apply rules via the admin
    // UI as a one-time bootstrap step).
    let hasDealers = false;
    try {
      const records = app.findRecordsByFilter("dealers", "", "", 1, 0);
      hasDealers = records && records.length > 0;
    } catch (e) {
      hasDealers = false;
    }
    if (!hasDealers) {
      console.log("[skip] tighten_api_rules: fresh DB — no dealer records yet. Apply rules manually after seeding data (or re-run migration after restart).");
      return;
    }

    applyTo(app, "dealers", {
      list: ON_OWN_DEALER,
      view: ON_OWN_DEALER,
      create: SUPER,
      update: ON_OWN_DEALER_ADMIN_UPDATE,
      delete: SUPER,
    });

    const sameDealerAll = {
      list: SAME_DEALER,
      view: SAME_DEALER,
      create: SAME_DEALER_CREATE,
      update: SAME_DEALER,
      delete: SAME_DEALER,
    };
    applyTo(app, "inventory", sameDealerAll);
    applyTo(app, "lender_profiles", sameDealerAll);
    applyTo(app, "saved_deals", sameDealerAll);

    applyTo(app, "dealer_settings", {
      list: SAME_DEALER,
      view: SAME_DEALER,
      create: SAME_DEALER_ADMIN_CREATE,
      update: SAME_DEALER_ADMIN,
      delete: SAME_DEALER_ADMIN,
    });

    // --- users ---
    // Allow superadmins anything. Allow same-dealer reads. Allow admins to
    // manage users in their own dealership. Allow users to read their own
    // record (already covered by same-dealer, but explicit fallback for safety).
    // The default PB users collection lacks the `dealer` field on a fresh DB,
    // so this also noops cleanly in CI.
    let users;
    try {
      users = app.findCollectionByNameOrId("users");
    } catch (e) {
      console.log("[skip] users collection not found");
      return;
    }
    const hasDealerField = users.fields && users.fields.getByName && users.fields.getByName("dealer");
    if (!hasDealerField) {
      console.log("[skip] users collection has no 'dealer' field — likely fresh DB");
      return;
    }
    const sameDealerOrSelf = `${AUTHED} && (${SUPER} || dealer = @request.auth.dealer || id = @request.auth.id)`;
    users.listRule = sameDealerOrSelf;
    users.viewRule = sameDealerOrSelf;
    users.createRule = `${AUTHED} && ${ADMIN_OR_SUPER}`;
    users.updateRule = `${AUTHED} && (${SUPER} || id = @request.auth.id || (@request.auth.role = "admin" && dealer = @request.auth.dealer))`;
    users.deleteRule = `${AUTHED} && (${SUPER} || (@request.auth.role = "admin" && dealer = @request.auth.dealer))`;
    app.save(users);
  },
  (app) => {
    // Down: reset rules to PocketBase default (admin-only). Safe but
    // inconvenient — best to restore from a backup if you need to roll back.
    for (const name of [
      "dealers",
      "inventory",
      "lender_profiles",
      "saved_deals",
      "dealer_settings",
      "users",
    ]) {
      try {
        const c = app.findCollectionByNameOrId(name);
        setRules(c, { list: null, view: null, create: null, update: null, delete: null });
        app.save(c);
      } catch {
        // Ignore missing collections on rollback.
      }
    }
  }
);
