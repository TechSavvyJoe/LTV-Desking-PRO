/// <reference path="../pb_data/types.d.ts" />

/**
 * Reassert the complete authorization contract after migrations have loaded.
 *
 * This deliberately duplicates the forward migration's literal rules. A
 * migration may be recorded as applied even when an earlier data-dependent
 * guard returned on an empty database; a bootstrap assertion is repeatable and
 * self-heals both that state and later rule drift. The cron covers same-boot
 * schema-cache races without requiring a restart or `_migrations` edits.
 */
onBootstrap((e) => {
  e.next();

  try {
    const app = e.app;
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

    const expected = {
      dealers: {
        listRule: ON_OWN_DEALER,
        viewRule: ON_OWN_DEALER,
        createRule: APP_SUPER,
        updateRule: ON_OWN_DEALER_ADMIN_UPDATE,
        deleteRule: APP_SUPER,
      },
      inventory: {
        listRule: SAME_DEALER,
        viewRule: SAME_DEALER,
        createRule: SAME_DEALER_ADMIN_CREATE,
        updateRule: SAME_DEALER_ADMIN,
        deleteRule: SAME_DEALER_ADMIN,
      },
      lender_profiles: {
        listRule: SAME_DEALER,
        viewRule: SAME_DEALER,
        createRule: SAME_DEALER_ADMIN_CREATE,
        updateRule: SAME_DEALER_ADMIN,
        deleteRule: SAME_DEALER_ADMIN,
      },
      saved_deals: {
        listRule: SAME_DEALER,
        viewRule: SAME_DEALER,
        createRule: SAME_DEALER_CREATE,
        updateRule: SAME_DEALER,
        deleteRule: SAME_DEALER_ADMIN,
      },
      dealer_settings: {
        listRule: SAME_DEALER,
        viewRule: SAME_DEALER,
        createRule: SAME_DEALER_ADMIN_CREATE,
        updateRule: SAME_DEALER_ADMIN,
        deleteRule: SAME_DEALER_ADMIN,
      },
      deal_events: {
        listRule: DEAL_EVENTS_READ,
        viewRule: DEAL_EVENTS_READ,
        createRule: SAME_DEALER_CREATE,
        updateRule: null,
        deleteRule: null,
      },
      users: {
        listRule: USERS_READ,
        viewRule: USERS_READ,
        createRule: `(${APP_SUPER} || (${APP_ACTIVE} && @request.auth.role = "admin"))`,
        updateRule: USERS_UPDATE,
        deleteRule: USERS_DELETE,
        authRule: 'active = true && (role = "superadmin" || dealer.active = true)',
      },
      system_settings: {
        createRule: APP_SUPER,
        updateRule: APP_SUPER,
        deleteRule: APP_SUPER,
      },
      ai_provider_keys: {
        listRule: SERVICE_AI,
        viewRule: SERVICE_AI,
        createRule: SERVICE_AI,
        updateRule: SERVICE_AI,
        deleteRule: SERVICE_AI,
      },
      audit_log: {
        listRule: APP_SUPER,
        viewRule: APP_SUPER,
        createRule: AUDIT_SERVICE_CREATE,
        updateRule: null,
        deleteRule: null,
      },
      api_service_accounts: {
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        manageRule: null,
        authRule: 'active = true && scope = "ai_proxy"',
      },
      ai_rate_limits: {
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
      },
    };

    let changedCollections = 0;
    for (const [name, rules] of Object.entries(expected)) {
      const collection = app.findCollectionByNameOrId(name);
      let changed = false;
      for (const [key, wanted] of Object.entries(rules)) {
        const current = collection[key];
        const matches = wanted === null ? current == null : String(current || "") === wanted;
        if (!matches) {
          collection[key] = wanted;
          changed = true;
        }
      }
      if (changed) {
        app.save(collection);
        changedCollections++;
      }
    }
    if (changedCollections > 0) {
      console.log(
        "[ok] authorization bootstrap repaired " + changedCollections + " collection rule set(s)"
      );
    }
  } catch (error) {
    console.log("[retry] authorization bootstrap assertion failed: " + error);
  }
});

cronAdd("authorization_rules_retry", "* * * * *", () => {
  try {
    const app = $app;
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
    const expected = {
      dealers: {
        listRule: ON_OWN_DEALER,
        viewRule: ON_OWN_DEALER,
        createRule: APP_SUPER,
        updateRule: ON_OWN_DEALER_ADMIN_UPDATE,
        deleteRule: APP_SUPER,
      },
      inventory: {
        listRule: SAME_DEALER,
        viewRule: SAME_DEALER,
        createRule: SAME_DEALER_ADMIN_CREATE,
        updateRule: SAME_DEALER_ADMIN,
        deleteRule: SAME_DEALER_ADMIN,
      },
      lender_profiles: {
        listRule: SAME_DEALER,
        viewRule: SAME_DEALER,
        createRule: SAME_DEALER_ADMIN_CREATE,
        updateRule: SAME_DEALER_ADMIN,
        deleteRule: SAME_DEALER_ADMIN,
      },
      saved_deals: {
        listRule: SAME_DEALER,
        viewRule: SAME_DEALER,
        createRule: SAME_DEALER_CREATE,
        updateRule: SAME_DEALER,
        deleteRule: SAME_DEALER_ADMIN,
      },
      dealer_settings: {
        listRule: SAME_DEALER,
        viewRule: SAME_DEALER,
        createRule: SAME_DEALER_ADMIN_CREATE,
        updateRule: SAME_DEALER_ADMIN,
        deleteRule: SAME_DEALER_ADMIN,
      },
      deal_events: {
        listRule: DEAL_EVENTS_READ,
        viewRule: DEAL_EVENTS_READ,
        createRule: SAME_DEALER_CREATE,
        updateRule: null,
        deleteRule: null,
      },
      users: {
        listRule: USERS_READ,
        viewRule: USERS_READ,
        createRule: `(${APP_SUPER} || (${APP_ACTIVE} && @request.auth.role = "admin"))`,
        updateRule: USERS_UPDATE,
        deleteRule: USERS_DELETE,
        authRule: 'active = true && (role = "superadmin" || dealer.active = true)',
      },
      system_settings: {
        createRule: APP_SUPER,
        updateRule: APP_SUPER,
        deleteRule: APP_SUPER,
      },
      ai_provider_keys: {
        listRule: SERVICE_AI,
        viewRule: SERVICE_AI,
        createRule: SERVICE_AI,
        updateRule: SERVICE_AI,
        deleteRule: SERVICE_AI,
      },
      audit_log: {
        listRule: APP_SUPER,
        viewRule: APP_SUPER,
        createRule: AUDIT_SERVICE_CREATE,
        updateRule: null,
        deleteRule: null,
      },
      api_service_accounts: {
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        manageRule: null,
        authRule: 'active = true && scope = "ai_proxy"',
      },
      ai_rate_limits: {
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
      },
    };

    let changedCollections = 0;
    for (const [name, rules] of Object.entries(expected)) {
      const collection = app.findCollectionByNameOrId(name);
      let changed = false;
      for (const [key, wanted] of Object.entries(rules)) {
        const current = collection[key];
        const matches = wanted === null ? current == null : String(current || "") === wanted;
        if (!matches) {
          collection[key] = wanted;
          changed = true;
        }
      }
      if (changed) {
        app.save(collection);
        changedCollections++;
      }
    }
    if (changedCollections > 0) {
      console.log(
        "[ok] authorization retry repaired " + changedCollections + " collection rule set(s)"
      );
    }
  } catch (error) {
    console.log("[retry] authorization rule assertion failed: " + error);
  }
});
