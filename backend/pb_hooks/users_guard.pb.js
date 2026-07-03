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
 * Public self-registration (lib/auth.ts register()) sets the new user's
 * `dealer` from a looked-up dealer code while unauthenticated. The create hook
 * below validates that flow server-side: the request body must carry a
 * `dealerCode` that resolves to a dealers record whose id matches the record's
 * `dealer` relation, and system_settings.signupsEnabled must not be switched
 * off — otherwise the create is rejected. (This closes the previously-flagged
 * gap where a crafted signup could attach to an arbitrary dealer.)
 *
 * IMPORTANT — PocketBase JSVM scoping: handler callbacks run in pooled runtimes
 * that DO NOT capture this file's module scope. Anything a handler references
 * (e.g. a shared PRIVILEGED_FIELDS const) must be declared INSIDE the handler,
 * or it throws "ReferenceError: ... is not defined" on every matching request. [JSVM]
 */

onRecordUpdateRequest((e) => {
  // `active` is admin-gated too: the offboarding switch shouldn't be writable
  // by a sales/manager user on their own record. role/dealer block escalation;
  // active blocks self-reactivation games. [minor]
  const PRIVILEGED_FIELDS = ["role", "dealer", "active"];
  const auth = e.auth;
  const actorRole = auth ? auth.get("role") : "";

  // Superadmins may legitimately change roles / move users between dealerships.
  if (actorRole === "superadmin") return e.next();

  // The persisted (pre-update) state of the record being modified.
  const original = e.record.original();
  const actorDealer = auth ? String(auth.get("dealer") || "") : "";

  // A non-superadmin must never modify a SUPERADMIN's record at all. Without
  // this, a tenant admin could demote or deactivate a dealer-assigned platform
  // owner (the guard below only blocked GRANTING superadmin, not stripping it). [C15]
  if (original.get("role") === "superadmin") {
    throw new ForbiddenError("Only the platform owner can modify a superadmin account.");
  }

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
    if (actorRole === "admin" && field === "active") {
      // An admin MAY activate/deactivate users in their dealership — that's the
      // offboarding feature. (Cross-dealer scope is enforced by the API rule.)
      continue;
    }

    // Everyone else (sales/user) cannot change role, dealer, or active.
    e.record.set(field, stored);
  }

  return e.next();
}, "users");

onRecordCreateRequest((e) => {
  const auth = e.auth;
  const actorRole = auth ? auth.get("role") : "";

  // CRITICAL: PocketBase BoolField is non-nullable and defaults to the zero
  // value `false` when omitted on create — and NO create path (register,
  // createUser, createDealerUser, admin) sets `active`. Without this, every new
  // user is born active=false and the deactivation auth hook locks them out
  // immediately (self-registration auto-login fails; admin-created users can
  // never sign in). Stamp active=true unless explicitly being deactivated. [G40]
  if (e.record.get("active") !== false) e.record.set("active", true);

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

  // Public self-registration (no authenticated actor). PB API rules cannot
  // validate one collection's field against another collection's data, so the
  // dealer-code check lives here. Everything is declared inside the handler
  // ($app / ForbiddenError are runtime globals, not module scope). [JSVM]
  if (!auth) {
    // Owner kill-switch: system_settings.signupsEnabled. Missing collection /
    // record is treated as enabled (matches the frontend default in
    // getSystemSettings); an explicit false rejects.
    let signupsEnabled = true;
    try {
      const rows = $app.findRecordsByFilter("system_settings", "", "", 1, 0);
      if (rows && rows.length > 0 && rows[0].getBool("signupsEnabled") === false) {
        signupsEnabled = false;
      }
    } catch (err) {
      // fresh DB without system_settings — leave enabled
    }
    if (!signupsEnabled) {
      throw new ForbiddenError("New account registration is currently disabled.");
    }

    // The signup payload must name the dealership by its code, and that code
    // must resolve to the exact dealer the record is attaching to. The
    // dealerCode key is not a users field — PB ignores it on the record, so it
    // is read from the raw request body.
    let dealerCode = "";
    try {
      const body = e.requestInfo().body || {};
      dealerCode = String(body.dealerCode || "").trim();
    } catch (err) {
      dealerCode = "";
    }
    if (!dealerCode) {
      throw new ForbiddenError("A dealer code is required to register.");
    }

    let dealerRecord = null;
    try {
      dealerRecord = $app.findFirstRecordByFilter("dealers", "code = {:code}", {
        code: dealerCode,
      });
    } catch (err) {
      dealerRecord = null; // no match
    }
    if (!dealerRecord) {
      throw new ForbiddenError("Invalid dealer code.");
    }
    if (String(e.record.get("dealer") || "") !== dealerRecord.id) {
      throw new ForbiddenError("Dealer code does not match the requested dealership.");
    }
  }

  // Any other create (notably public self-registration) gets the lowest-
  // privilege role regardless of what the client payload requested.
  e.record.set("role", "sales");
  return e.next();
}, "users");

// A non-superadmin must never DELETE a superadmin account (the same gap as the
// update path: tenant admins could remove a dealer-assigned platform owner). [C15]
onRecordDeleteRequest((e) => {
  const auth = e.auth;
  const actorRole = auth ? auth.get("role") : "";
  if (actorRole !== "superadmin" && e.record.get("role") === "superadmin") {
    throw new ForbiddenError("Only the platform owner can delete a superadmin account.");
  }
  return e.next();
}, "users");

// Employee offboarding: a user whose `active` flag has been switched off can
// no longer authenticate or refresh a session. Missing/undefined `active` is
// treated as active so pre-flag accounts keep working. [G40]
onRecordAuthRequest((e) => {
  try {
    const record = e.record;
    if (record && record.collection().name === "users") {
      const raw = record.get("active");
      if (raw === false) {
        throw new ForbiddenError("This account has been deactivated. Contact your administrator.");
      }
    }
  } catch (err) {
    // Re-throw real denials; never let introspection errors block login.
    if (err instanceof ForbiddenError) throw err;
  }
  return e.next();
});
