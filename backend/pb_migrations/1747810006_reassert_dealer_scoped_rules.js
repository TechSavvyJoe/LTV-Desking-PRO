/// <reference path="../pb_data/types.d.ts" />

/**
 * Reassert dealer-scoped RBAC with PB v0.26-compatible relation syntax. [ci/prod]
 *
 * The older rules used `@request.auth.dealer.id ?= dealer.id`, which can fail
 * the rule parser on fresh databases and left CI E2E running against
 * superuser-only collections. Existing Fly databases have already recorded the
 * earlier migrations, so this forward migration also repairs production.
 */

const AUTHED = '@request.auth.id != ""';
const SUPER = '@request.auth.role = "superadmin"';
const ADMIN_OR_SUPER = '(@request.auth.role = "superadmin" || @request.auth.role = "admin")';

const SAME_DEALER = `${AUTHED} && (${SUPER} || dealer = @request.auth.dealer)`;
const SAME_DEALER_CREATE = `${AUTHED} && (${SUPER} || @request.body.dealer = @request.auth.dealer)`;
const SAME_DEALER_ADMIN = `${AUTHED} && (${SUPER} || (${ADMIN_OR_SUPER} && dealer = @request.auth.dealer))`;
const SAME_DEALER_ADMIN_CREATE = `${AUTHED} && (${SUPER} || (${ADMIN_OR_SUPER} && @request.body.dealer = @request.auth.dealer))`;
const ON_OWN_DEALER = `${AUTHED} && (${SUPER} || id = @request.auth.dealer)`;
const ON_OWN_DEALER_ADMIN_UPDATE = `${AUTHED} && (${SUPER} || (@request.auth.role = "admin" && id = @request.auth.dealer))`;
const DEAL_EVENTS_READ = `${AUTHED} && (${SUPER} || (${ADMIN_OR_SUPER} && dealer = @request.auth.dealer))`;
const USERS_READ = `${AUTHED} && (${SUPER} || dealer = @request.auth.dealer || id = @request.auth.id)`;

const applyRules = (app, name, rules) => {
  let c;
  try {
    c = app.findCollectionByNameOrId(name);
  } catch (err) {
    console.log(`[skip] ${name} collection not found`);
    return;
  }

  for (const [key, value] of Object.entries(rules)) c[key] = value;
  app.save(c);
  console.log(`[ok] ${name} dealer-scoped rules reasserted`);
};

const ensureFields = (app, collectionName, makeFields) => {
  let collection;
  try {
    collection = app.findCollectionByNameOrId(collectionName);
  } catch (err) {
    console.log(`[skip] ${collectionName} collection not found`);
    return;
  }

  let changed = false;
  const fields = makeFields();
  for (const f of fields) {
    if (!collection.fields.getByName(f.name)) {
      collection.fields.add(f.field);
      changed = true;
      console.log(`[repair] ${collectionName}.${f.name} added`);
    }
  }

  if (changed) app.save(collection);
};

