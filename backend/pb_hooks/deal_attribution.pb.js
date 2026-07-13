/// <reference path="../pb_data/types.d.ts" />

/**
 * SEC-004: Clamp `user` attribution on saved_deals / deal_events.
 *
 * Collection update rules are same-dealer, and the client can set `user`.
 * Without this hook a sales user could overwrite a colleague's deal or forge
 * deal_events attribution. Dealer stamping remains in dealer_guard.pb.js.
 *
 * Policy:
 * - create: force `user` to @request.auth.id for everyone except superadmin
 * - update: prevent changing `user` unless admin or superadmin
 *
 * IMPORTANT — PocketBase JSVM scoping: handler callbacks run in pooled runtimes
 * that DO NOT capture this file's module scope. Declare helpers INSIDE each
 * handler (or inline), and register collections with literal names. [JSVM]
 */

const registerDealAttributionGuard = (collectionName) => {
  onRecordCreateRequest((e) => {
    const auth = e.auth;
    let authCollectionName = "";
    try {
      const authCollection =
        auth && typeof auth.collection === "function"
          ? auth.collection()
          : auth && typeof auth.collection === "object"
            ? auth.collection
            : null;
      authCollectionName = authCollection ? String(authCollection.name || "") : "";
    } catch (err) {
      authCollectionName = "";
    }
    const authRole = auth && typeof auth.get === "function" ? auth.get("role") : "";
    const isSuperuser = authCollectionName === "_superusers" || authRole === "superadmin";

    // Superadmins may seed / support with an arbitrary attribution.
    if (isSuperuser) return e.next();

    if (!auth || !auth.id) {
      throw new ForbiddenError("Authentication is required to create attributed deal records.");
    }

    e.record.set("user", auth.id);
    return e.next();
  }, collectionName);

  onRecordUpdateRequest((e) => {
    const auth = e.auth;
    let authCollectionName = "";
    try {
      const authCollection =
        auth && typeof auth.collection === "function"
          ? auth.collection()
          : auth && typeof auth.collection === "object"
            ? auth.collection
            : null;
      authCollectionName = authCollection ? String(authCollection.name || "") : "";
    } catch (err) {
      authCollectionName = "";
    }
    const authRole = auth && typeof auth.get === "function" ? auth.get("role") : "";
    const isSuperuser = authCollectionName === "_superusers" || authRole === "superadmin";
    const isAdmin = authRole === "admin";

    // Admins may reassign deals within their dealership; superadmins unrestricted.
    if (isSuperuser || isAdmin) return e.next();

    const original = e.record.original();
    const storedUser = original && typeof original.get === "function" ? original.get("user") : "";
    e.record.set("user", storedUser);
    return e.next();
  }, collectionName);
};

registerDealAttributionGuard("saved_deals");
registerDealAttributionGuard("deal_events");
