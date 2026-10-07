/// <reference path="../pb_data/types.d.ts" />

/**
 * Filter/sort oracle guard for the cost wall in field_visibility.pb.js. [ship-gate P1]
 *
 * record.hide()/set() in onRecordEnrich only change what is SERIALIZED.
 * PocketBase still evaluates ?filter= and ?sort= (and realtime subscription
 * filters) against the STORED values, so a sales token could binary-search a
 * hidden value through totalItems or event delivery: `unitCost > 14099` → 1
 * item, `> 14100` → 0. Reproduced on PB 0.39.6 for reservePct, tier buy
 * rates/adders (`tiers ~ '"baseInterestRate":6.49'`), inventory.unitCost and
 * saved_deals.vehicleData.unitCost — and through relations from OTHER
 * collections (`saved_deals?filter=vehicle.unitCost > N`,
 * `dealers?filter=inventory_via_dealer.unitCost ?> N`). So both guards below
 * apply to EVERY collection, not only the three that store the data.
 * (`@collection.*` filters are already superuser-only in PocketBase.)
 *
 * For anyone but platform `_superusers` and the superadmin / admin / manager
 * roles (resolved exactly as the enrich hooks do), a filter or sort that names
 * a protected field is rejected with 403. Matching is case-insensitive, on
 * identifier boundaries, against the text as sent and with whitespace/quotes
 * removed — string literals are scanned too, so a quoted value that spells a
 * protected name is also refused (no app query does). Anything that cannot be
 * read or parsed is rejected (fail closed). The app's own queries never name
 * these fields (dealer / name / created / updated / firstName / status
 * filters and sorts; realtime topics without options).
 *
 * The list event fires after PocketBase has run the query (it carries the
 * result), so a refusal withholds the answer rather than skipping the query.
 *
 * Durable follow-up: move the cost fields into manager-only collections so API
 * rules, not name matching, enforce the wall.
 *
 * JSVM: handlers are re-compiled from their own source in pooled runtimes and
 * do not capture this file's scope, so each one is fully self-contained.
 */
