/// <reference path="../pb_data/types.d.ts" />

/**
 * Server-side field-level visibility. [G37]
 *
 * PocketBase API rules are record-level only — they cannot hide a FIELD from a
 * role. Before this hook, every authenticated user in a dealership (including
 * the default "sales" role) could read `unitCost` on every unit via the API,
 * which also exposes front-end gross. In a real store, salespeople must not
 * see pack/cost/gross — that's a day-one GM requirement.
 *
 * onRecordEnrich runs on every record returned by list/view/realtime and
 * strips `unitCost` from the serialized response unless the requester is an
 * admin, manager, or superadmin. The client renders "N/A" for the missing
 * field and computes no gross — exactly the intended degradation.
 *
 * Platform superusers (`_superusers`, the PocketBase dashboard at /_/) have no
 * `role` field, so every handler below resolves the auth collection the same
 * way dealer_guard.pb.js does and returns early for them. The dashboard form
 * round-trips whatever enrich returns, so a stripped blob loaded there would
 * be written back over the real data on the next save. [review/P2]
 *
 * JSVM: handlers are re-compiled from their own source in pooled runtimes and
 * do not capture this file's scope, so each one is fully self-contained.
 */
onRecordEnrich((e) => {
  let role = "";
  let authCollectionName = "";
  try {
    const auth = (e.requestInfo && e.requestInfo.auth) || null;
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

  if (role !== "superadmin" && role !== "admin" && role !== "manager") {
    e.record.hide("unitCost");
  }

  return e.next();
}, "inventory");

/**
 * saved_deals embeds a full CalculatedVehicle snapshot in the `vehicleData`
 * JSON blob — including `unitCost` and `frontEndGross` — which bypassed the
 * inventory field hide above: a sales login could read cost/gross off any
 * saved deal. Sanitize the blob for non-privileged readers; if the blob can't
 * be parsed, hide it entirely (fail closed — never leak cost). [review/P1]
 *
 * The blob is read as TEXT. In the JSVM, record.get() on a JSON field returns
 * types.JSONRaw — a Go []byte that goja exposes as an Array of byte values, so
 * JSON.stringify() of it yields "[91,123,…]". Parsing that strips nothing and
 * re-emits the whole blob as char codes. Never JSON.stringify a get() result
 * here. [review/P0]
 */
onRecordEnrich((e) => {
  let role = "";
  let authCollectionName = "";
  try {
    const auth = (e.requestInfo && e.requestInfo.auth) || null;
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

  if (role !== "superadmin" && role !== "admin" && role !== "manager") {
    try {
      let text = "";
      if (typeof e.record.getString === "function") {
        text = e.record.getString("vehicleData");
      } else {
        const raw = e.record.get("vehicleData");
        if (typeof raw === "string") text = raw;
        else if (raw && typeof raw.string === "function") text = raw.string();
        else if (raw != null) text = String(raw);
      }
      const data = JSON.parse(text || "{}");
      if (data && typeof data === "object" && !Array.isArray(data)) {
        delete data.unitCost;
        delete data.frontEndGross;
        e.record.set("vehicleData", data);
      } else if (data !== null) {
        // Not a vehicle snapshot (an array — e.g. the JSONRaw byte shape — or a
        // scalar): nothing can be stripped reliably, so fail closed.
        e.record.hide("vehicleData");
      }
    } catch (_) {
      e.record.hide("vehicleData");
    }

    // calculatedData holds no cost fields by design (lenderEligibility, the
    // settings snapshot, payment/LTV/amount-financed/approval metrics), but
    // each lenderEligibility row's `reasons` quotes the tier's rangeFlags —
    // "rateAdder=25 outside -10-10" when a manager's session saved it. Reduce
    // rate-cost `key=value` pairs to the key, and drop cost/rate keys at any
    // depth (legacy snapshots). Malformed → hide, like vehicleData. [ship-gate P1]
    try {
      let text = "";
      if (typeof e.record.getString === "function") {
        text = e.record.getString("calculatedData");
      } else {
        const raw = e.record.get("calculatedData");
        if (typeof raw === "string") text = raw;
        else if (raw && typeof raw.string === "function") text = raw.string();
        else if (raw != null) text = String(raw);
      }
      const calc = JSON.parse(text || "null");
      if (calc && typeof calc === "object" && !Array.isArray(calc)) {
        var costKeys = [
          "unitCost",
          "frontEndGross",
          "effectiveRate",
          "baseInterestRate",
          "buyRate",
          "rateAdder",
          "reservePct",
          "reservePercent",
          "markupPoints",
          "dealerReserve",
        ];
        var rateValue =
          /(baseInterestRate|buyRate|rateAdder|reservePct|reservePercent|markupPoints|dealerReserve)\s*[=:]\s*[^\s;,)]*/gi;
        var scrub = function (node, depth) {
          if (depth > 32) throw new Error("calculatedData nested too deeply");
          if (typeof node === "string") return node.replace(rateValue, "$1");
          if (node === null || typeof node !== "object") return node;
          if (Array.isArray(node)) {
            for (var a = 0; a < node.length; a++) node[a] = scrub(node[a], depth + 1);
            return node;
          }
          for (var c = 0; c < costKeys.length; c++) delete node[costKeys[c]];
          var keys = Object.keys(node);
          for (var k = 0; k < keys.length; k++) node[keys[k]] = scrub(node[keys[k]], depth + 1);
          return node;
        };
        e.record.set("calculatedData", scrub(calc, 0));
      } else if (calc !== null) {
        e.record.hide("calculatedData");
      }
    } catch (_) {
      e.record.hide("calculatedData");
    }
  }

  return e.next();
}, "saved_deals");

/**
 * lender_profiles carries F&I profit data a salesperson must never see: the
 * dealer reserve/participation % on the profile and each tier's buy rate
 * (`baseInterestRate`) and rate adder. Sell rate minus buy rate IS the reserve,
 * so exposing the buy rate to `sales` leaks the store's F&I markup — the same
 * wall a GM expects around cost/gross. Eligibility rules (FICO, LTV, term,
 * mileage, backend caps) stay visible so the desk's lender-fit still works for
 * sales; only the rate-cost fields are stripped. Malformed tiers → hide the
 * whole blob (fail closed, never leak a buy rate). [takeover-P1 #7]
 *
 * `tiers` is read as TEXT for the same JSONRaw reason as saved_deals above;
 * reading it with get() + JSON.stringify leaked every buy rate as char codes
 * and broke lender-fit for sales. [review/P0]
 */
onRecordEnrich((e) => {
  let role = "";
  let authCollectionName = "";
  try {
    const auth = (e.requestInfo && e.requestInfo.auth) || null;
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

  if (role !== "superadmin" && role !== "admin" && role !== "manager") {
    e.record.hide("reservePct");

    var rateCostFields = [
      "baseInterestRate",
      "buyRate",
      "rateAdder",
      "reservePct",
      "reservePercent",
      "markupPoints",
      "dealerReserve",
    ];

    try {
      let text = "";
      if (typeof e.record.getString === "function") {
        text = e.record.getString("tiers");
      } else {
        const raw = e.record.get("tiers");
        if (typeof raw === "string") text = raw;
        else if (raw && typeof raw.string === "function") text = raw.string();
        else if (raw != null) text = String(raw);
      }
      const tiers = JSON.parse(text || "[]");
      // Every tier must be a plain object. Anything else (a number — e.g. the
      // JSONRaw byte shape — a string, a nested array) can't be stripped
      // reliably, so the whole blob is malformed and hidden.
      var wellFormed = Array.isArray(tiers);
      for (var i = 0; wellFormed && i < tiers.length; i++) {
        var tier = tiers[i];
        if (!tier || typeof tier !== "object" || Array.isArray(tier)) {
          wellFormed = false;
        } else {
          for (var j = 0; j < rateCostFields.length; j++) {
            delete tier[rateCostFields[j]];
          }
          // The AI range guard records what it dropped as "key=value outside
          // lo-hi"; for a rate-cost key that value IS a (misread) buy rate or
          // adder, and it reaches sales screens and the customer PDF through
          // the review reason. Reduce any flag naming a rate-cost field to the
          // bare field name; eligibility flags (maxLtv, minFico, …) are values
          // sales already sees. A non-empty list still holds the tier as
          // pending, so needsReview is pinned on. Non-string entries and a
          // non-array value are dropped (can't vouch for them). [ship-gate P1]
          if (Object.prototype.hasOwnProperty.call(tier, "rangeFlags")) {
            var flags = tier.rangeFlags;
            if (Array.isArray(flags)) {
              var safeFlags = [];
              for (var f = 0; f < flags.length; f++) {
                if (typeof flags[f] !== "string") continue;
                var rateKey = "";
                for (var r = 0; r < rateCostFields.length && !rateKey; r++) {
                  var named = new RegExp(
                    "(^|[^A-Za-z0-9_])" + rateCostFields[r] + "($|[^A-Za-z0-9_])",
                    "i"
                  );
                  if (named.test(flags[f])) rateKey = rateCostFields[r];
                }
                safeFlags.push(rateKey || flags[f]);
              }
              tier.rangeFlags = safeFlags;
              if (flags.length > 0) tier.needsReview = true;
            } else {
              delete tier.rangeFlags;
            }
          }
        }
      }
      if (wellFormed) {
        e.record.set("tiers", tiers);
      } else {
        e.record.hide("tiers");
      }
    } catch (_) {
      e.record.hide("tiers");
    }
  }

  return e.next();
}, "lender_profiles");
