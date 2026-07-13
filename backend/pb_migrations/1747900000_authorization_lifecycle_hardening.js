/// <reference path="../pb_data/types.d.ts" />

/**
 * Final authorization/lifecycle assertion.
 *
 * Earlier rule migrations intentionally returned on an empty database because
 * their same-process schema cache could not resolve newly added auth fields.
 * PocketBase still recorded those migrations as applied, leaving a fresh
 * environment permanently locked or under-scoped unless an operator edited
 * `_migrations`. This migration has no data-dependent skip. The matching
 * bootstrap hook retries the exact same rules after the schema is fully loaded.
 */

const USER_IDENTITY =
  '(@request.auth.collectionName = "users" && @request.auth.id != "" && @request.auth.active = true)';
const APP_SUPER = `(${USER_IDENTITY} && @request.auth.role = "superadmin")`;
const APP_ACTIVE =
  `(${USER_IDENTITY} && (` +
  '@request.auth.role = "superadmin" || @request.auth.dealer.active = true))';
const SERVICE_AI =
  '(@request.auth.collectionName = "api_service_accounts" && @request.auth.id != "" && ' +
  '@request.auth.active = true && @request.auth.scope = "ai_proxy")';

const SAME_DEALER =
  `${APP_ACTIVE} && (@request.auth.role = "superadmin" || dealer = @request.auth.dealer)`;
const SAME_DEALER_CREATE =
  `${APP_ACTIVE} && (@request.auth.role = "superadmin" || @request.body.dealer = @request.auth.dealer)`;
const SAME_DEALER_ADMIN =
  `${APP_ACTIVE} && (` +
  '@request.auth.role = "superadmin" || (@request.auth.role = "admin" && dealer = @request.auth.dealer))';
const SAME_DEALER_ADMIN_CREATE =
  `${APP_ACTIVE} && (` +
  '@request.auth.role = "superadmin" || (@request.auth.role = "admin" && @request.body.dealer = @request.auth.dealer))';
const ON_OWN_DEALER =
  `${APP_ACTIVE} && (@request.auth.role = "superadmin" || id = @request.auth.dealer)`;
const ON_OWN_DEALER_ADMIN_UPDATE =
  `${APP_ACTIVE} && (` +
  '@request.auth.role = "superadmin" || (@request.auth.role = "admin" && id = @request.auth.dealer))';
const USERS_READ =
  `${APP_ACTIVE} && (` +
  '@request.auth.role = "superadmin" || dealer = @request.auth.dealer || id = @request.auth.id)';
const USERS_UPDATE =
  `${APP_ACTIVE} && (` +
  '@request.auth.role = "superadmin" || id = @request.auth.id || ' +
  '(@request.auth.role = "admin" && dealer = @request.auth.dealer))';
const USERS_DELETE =
  `${APP_ACTIVE} && (` +
  '@request.auth.role = "superadmin" || (@request.auth.role = "admin" && dealer = @request.auth.dealer))';
const DEAL_EVENTS_READ =
  `${APP_ACTIVE} && (` +
  '@request.auth.role = "superadmin" || (@request.auth.role = "admin" && dealer = @request.auth.dealer))';
const AUDIT_SERVICE_CREATE = `(${SERVICE_AI} && @request.body.actor != "")`;
const STRONG_PASSWORD_PATTERN =
  '^(?:.*[a-z].*[A-Z].*[0-9].*|.*[a-z].*[0-9].*[A-Z].*|' +
  '.*[A-Z].*[a-z].*[0-9].*|.*[A-Z].*[0-9].*[a-z].*|' +
  '.*[0-9].*[a-z].*[A-Z].*|.*[0-9].*[A-Z].*[a-z].*)$';

const applyRules = (app, name, rules) => {
  const collection = app.findCollectionByNameOrId(name);
  for (const [key, value] of Object.entries(rules)) collection[key] = value;
  app.save(collection);
};

const hardenPasswordField = (collection) => {
  const password = collection.fields.getByName("password");
  if (!password) throw new Error(collection.name + ".password field is missing");
  password.min = 12;
  password.pattern = STRONG_PASSWORD_PATTERN;
};

