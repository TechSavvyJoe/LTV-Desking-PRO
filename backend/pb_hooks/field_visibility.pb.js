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
