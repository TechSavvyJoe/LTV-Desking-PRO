/// <reference path="../pb_data/types.d.ts" />

/**
 * Structured request logging for slow queries and 5xx responses.
 *
 * PocketBase's default access log doesn't surface latency or error context
 * in a way that's grep-friendly. This hook emits one JSON line per slow
 * request (>500ms) or 5xx response so `fly logs | grep '"kind":"pb_log"'`
 * returns a clean filterable stream.
 *
 * IMPORTANT — PocketBase JSVM scoping: handler callbacks execute in pooled
 * goja runtimes that DO NOT capture this file's module scope. A top-level
 * `const SLOW_MS = 500` referenced inside the handler throws
 * "ReferenceError: SLOW_MS is not defined" on EVERY request — which silently
 * broke all API responses with a generic 400. Everything the handler needs is
 * therefore declared INSIDE the handler. (This was the real cause of the
 * production system_settings 400.)
 */

routerUse((e) => {
  const SLOW_MS = 500;
  const start = Date.now();
  let status = 200;
  try {
    e.next();
  } catch (err) {
    // PocketBase writes the response after middleware unwinds, so at this
    // point e.response.statusCode may still be unset. Preserve structured HTTP
    // errors (notably expected 401/403 auth failures) instead of reporting
    // every thrown request as a server-side 500.
    let errorStatus = 0;
    try {
      errorStatus = Number(
        err &&
          (err.status ||
            err.statusCode ||
            err.code ||
            (err.value && (err.value.status || err.value.statusCode || err.value.code)))
      );
    } catch (_) {
      errorStatus = 0;
    }
    status = Number.isFinite(errorStatus) && errorStatus >= 400 && errorStatus <= 599 ? errorStatus : 500;
    throw err;
  } finally {
    try {
      if (e.response && typeof e.response.statusCode === "number") {
        status = e.response.statusCode;
      }
    } catch (_) {
      // best-effort; never let logging break the request
    }
    const elapsed = Date.now() - start;
    const isSlow = elapsed >= SLOW_MS;
    const isError = status >= 500;
    if (isSlow || isError) {
      let path = "";
      let method = "";
      try {
        method = e.request.method;
        path = e.request.url.path;
      } catch (_) {}
      let actorId = null;
      let actorRole = null;
      let actorDealer = null;
      try {
        const auth = e.auth;
        if (auth) {
          actorId = auth.id;
          actorRole = auth.get("role");
          if (auth.collection().name === "users") {
            actorDealer = auth.get("dealer");
          }
        }
      } catch (_) {}
      console.log(
        JSON.stringify({
          kind: "pb_log",
          method: method,
          path: path,
          status: status,
          elapsedMs: elapsed,
          slow: isSlow,
          error: isError,
          actor: actorId,
          actorRole: actorRole,
          actorDealer: actorDealer,
        })
      );
    }
  }
});