migrate(
  (app) => {
    let dealers = app.findCollectionByNameOrId("dealers");
    let dealerActiveAdded = false;
    if (!dealers.fields.getByName("active")) {
      dealers.fields.add(new BoolField({ name: "active", required: false }));
      app.save(dealers);
      dealerActiveAdded = true;
    }
    if (dealerActiveAdded) {
      for (const dealer of app.findRecordsByFilter("dealers", "", "", 0, 0)) {
        dealer.set("active", true);
        app.save(dealer);
      }
    }

    let users = app.findCollectionByNameOrId("users");
    let userActiveAdded = false;
    if (!users.fields.getByName("active")) {
      users.fields.add(new BoolField({ name: "active", required: false }));
      app.save(users);
      userActiveAdded = true;
      users = app.findCollectionByNameOrId("users");
    }
    hardenPasswordField(users);
    users.authRule = 'active = true && (role = "superadmin" || dealer.active = true)';
    app.save(users);
    if (userActiveAdded) {
      for (const user of app.findRecordsByFilter("users", "", "", 0, 0)) {
        user.set("active", true);
        app.save(user);
      }
    }

    let lenderProfiles = app.findCollectionByNameOrId("lender_profiles");
    if (!lenderProfiles.fields.getByName("isSample")) {
      lenderProfiles.fields.add(new BoolField({ name: "isSample", required: false }));
      app.save(lenderProfiles);
      lenderProfiles = app.findCollectionByNameOrId("lender_profiles");
    }
    if (!lenderProfiles.fields.getByName("generalNotes")) {
      lenderProfiles.fields.add(
        new TextField({ name: "generalNotes", required: false, max: 4000 })
      );
      app.save(lenderProfiles);
    }

    const legacySampleWarning =
      "Default sample program. Verify current lender terms and rate sheets before quoting.";
    const sampleWarning =
      "Sample program only. Terms are illustrative and must be verified against the lender's current rate sheet before quoting.";
    let markedSamples = 0;
    for (const lender of app.findRecordsByFilter(
      "lender_profiles",
      "notes = {:warning}",
      "",
      0,
      0,
      { warning: legacySampleWarning }
    )) {
      lender.set("isSample", true);
      lender.set("generalNotes", sampleWarning);
      lender.set("notes", "");
      app.save(lender);
      markedSamples++;
    }
    if (markedSamples > 0) {
      console.log("[ok] marked " + markedSamples + " existing lender sample record(s)");
    }

    let serviceAccounts;
    try {
      serviceAccounts = app.findCollectionByNameOrId("api_service_accounts");
    } catch (error) {
      serviceAccounts = new Collection({
        type: "auth",
        name: "api_service_accounts",
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        authRule: null,
        manageRule: null,
        passwordAuth: { enabled: true, identityFields: ["email"] },
        oauth2: { enabled: false },
        otp: { enabled: false },
        mfa: { enabled: false },
      });
      app.save(serviceAccounts);
      serviceAccounts = app.findCollectionByNameOrId("api_service_accounts");
    }

    let serviceFieldsChanged = false;
    if (!serviceAccounts.fields.getByName("active")) {
      serviceAccounts.fields.add(new BoolField({ name: "active", required: false }));
      serviceFieldsChanged = true;
    }
    if (!serviceAccounts.fields.getByName("scope")) {
      serviceAccounts.fields.add(
        new TextField({ name: "scope", required: true, min: 1, max: 64 })
      );
      serviceFieldsChanged = true;
    }
    hardenPasswordField(serviceAccounts);
    serviceAccounts.listRule = null;
    serviceAccounts.viewRule = null;
    serviceAccounts.createRule = null;
    serviceAccounts.updateRule = null;
    serviceAccounts.deleteRule = null;
    serviceAccounts.manageRule = null;
    serviceAccounts.authRule = 'active = true && scope = "ai_proxy"';
    serviceAccounts.passwordAuth.enabled = true;
    serviceAccounts.passwordAuth.identityFields = ["email"];
    if (serviceFieldsChanged) console.log("[ok] api_service_accounts fields added");
    app.save(serviceAccounts);

    applyRules(app, "dealers", {
      listRule: ON_OWN_DEALER,
      viewRule: ON_OWN_DEALER,
      createRule: APP_SUPER,
      updateRule: ON_OWN_DEALER_ADMIN_UPDATE,
      deleteRule: APP_SUPER,
    });
    applyRules(app, "inventory", {
      listRule: SAME_DEALER,
      viewRule: SAME_DEALER,
      createRule: SAME_DEALER_ADMIN_CREATE,
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
      createRule: `(${APP_SUPER} || (${APP_ACTIVE} && @request.auth.role = "admin"))`,
      updateRule: USERS_UPDATE,
      deleteRule: USERS_DELETE,
    });
    applyRules(app, "system_settings", {
      createRule: APP_SUPER,
      updateRule: APP_SUPER,
      deleteRule: APP_SUPER,
    });
    applyRules(app, "ai_provider_keys", {
      listRule: SERVICE_AI,
      viewRule: SERVICE_AI,
      createRule: SERVICE_AI,
      updateRule: SERVICE_AI,
      deleteRule: SERVICE_AI,
    });
    applyRules(app, "audit_log", {
      listRule: APP_SUPER,
      viewRule: APP_SUPER,
      createRule: AUDIT_SERVICE_CREATE,
      updateRule: null,
      deleteRule: null,
    });

    console.log("[ok] authorization/lifecycle hardening applied without data-dependent skips");
  },
  () => {
    // Forward-only security migration. Relaxing rules or removing service
    // identities automatically during rollback would be unsafe.
  }
);
