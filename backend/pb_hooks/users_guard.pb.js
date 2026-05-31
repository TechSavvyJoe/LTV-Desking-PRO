/// <reference path="../pb_data/types.d.ts" />

/**
 * Defense-in-depth for the `users` (auth) collection — closes a complete
 * privilege-escalation / tenant-hop hole.
 *
 * PocketBase API rules cannot restrict WHICH fields a request changes, and the
 * users.updateRule intentionally lets a user update their own record. That
 * combination let any authenticated non-superadmin PATCH their own record with
 * { "role": "superadmin" } (instant full superadmin, which then unlocks every
 * RBAC rule, the dealer_guard exemption, AI provider keys, the audit log, and
 * all dealers' data) or { "dealer": "<other dealer id>" } (move into another
 * dealership). PB rules alone cannot stop this — only a hook can.
 *
 * This hook forces `role` and `dealer` back to their stored values on any
 * update by a non-superadmin (admins may manage users within their own
 * dealership but never grant superadmin or move a user to another dealer), and
 * forces a safe default `role` on any non-admin create (e.g. public
 * self-registration), so a registrant can never request an elevated role.
 *
 * NOTE (flagged): public self-registration (lib/auth.ts register()) sets the
 * new user's `dealer` from a looked-up dealer code while unauthenticated. The
 * dealer value on the *create* path is not validated against that code here, so
 * a crafted signup could still attach to an arbitrary dealer at the lowest
 * (sales) role. Validating the dealer code server-side is a follow-up.
 */

const PRIVILEGED_FIELDS = ["role", "dealer"];

onRecordUpdateRequest((e) => {
  const auth = e.auth;
  const actorRole = auth ? auth.get("role") : "";

  // Superadmins may legitimately change roles / move users between dealerships.
  if (actorRole === "superadmin") return e.next();

  // The persisted (pre-update) state of the record being modified.
  const original = e.record.original();
  const actorDealer = auth ? String(auth.get("dealer") || "") : "";

  for (const field of PRIVILEGED_FIELDS) {
    const incoming = e.record.get(field);
    const stored = original.get(field);
    if (String(incoming) === String(stored)) continue; // unchanged

    if (actorRole === "admin" && field === "role") {
      // An admin may set any non-privileged role, but never superadmin.
      if (incoming === "superadmin") e.record.set("role", stored);
      continue;
    }
    if (actorRole === "admin" && field === "dealer") {
      // An admin may only keep users within their own dealership.
      if (String(incoming) !== actorDealer) e.record.set("dealer", stored);
      continue;
    }

    // Everyone else (sales/user) cannot change role or dealer at all.
    e.record.set(field, stored);
  }

  return e.next();
}, "users");

onRecordCreateRequest((e) => {
  const auth = e.auth;
  const actorRole = auth ? auth.get("role") : "";

  // Only a superadmin may create a user with an arbitrary role / dealership.
  if (actorRole === "superadmin") return e.next();

  if (actorRole === "admin") {
    // A dealership admin may create users within their OWN dealership and must
    // never mint a superadmin. Apply the same clamps the update path uses, so
    // create isn't an escalation/tenant-hop bypass of the update guard.
    if (e.record.get("role") === "superadmin") e.record.set("role", "sales");
    const actorDealer = auth.get("dealer");
    if (actorDealer) e.record.set("dealer", actorDealer);
    return e.next();
  }

  // Any other create (notably public self-registration) gets the lowest-
  // privilege role regardless of what the client payload requested.
  e.record.set("role", "sales");
  return e.next();
}, "users");
