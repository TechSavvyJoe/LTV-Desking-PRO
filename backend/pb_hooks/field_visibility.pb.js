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
 */
onRecordEnrich((e) => {
  let role = "";
  try {
    const auth = (e.requestInfo && e.requestInfo.auth) || null;
    role = auth ? String(auth.get("role") || "") : "";
  } catch (_) {
    role = "";
  }

  if (role !== "superadmin" && role !== "admin" && role !== "manager") {
    e.record.hide("unitCost");
  }

  return e.next();
}, "inventory");
