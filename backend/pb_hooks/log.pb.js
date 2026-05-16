/// <reference path="../pb_data/types.d.ts" />

/**
 * Structured request logging for slow queries and 5xx responses.
 *
 * PocketBase's default access log doesn't surface latency or error context
 * in a way that's grep-friendly. This hook emits one JSON line per slow
 * request (>500ms) or 5xx response so `fly logs | grep '"kind":"pb_log"'`
 * returns a clean filterable stream.
 *
 * Pure synchronous middleware — no I/O, no allocation outside the log line
 * itself — so it can't become a perf problem.
 */

const SLOW_MS = 500;

routerUse((e) => {
  const start = Date.now();
  let status = 200;
  try {
    e.next();
  } catch (err) {
    status = 500;
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
