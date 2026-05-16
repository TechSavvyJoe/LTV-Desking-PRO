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
  if (!auth) return e.next();

  // Superadmins are trusted to write across dealerships (e.g., seeding,
  // impersonation, support operations).
  const role = auth.get("role");
  if (role === "superadmin") return e.next();

  const authDealer = auth.get("dealer");
  if (!authDealer) return e.next();

  // Force the dealer field on the incoming record regardless of payload.
  e.record.set("dealer", authDealer);
  return e.next();
};

for (const name of DEALER_SCOPED) {
  onRecordCreateRequest((e) => enforceDealer(e), name);
  onRecordUpdateRequest((e) => enforceDealer(e), name);
}
