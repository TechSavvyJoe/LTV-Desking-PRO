/// <reference path="../pb_data/types.d.ts" />

/**
 * Durable cross-instance AI quota check.
 *
 * The original app-user bearer token is required. User/dealer identity, limits,
 * window size, and bucket keys are all server-derived; the body may only select
 * a known AI route. User and dealer upserts run in one transaction and each SQL
 * statement increments atomically, so concurrent Vercel instances cannot lose
 * updates through a read-modify-write race.
 */
routerAdd(
  "POST",
  "/api/ltv/ai-rate-limit",
  (e) => {
    // NOTE: these limit/window constants are mirrored in the Vercel proxy's
    // in-memory limiter (api/_lib/ai/rateLimit.ts). Keep both in sync.
    const USER_LIMIT = 20;
    const DEALER_LIMIT = 80;
    const WINDOW_MS = 60 * 1000;
    const ALLOWED_ROUTES = {
      "provider-keys": true,
      "test-key": true,
      "lender-extract": true,
      "lender-enrich": true,
      "deal-analysis": true,
    };

    const auth = e.auth;
    if (!auth || auth.collection().name !== "users") {
      throw new UnauthorizedError("An app-user bearer token is required.");
    }
    if (auth.get("active") !== true) {
      throw new ForbiddenError("This account has been deactivated.");
    }

    const role = String(auth.get("role") || "");
    const dealerId = String(auth.get("dealer") || "");
    if (role !== "superadmin") {
      if (!dealerId) {
        throw new ForbiddenError("Your account is not associated with a dealership.");
      }
      let dealer;
      try {
        dealer = e.app.findRecordById("dealers", dealerId);
      } catch (error) {
        throw new ForbiddenError("Your dealership is unavailable.");
      }
      if (dealer.get("active") !== true) {
        throw new ForbiddenError("Your dealership has been deactivated.");
      }
    }

    let route = "";
    try {
      const body = e.requestInfo().body || {};
      route = String(body.route || "").trim().toLowerCase();
    } catch (error) {
      route = "";
    }
    route = route.split("?")[0].split("#")[0];
    if (route.indexOf("/api/ai/") === 0) route = route.slice("/api/ai/".length);
    route = route.replace(/^\/+|\/+$/g, "");
    if (!ALLOWED_ROUTES[route]) {
      throw new BadRequestError("Unknown AI rate-limit route.");
    }

    const nowMs = Date.now();
    const resetAt = nowMs + WINDOW_MS;
    const nowText = new Date(nowMs).toISOString();
    const userId = String(auth.id || "");
    const userBucket = {
      bucketKey: "user:" + userId + ":" + route,
      subjectType: "user",
      subjectId: userId,
      limit: USER_LIMIT,
    };
    const dealerBucket = dealerId
      ? {
          bucketKey: "dealer:" + dealerId + ":" + route,
          subjectType: "dealer",
          subjectId: dealerId,
          limit: DEALER_LIMIT,
        }
      : null;

    const upsertBucket = (txApp, bucket) => {
      const row = {};
      txApp
        .db()
        .newQuery(
          "INSERT INTO ai_rate_limits " +
            "(id, bucketKey, subjectType, subjectId, route, count, resetAt, created, updated) " +
            "VALUES ({:id}, {:bucketKey}, {:subjectType}, {:subjectId}, {:route}, 1, {:newResetAt}, {:nowText}, {:nowText}) " +
            "ON CONFLICT(bucketKey) DO UPDATE SET " +
            "count = CASE WHEN ai_rate_limits.resetAt <= {:nowMs} THEN 1 ELSE ai_rate_limits.count + 1 END, " +
            "resetAt = CASE WHEN ai_rate_limits.resetAt <= {:nowMs} THEN {:newResetAt} ELSE ai_rate_limits.resetAt END, " +
            "updated = {:nowText} " +
            "RETURNING count, resetAt"
        )
        .bind({
          id: $security.randomString(15),
          bucketKey: bucket.bucketKey,
          subjectType: bucket.subjectType,
          subjectId: bucket.subjectId,
          route: route,
          nowMs: nowMs,
          newResetAt: resetAt,
          nowText: nowText,
        })
        .one(row);
      return {
        count: Number(row.count || 0),
        resetAt: Number(row.resetAt || resetAt),
        limit: bucket.limit,
      };
    };

    const outcomes = [];
    e.app.runInTransaction((txApp) => {
      const userOutcome = upsertBucket(txApp, userBucket);
      outcomes.push(userOutcome);
      // A request already denied by the per-user bucket must not consume the
      // shared dealer quota — otherwise one user hammering past their own
      // limit throttles every teammate at the same dealership. Both upserts
      // stay inside this single transaction, so the check-then-skip remains
      // atomic with respect to concurrent requests.
      if (dealerBucket && userOutcome.count <= userBucket.limit) {
        outcomes.push(upsertBucket(txApp, dealerBucket));
      }
    });

    let allowed = true;
    let retryAfterSec = 0;
    for (const outcome of outcomes) {
      if (outcome.count > outcome.limit) {
        allowed = false;
        retryAfterSec = Math.max(
          retryAfterSec,
          Math.max(1, Math.ceil((outcome.resetAt - nowMs) / 1000))
        );
      }
    }

    return e.json(200, { allowed: allowed, retryAfterSec: retryAfterSec });
  },
  $apis.requireAuth("users")
);