migrate(
  (app) => {
    let dealersId = null;
    let usersId = null;
    let inventoryId = null;
    try {
      dealersId = app.findCollectionByNameOrId("dealers").id;
      usersId = app.findCollectionByNameOrId("users").id;
      inventoryId = app.findCollectionByNameOrId("inventory").id;
    } catch (err) {
      console.log("[skip] prerequisite collection missing during baseline field repair");
    }

    ensureFields(app, "dealers", () => [
      { name: "name", field: new TextField({ name: "name", required: false, max: 200 }) },
      { name: "code", field: new TextField({ name: "code", required: false, max: 20 }) },
      { name: "address", field: new TextField({ name: "address", required: false, max: 200 }) },
      { name: "city", field: new TextField({ name: "city", required: false, max: 100 }) },
      { name: "state", field: new TextField({ name: "state", required: false, max: 100 }) },
      { name: "phone", field: new TextField({ name: "phone", required: false, max: 30 }) },
      { name: "email", field: new EmailField({ name: "email", required: false }) },
      { name: "logo", field: new FileField({ name: "logo", required: false, maxSelect: 1, maxSize: 5242880 }) },
      { name: "active", field: new BoolField({ name: "active", required: false }) },
      { name: "settings", field: new JSONField({ name: "settings", required: false, maxSize: 1000000 }) },
      { name: "created", field: new AutodateField({ name: "created", onCreate: true }) },
      { name: "updated", field: new AutodateField({ name: "updated", onCreate: true, onUpdate: true }) },
    ]);

    if (dealersId) {
      ensureFields(app, "inventory", () => [
        {
          name: "dealer",
          field: new RelationField({
            name: "dealer",
            required: false,
            collectionId: dealersId,
            maxSelect: 1,
            cascadeDelete: true,
          }),
        },
        { name: "vin", field: new TextField({ name: "vin", required: false, max: 25 }) },
        { name: "stockNumber", field: new TextField({ name: "stockNumber", required: false, max: 50 }) },
        { name: "year", field: new NumberField({ name: "year", required: false, min: 1900, max: 2100, onlyInt: true }) },
        { name: "make", field: new TextField({ name: "make", required: false, max: 100 }) },
        { name: "model", field: new TextField({ name: "model", required: false, max: 100 }) },
        { name: "trim", field: new TextField({ name: "trim", required: false, max: 100 }) },
        { name: "mileage", field: new NumberField({ name: "mileage", required: false, min: 0, onlyInt: true }) },
        { name: "price", field: new NumberField({ name: "price", required: false, min: 0 }) },
        { name: "unitCost", field: new NumberField({ name: "unitCost", required: false, min: 0 }) },
        { name: "jdPower", field: new NumberField({ name: "jdPower", required: false, min: 0 }) },
        { name: "jdPowerRetail", field: new NumberField({ name: "jdPowerRetail", required: false, min: 0 }) },
        {
          name: "status",
          field: new SelectField({
            name: "status",
            required: false,
            values: ["available", "pending", "sold", "hold"],
            maxSelect: 1,
          }),
        },
        { name: "images", field: new FileField({ name: "images", required: false, maxSelect: 10, maxSize: 5242880 }) },
        { name: "notes", field: new TextField({ name: "notes", required: false, max: 5000 }) },
        { name: "created", field: new AutodateField({ name: "created", onCreate: true }) },
        { name: "updated", field: new AutodateField({ name: "updated", onCreate: true, onUpdate: true }) },
      ]);

      ensureFields(app, "lender_profiles", () => [
        {
          name: "dealer",
          field: new RelationField({
            name: "dealer",
            required: false,
            collectionId: dealersId,
            maxSelect: 1,
            cascadeDelete: true,
          }),
        },
        { name: "name", field: new TextField({ name: "name", required: false, max: 200 }) },
        { name: "active", field: new BoolField({ name: "active", required: false }) },
        { name: "tiers", field: new JSONField({ name: "tiers", required: false, maxSize: 5000000 }) },
        {
          name: "bookValueSource",
          field: new SelectField({
            name: "bookValueSource",
            required: false,
            values: ["Trade", "Retail"],
            maxSelect: 1,
          }),
        },
        { name: "minIncome", field: new NumberField({ name: "minIncome", required: false, min: 0 }) },
        { name: "maxPti", field: new NumberField({ name: "maxPti", required: false, min: 0 }) },
        {
          name: "minAmountFinanced",
          field: new NumberField({ name: "minAmountFinanced", required: false, min: 0 }),
        },
        {
          name: "maxAmountFinanced",
          field: new NumberField({ name: "maxAmountFinanced", required: false, min: 0 }),
        },
        { name: "notes", field: new TextField({ name: "notes", required: false, max: 5000 }) },
        { name: "contactName", field: new TextField({ name: "contactName", required: false, max: 200 }) },
        { name: "contactPhone", field: new TextField({ name: "contactPhone", required: false, max: 30 }) },
        { name: "contactEmail", field: new EmailField({ name: "contactEmail", required: false }) },
        { name: "created", field: new AutodateField({ name: "created", onCreate: true }) },
        { name: "updated", field: new AutodateField({ name: "updated", onCreate: true, onUpdate: true }) },
      ]);

      ensureFields(app, "dealer_settings", () => [
        {
          name: "dealer",
          field: new RelationField({
            name: "dealer",
            required: false,
            collectionId: dealersId,
            maxSelect: 1,
            cascadeDelete: true,
          }),
        },
        { name: "defaultTerm", field: new NumberField({ name: "defaultTerm", required: false, min: 0, onlyInt: true }) },
        { name: "defaultApr", field: new NumberField({ name: "defaultApr", required: false, min: 0 }) },
        { name: "defaultState", field: new TextField({ name: "defaultState", required: false, max: 50 }) },
        { name: "docFee", field: new NumberField({ name: "docFee", required: false, min: 0 }) },
        { name: "cvrFee", field: new NumberField({ name: "cvrFee", required: false, min: 0 }) },
        { name: "defaultStateFees", field: new NumberField({ name: "defaultStateFees", required: false, min: 0 }) },
        { name: "outOfStateTransitFee", field: new NumberField({ name: "outOfStateTransitFee", required: false, min: 0 }) },
        { name: "customTaxRate", field: new NumberField({ name: "customTaxRate", required: false, min: 0 }) },
        { name: "ltvThresholds", field: new JSONField({ name: "ltvThresholds", required: false, maxSize: 1000000 }) },
        { name: "created", field: new AutodateField({ name: "created", onCreate: true }) },
        { name: "updated", field: new AutodateField({ name: "updated", onCreate: true, onUpdate: true }) },
      ]);
    }

    if (dealersId && usersId && inventoryId) {
      ensureFields(app, "saved_deals", () => [
        {
          name: "dealer",
          field: new RelationField({
            name: "dealer",
            required: false,
            collectionId: dealersId,
            maxSelect: 1,
            cascadeDelete: true,
          }),
        },
        {
          name: "user",
          field: new RelationField({
            name: "user",
            required: false,
            collectionId: usersId,
            maxSelect: 1,
            cascadeDelete: false,
          }),
        },
        {
          name: "vehicle",
          field: new RelationField({
            name: "vehicle",
            required: false,
            collectionId: inventoryId,
            maxSelect: 1,
            cascadeDelete: false,
          }),
        },
        { name: "name", field: new TextField({ name: "name", required: false, max: 200 }) },
        { name: "customerName", field: new TextField({ name: "customerName", required: false, max: 200 }) },
        { name: "salespersonName", field: new TextField({ name: "salespersonName", required: false, max: 200 }) },
        { name: "vehicleData", field: new JSONField({ name: "vehicleData", required: false, maxSize: 2000000 }) },
        { name: "dealData", field: new JSONField({ name: "dealData", required: false, maxSize: 2000000 }) },
        { name: "customerFilters", field: new JSONField({ name: "customerFilters", required: false, maxSize: 1000000 }) },
        { name: "calculatedData", field: new JSONField({ name: "calculatedData", required: false, maxSize: 2000000 }) },
        {
          name: "status",
          field: new SelectField({
            name: "status",
            required: false,
            values: ["draft", "pending", "submitted", "approved", "funded", "cancelled", "declined"],
            maxSelect: 1,
          }),
        },
        { name: "notes", field: new TextField({ name: "notes", required: false, max: 10000 }) },
        { name: "created", field: new AutodateField({ name: "created", onCreate: true }) },
        { name: "updated", field: new AutodateField({ name: "updated", onCreate: true, onUpdate: true }) },
      ]);
    }

    let hasDealers = false;
    try {
      const records = app.findRecordsByFilter("dealers", "", "", 1, 0);
      hasDealers = records && records.length > 0;
    } catch (err) {
      hasDealers = false;
    }
    if (!hasDealers) {
      console.log("[skip] reassert_dealer_scoped_rules: no dealer records yet; re-run after seed.");
      return;
    }

    applyRules(app, "dealers", {
      listRule: ON_OWN_DEALER,
      viewRule: ON_OWN_DEALER,
      createRule: SUPER,
      updateRule: ON_OWN_DEALER_ADMIN_UPDATE,
      deleteRule: SUPER,
    });

    applyRules(app, "inventory", {
      listRule: SAME_DEALER,
      viewRule: SAME_DEALER,
      createRule: SAME_DEALER_CREATE,
      updateRule: SAME_DEALER_ADMIN,
      deleteRule: SAME_DEALER_ADMIN,
    });

    applyRules(app, "lender_profiles", {
      listRule: SAME_DEALER,
      viewRule: SAME_DEALER,
      createRule: SAME_DEALER_ADMIN_CREATE,
      updateRule: SAME_DEALER_ADMIN,
      deleteRule: SAME_DEALER_ADMIN,
    });

    applyRules(app, "saved_deals", {
      listRule: SAME_DEALER,
      viewRule: SAME_DEALER,
      createRule: SAME_DEALER_CREATE,
      updateRule: SAME_DEALER,
      deleteRule: SAME_DEALER_ADMIN,
    });

    applyRules(app, "dealer_settings", {
      listRule: SAME_DEALER,
      viewRule: SAME_DEALER,
      createRule: SAME_DEALER_ADMIN_CREATE,
      updateRule: SAME_DEALER_ADMIN,
      deleteRule: SAME_DEALER_ADMIN,
    });

    applyRules(app, "deal_events", {
      listRule: DEAL_EVENTS_READ,
      viewRule: DEAL_EVENTS_READ,
      createRule: SAME_DEALER_CREATE,
      updateRule: null,
      deleteRule: null,
    });

    applyRules(app, "users", {
      listRule: USERS_READ,
      viewRule: USERS_READ,
      createRule: `${AUTHED} && ${ADMIN_OR_SUPER}`,
      updateRule: `${AUTHED} && (${SUPER} || id = @request.auth.id || (@request.auth.role = "admin" && dealer = @request.auth.dealer))`,
      deleteRule: `${AUTHED} && (${SUPER} || (@request.auth.role = "admin" && dealer = @request.auth.dealer))`,
    });
  },
  (app) => {
    for (const name of [
      "dealers",
      "inventory",
      "lender_profiles",
      "saved_deals",
      "dealer_settings",
      "deal_events",
      "users",
    ]) {
      try {
        const c = app.findCollectionByNameOrId(name);
        c.listRule = null;
        c.viewRule = null;
        c.createRule = null;
        c.updateRule = null;
        c.deleteRule = null;
        app.save(c);
      } catch {
        // Ignore missing collections on rollback.
      }
    }
  }
);
