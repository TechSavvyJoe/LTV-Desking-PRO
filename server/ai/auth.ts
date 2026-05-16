import type { IncomingMessage } from "node:http";
import PocketBase from "pocketbase";

/**
 * Authenticates an inbound /api/ai/* request by validating the
 * `Authorization: Bearer <token>` header against PocketBase.
 *
 * Returns the authenticated user's id, role, and dealer if the token is
 * valid. Throws `AuthError` otherwise — the route handler should catch and
 * respond with 401/403.
 *
 * Validation uses PocketBase's `authRefresh()` which round-trips to the
 * backend with the token and returns the auth record on success. We don't
 * cache because tokens may be revoked; PB is fast and routes already do
 * network calls per request.
 */

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: 401 | 403
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthContext {
  userId: string;
  role: "superadmin" | "admin" | "user" | string;
  dealerId: string | null;
}

const extractToken = (request: IncomingMessage): string | null => {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? (match[1] ?? null) : null;
};

const getPbUrl = (): string | null => {
  return (
    process.env.PB_INTERNAL_URL ??
    process.env.POCKETBASE_URL ??
    process.env.VITE_POCKETBASE_URL ??
    null
  );
};

export const requireAuth = async (request: IncomingMessage): Promise<AuthContext> => {
  const token = extractToken(request);
  if (!token) throw new AuthError("Missing bearer token", 401);

  const url = getPbUrl();
  if (!url) {
    // No PB configured — dev environment without a backend. Fail closed.
    throw new AuthError("Authentication backend not configured", 401);
  }

  const pb = new PocketBase(url);
  pb.authStore.save(token, null);
  try {
    const auth = await pb.collection("users").authRefresh();
    const record = auth.record as unknown as {
      id: string;
      role?: string;
      dealer?: string;
    };
    return {
      userId: record.id,
      role: record.role ?? "user",
      dealerId: record.dealer ?? null,
    };
  } catch {
    throw new AuthError("Invalid or expired token", 401);
  }
};

export const requireSuperadmin = async (request: IncomingMessage): Promise<AuthContext> => {
  const ctx = await requireAuth(request);
  if (ctx.role !== "superadmin") {
    throw new AuthError("Superadmin role required", 403);
  }
  return ctx;
};
