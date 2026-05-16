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

migrate(
  (app) => {
    // --- dealers ---
    const dealers = app.findCollectionByNameOrId("dealers");
    setRules(dealers, {
      list: ON_OWN_DEALER,
      view: ON_OWN_DEALER,
      create: SUPER,
      update: ON_OWN_DEALER_ADMIN_UPDATE,
      delete: SUPER,
    });
    app.save(dealers);

    // --- inventory ---
    const inventory = app.findCollectionByNameOrId("inventory");
    setRules(inventory, {
      list: SAME_DEALER,
      view: SAME_DEALER,
      create: SAME_DEALER,
      update: SAME_DEALER,
      delete: SAME_DEALER,
    });
    app.save(inventory);

    // --- lender_profiles ---
    const lenders = app.findCollectionByNameOrId("lender_profiles");
    setRules(lenders, {
      list: SAME_DEALER,
      view: SAME_DEALER,
      create: SAME_DEALER,
      update: SAME_DEALER,
      delete: SAME_DEALER,
    });
    app.save(lenders);

    // --- saved_deals ---
    const deals = app.findCollectionByNameOrId("saved_deals");
    setRules(deals, {
      list: SAME_DEALER,
      view: SAME_DEALER,
      create: SAME_DEALER,
      update: SAME_DEALER,
      delete: SAME_DEALER,
    });
    app.save(deals);

    // --- dealer_settings ---
    const dealerSettings = app.findCollectionByNameOrId("dealer_settings");
    setRules(dealerSettings, {
      list: SAME_DEALER,
      view: SAME_DEALER,
      create: SAME_DEALER_ADMIN,
      update: SAME_DEALER_ADMIN,
      delete: SAME_DEALER_ADMIN,
    });
    app.save(dealerSettings);

    // --- users ---
    // Allow superadmins anything. Allow same-dealer reads. Allow admins to
    // manage users in their own dealership. Allow users to read their own
    // record (already covered by same-dealer, but explicit fallback for safety).
    const users = app.findCollectionByNameOrId("users");
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
