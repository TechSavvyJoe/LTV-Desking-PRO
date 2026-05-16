/// <reference path="../pb_data/types.d.ts" />

/**
 * Backfill emailVisibility=true on every existing user record.
 *
 * PocketBase auth collections default emailVisibility to false on creation,
 * which strips the `email` field from API responses to anyone except the
 * record's own user or a PB backend superuser. Our app's role="superadmin"
 * users are still regular auth users from PB's perspective, so they
 * couldn't see other users' emails in the Owner Console — making it look
 * like emails were never saved.
 *
 * This migration is idempotent: users already flagged true are left alone,
 * and fresh deploys (no users yet) noop. The fix at the create/update
 * call sites (lib/api.ts) ensures all newly created/updated users have
 * the flag set going forward.
 */
migrate(
  (app) => {
    let users;
    try {
      users = app.findRecordsByFilter("users", "", "", 0, 0);
    } catch (e) {
      console.log("[skip] users collection not found");
      return;
    }

    if (!users || users.length === 0) {
      console.log("[skip] no user records to backfill");
      return;
    }

    let updated = 0;
    for (const u of users) {
      if (u.getBool("emailVisibility") === true) continue;
      u.set("emailVisibility", true);
      app.save(u);
      updated++;
    }
    console.log(`[ok] backfilled emailVisibility on ${updated}/${users.length} users`);
  },
  (app) => {
    // Down: not safe to flip emailVisibility back to false globally because we
    // can't tell which users had it explicitly true before this migration.
    // Leave records as-is on rollback.
  }
);
