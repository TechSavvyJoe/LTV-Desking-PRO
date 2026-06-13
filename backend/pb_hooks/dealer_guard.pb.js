/// <reference path="../pb_data/types.d.ts" />

/**
 * Defense-in-depth: server-side rewrite of the `dealer` field on every
 * create/update of a dealer-scoped record. The read-side API rules already
 * block cross-dealer reads (see 1747400002_tighten_api_rules.js), but the
 * write rules trust the client to send the correct `dealer`. A compromised
 * frontend or a malicious authenticated user could write into another
 * dealership's data.
 *
 * This hook strips that capability: regardless of what the client sends, the
 * `dealer` value is overwritten with the auth user's `dealer`. Superadmins
 * are exempt — they may need to seed data for any dealership.
 */

/**
 * IMPORTANT — PocketBase JSVM scoping: handler callbacks run in pooled runtimes
 * that DO NOT capture this file's module scope. A shared top-level helper or
 * const referenced inside a handler throws "ReferenceError: ... is not defined"
 * on every matching request. So the guard is defined INSIDE each handler, and
 * the collection list is registered with literal names (the `for` loop's
 * closure over `name` is itself a scope hazard across runtimes). [JSVM]
 */
const registerDealerGuard = (collectionName) => {
  const enforce = (e) => {
    const auth = e.auth;

    // Superadmins are trusted to write across dealerships (seeding, support).
    if (auth && auth.get("role") === "superadmin") return e.next();

    // Fail CLOSED. A write to a dealer-scoped collection with no enforceable
    // tenant must be rejected, never passed through with a client-supplied
    // `dealer`. [B2]
    if (!auth) {
      throw new ForbiddenError("Authentication is required to write dealer-scoped records.");
    }
    const authDealer = auth.get("dealer");
    if (!authDealer) {
      throw new ForbiddenError("Your account is not associated with a dealership.");
    }

    // Force the dealer field on the incoming record regardless of payload.
    e.record.set("dealer", authDealer);
    return e.next();
  };

  onRecordCreateRequest(enforce, collectionName);
  onRecordUpdateRequest(enforce, collectionName);
};

// registerDealerGuard runs at load time (module scope), so referencing it here
// is fine; the closures it builds capture only their own `collectionName` arg.
registerDealerGuard("inventory");
registerDealerGuard("lender_profiles");
registerDealerGuard("saved_deals");
registerDealerGuard("dealer_settings");
registerDealerGuard("deal_events");
