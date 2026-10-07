/// <reference path="../pb_data/types.d.ts" />

/** Manager confirmation is enforced on writes as well as read visibility.
 * This callback is self-contained: PocketBase recompiles it in pooled JSVMs.
 */
const protectManagerProfit = (e) => {
  const auth = e.auth;
  const collection = auth && typeof auth.collection === "function" ? auth.collection() : null;
  const role = auth && typeof auth.get === "function" ? String(auth.get("role") || "") : "";
  if ((collection && collection.name === "_superusers") || ["manager", "admin", "superadmin"].indexOf(role) !== -1) return e.next();

  const info = e.requestInfo();
  const body = info.body || {};
  const touched = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const read = (record, key) => JSON.parse(record.getString(key) || "null");
  const original = e.record.original();

  if (touched("dealData")) {
    const data = read(e.record, "dealData");
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new BadRequestError("Deal data must be an object.");
    if (data && typeof data === "object" && !Array.isArray(data)) {
      if (Object.prototype.hasOwnProperty.call(data, "profitInputs")) {
        throw new ForbiddenError("Only managers and administrators can confirm profit inputs.");
      }
      // A salesperson's filtered round-trip must not erase a manager's costs.
      const previous = original ? read(original, "dealData") : null;
      if (previous && previous.profitInputs) data.profitInputs = previous.profitInputs;
      e.record.set("dealData", data);
    }
  }

  // Sales cannot manufacture a snapshot asserting that private gross checks passed.
  // Financial edits invalidate a previous snapshot; the desk recalculates it when opened.
  const invalidates = touched("vehicleData") || touched("dealData") || touched("customerFilters") || touched("calculatedData");
  if (invalidates) {
    const vehicle = read(e.record, "vehicleData");
    if (vehicle && typeof vehicle === "object" && !Array.isArray(vehicle)) {
      delete vehicle.assessment;
      delete vehicle.readinessScore;
      e.record.set("vehicleData", vehicle);
    }
  }
  if (invalidates) {
    const calc = read(e.record, "calculatedData");
    if (calc && typeof calc === "object" && !Array.isArray(calc)) {
      delete calc.assessment;
      delete calc.readinessScore;
      e.record.set("calculatedData", calc);
    }
  }
  return e.next();
};
onRecordCreateRequest(protectManagerProfit, "saved_deals");
onRecordUpdateRequest(protectManagerProfit, "saved_deals");
