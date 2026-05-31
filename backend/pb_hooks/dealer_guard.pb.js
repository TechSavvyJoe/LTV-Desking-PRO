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

const DEALER_SCOPED = [
  "inventory",
  "lender_profiles",
  "saved_deals",
  "dealer_settings",
];

const enforceDealer = (e) => {
  const auth = e.auth;

  // Superadmins are trusted to write across dealerships (e.g., seeding,
  // impersonation, support operations).
  if (auth && auth.get("role") === "superadmin") return e.next();

  // Fail CLOSED. A write to a dealer-scoped collection with no enforceable
  // tenant must be rejected, never passed through with a client-supplied
  // `dealer`. Previously both branches called e.next(), so an unauthenticated
  // request (if a create/update rule were ever loosened) or a misconfigured
  // user with an empty `dealer` could write with an attacker-chosen tenant. [B2]
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

for (const name of DEALER_SCOPED) {
  onRecordCreateRequest((e) => enforceDealer(e), name);
  onRecordUpdateRequest((e) => enforceDealer(e), name);
}
