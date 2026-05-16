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

// Read/write for any authed user whose dealer matches the record's dealer.
const SAME_DEALER = `${AUTHED} && (${SUPER} || @request.auth.dealer = dealer)`;

// Read/write that requires admin- or super-level for the same dealer.
const SAME_DEALER_ADMIN = `${AUTHED} && (${SUPER} || (${ADMIN_OR_SUPER} && @request.auth.dealer = dealer))`;

// For the `dealers` collection itself the matching field is `id` (not `dealer`).
const ON_OWN_DEALER = `${AUTHED} && (${SUPER} || @request.auth.dealer = id)`;
const ON_OWN_DEALER_ADMIN_UPDATE = `${AUTHED} && (${SUPER} || (@request.auth.role = "admin" && @request.auth.dealer = id))`;

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
      create: SAME_DEALER,
      update: SAME_DEALER,
      delete: SAME_DEALER,
    };
    applyTo(app, "inventory", sameDealerAll);
    applyTo(app, "lender_profiles", sameDealerAll);
    applyTo(app, "saved_deals", sameDealerAll);

    applyTo(app, "dealer_settings", {
      list: SAME_DEALER,
      view: SAME_DEALER,
      create: SAME_DEALER_ADMIN,
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
    const sameDealerOrSelf = `${AUTHED} && (${SUPER} || @request.auth.dealer = dealer || id = @request.auth.id)`;
    users.listRule = sameDealerOrSelf;
    users.viewRule = sameDealerOrSelf;
    users.createRule = `${AUTHED} && ${ADMIN_OR_SUPER}`;
    users.updateRule = `${AUTHED} && (${SUPER} || id = @request.auth.id || (@request.auth.role = "admin" && @request.auth.dealer = dealer))`;
    users.deleteRule = `${AUTHED} && (${SUPER} || (@request.auth.role = "admin" && @request.auth.dealer = dealer))`;
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