onRecordsListRequest((e) => {
  let info = null;
  try {
    info = typeof e.requestInfo === "function" ? e.requestInfo() : e.requestInfo;
  } catch (_) {
    info = null;
  }

  let role = "";
  let authCollectionName = "";
  try {
    const auth = (info && info.auth) || e.auth || null;
    if (auth) {
      try {
        const authCollection =
          typeof auth.collection === "function" ? auth.collection() : auth.collection;
        authCollectionName = authCollection ? String(authCollection.name || "") : "";
      } catch (_) {
        authCollectionName = "";
      }
      role = String(auth.get("role") || "");
    }
  } catch (_) {
    role = "";
  }

  if (authCollectionName === "_superusers") return e.next();
  if (role === "superadmin" || role === "admin" || role === "manager") return e.next();

  // inventory → unitCost, frontEndGross; lender_profiles → reservePct, tiers
  // (any path) and the tier rate-cost keys; saved_deals → vehicleData and
  // calculatedData (its lenderEligibility reasons can quote a flagged rate).
  const PROTECTED = [
    "unitCost",
    "frontEndGross",
    "reservePct",
    "tiers",
    "baseInterestRate",
    "buyRate",
    "rateAdder",
    "reservePercent",
    "markupPoints",
    "dealerReserve",
    "vehicleData",
    "calculatedData",
  ];
  const references = (text) => {
    const raw = String(text).toLowerCase();
    const stripped = raw.replace(/[\s"'`]+/g, "");
    for (let i = 0; i < PROTECTED.length; i++) {
      const token = new RegExp("(^|[^a-z0-9_])" + PROTECTED[i].toLowerCase() + "($|[^a-z0-9_])");
      if (token.test(raw) || token.test(stripped)) return true;
    }
    return false;
  };
  const forbid = () => {
    throw new ForbiddenError(
      "Filtering or sorting by restricted fields is not allowed for your role."
    );
  };

  // PocketBase evaluates only the FIRST `filter` / `sort` value
  // (url.Values.Get) — the same value requestInfo().query carries, so a
  // trailing duplicate is never applied (asserted against the real binary in
  // tests/e2e/field-visibility.spec.ts). requestInfo is the only reader:
  // e.request is not exposed on this event in the JSVM (undefined on 0.39.6).
  // No readable query → fail closed.
  let query = null;
  try {
    query = info ? info.query : null;
  } catch (_) {
    query = null;
  }
  if (!query) forbid();

  let filter = null;
  let sort = null;
  try {
    filter = query.filter;
    sort = query.sort;
  } catch (_) {
    forbid();
  }
  if (filter != null && references(filter)) forbid();
  if (sort != null && references(sort)) forbid();
  return e.next();
});

/**
 * Realtime: a subscription's `?options=` JSON carries `query.filter`, which
 * PocketBase evaluates against stored values before delivering each event —
 * the same oracle as a list filter. Topics are strings such as
 * `inventory/*?options=<url-encoded {"query":{"filter":…},"headers":{…}}>`.
 * Options that cannot be decoded or parsed are rejected for non-privileged
 * requesters. Go matches the `query` key case-insensitively and merges
 * duplicate keys, so the whole decoded topic string (JSON \u escapes resolved)
 * is scanned as well as every key and string in the parsed options.
 */
onRealtimeSubscribeRequest((e) => {
  let info = null;
  try {
    info = typeof e.requestInfo === "function" ? e.requestInfo() : e.requestInfo;
  } catch (_) {
    info = null;
  }

  let role = "";
  let authCollectionName = "";
  try {
    const auth = (info && info.auth) || e.auth || null;
    if (auth) {
      try {
        const authCollection =
          typeof auth.collection === "function" ? auth.collection() : auth.collection;
        authCollectionName = authCollection ? String(authCollection.name || "") : "";
      } catch (_) {
        authCollectionName = "";
      }
      role = String(auth.get("role") || "");
    }
  } catch (_) {
    role = "";
  }

  if (authCollectionName === "_superusers") return e.next();
  if (role === "superadmin" || role === "admin" || role === "manager") return e.next();

  const PROTECTED = [
    "unitCost",
    "frontEndGross",
    "reservePct",
    "tiers",
    "baseInterestRate",
    "buyRate",
    "rateAdder",
    "reservePercent",
    "markupPoints",
    "dealerReserve",
    "vehicleData",
    "calculatedData",
  ];
  const references = (text) => {
    const raw = String(text).toLowerCase();
    const stripped = raw.replace(/[\s"'`]+/g, "");
    for (let i = 0; i < PROTECTED.length; i++) {
      const token = new RegExp("(^|[^a-z0-9_])" + PROTECTED[i].toLowerCase() + "($|[^a-z0-9_])");
      if (token.test(raw) || token.test(stripped)) return true;
    }
    return false;
  };
  const forbid = () => {
    throw new ForbiddenError(
      "Subscribing with a filter on restricted fields is not allowed for your role."
    );
  };
  const scan = (node, depth) => {
    if (depth > 32) return true;
    if (typeof node === "string") return references(node);
    if (node === null || typeof node !== "object") return false;
    const keys = Object.keys(node);
    for (let k = 0; k < keys.length; k++) {
      if (references(keys[k]) || scan(node[keys[k]], depth + 1)) return true;
    }
    return false;
  };

  // null / [] is "unsubscribe from everything"; an unreadable list is refused.
  let subs;
  try {
    subs = e.subscriptions;
  } catch (_) {
    forbid();
  }
  if (subs === null) return e.next();
  if (subs === undefined) forbid();
  const count = Number(subs.length);
  if (!(count >= 0)) forbid();

  for (let i = 0; i < count; i++) {
    const sub = String(subs[i]);
    const q = sub.indexOf("?");
    if (q < 0) continue; // bare topic ("inventory/*", "inventory/<id>"): no filter

    try {
      const decoded = decodeURIComponent(sub.replace(/\+/g, " ")).replace(
        /\\u([0-9a-fA-F]{4})/g,
        (_, hex) => String.fromCharCode(parseInt(hex, 16))
      );
      if (references(decoded)) forbid();

      const pairs = sub.slice(q + 1).split("&");
      for (let p = 0; p < pairs.length; p++) {
        if (!pairs[p]) continue;
        const eq = pairs[p].indexOf("=");
        const key = decodeURIComponent(
          (eq < 0 ? pairs[p] : pairs[p].slice(0, eq)).replace(/\+/g, " ")
        );
        if (key.toLowerCase() !== "options") continue;
        const options = JSON.parse(
          decodeURIComponent((eq < 0 ? "" : pairs[p].slice(eq + 1)).replace(/\+/g, " "))
        );
        if (!options || typeof options !== "object" || Array.isArray(options)) forbid();
        if (scan(options, 0)) forbid();
      }
    } catch (_) {
      forbid(); // undecodable / unparseable options, or a protected reference: fail closed
    }
  }
  return e.next();
});
