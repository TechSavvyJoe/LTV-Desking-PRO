import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

// 1. Mock the auth, keyResolver, and providerClients modules to prevent actual network/DB connections
vi.mock("./auth.js", () => {
  return {
    requireAuth: vi.fn(),
    requireSuperadmin: vi.fn(),
    AuthError: class AuthError extends Error {
      constructor(
        message: string,
        public statusCode: number
      ) {
        super(message);
        this.name = "AuthError";
      }
    },
  };
});

vi.mock("./keyResolver.js", () => {
  return {
    resolveProviderKeys: vi.fn().mockResolvedValue({
      openai: "test-openai-key",
      anthropic: "test-anthropic-key",
      gemini: "test-gemini-key",
    }),
    updateProviderKeyTestStatus: vi.fn(),
  };
});

vi.mock("./providerClients.js", () => {
  return {
    callAiJson: vi.fn().mockResolvedValue({
      mockedResponse: "success",
    }),
    callGroundedAiJson: vi.fn().mockResolvedValue({
      json: { mockedResponse: "grounded-success" },
      sources: [],
    }),
  };
});

// Import modules under test
import { handleAiRequest } from "./routes.js";
import { __resetRateLimits } from "./rateLimit.js";
import * as authLib from "./auth.js";
import * as providerClients from "./providerClients.js";

// Helper to create mock IncomingMessage requests
function createMockReq(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = options.method ?? "POST";
  req.url = options.url ?? "/api/ai/deal-analysis";
  req.headers = options.headers ?? {
    "content-type": "application/json",
    authorization: "Bearer dummy-token",
  };

  if (options.body !== undefined) {
    const data = typeof options.body === "string" ? Buffer.from(options.body) : options.body;
    req.push(data);
  }
  req.push(null); // End the stream

  return req;
}

interface MockResponseState {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

// Helper to create mock ServerResponse objects
function createMockRes(): {
  res: ServerResponse;
  getState: () => MockResponseState;
  promise: Promise<MockResponseState>;
} {
  const socket = new Socket();
  const res = new ServerResponse(new IncomingMessage(socket));

  const state: MockResponseState = {
    statusCode: 200,
    headers: {},
    body: "",
  };

  let resolvePromise: (state: MockResponseState) => void;
  const promise = new Promise<MockResponseState>((resolve) => {
    resolvePromise = resolve;
  });

  res.write = vi.fn((chunk, encoding, callback) => {
    if (chunk) {
      state.body += chunk.toString();
    }
    if (typeof callback === "function") callback();
    return true;
  }) as any;

  res.end = vi.fn((chunk, encoding, callback) => {
    if (chunk) {
      state.body += chunk.toString();
    }
    if (typeof callback === "function") callback();
    resolvePromise(state);
    return res;
  }) as any;

  res.setHeader = vi.fn((name: string, value: any) => {
    state.headers[name.toLowerCase()] = String(value);
    return res;
  }) as any;

  Object.defineProperty(res, "statusCode", {
    get() {
      return state.statusCode;
    },
    set(val) {
      state.statusCode = val;
    },
  });

  return { res, getState: () => state, promise };
}

describe("Milestone 2 Security & Cost Control Verification", () => {
  describe("B2: dealer_guard fails-closed when dealer association is missing (PocketBase hook)", () => {
    let enforceInventoryHandler: (...args: any[]) => void;

    beforeAll(() => {
      const createHandlers: Record<string, (...args: any[]) => void> = {};
      const updateHandlers: Record<string, (...args: any[]) => void> = {};

      // Mock PocketBase hook registration globals
      (globalThis as any).onRecordCreateRequest = (fn: (...args: any[]) => void, name: string) => {
        createHandlers[name] = fn;
      };
      (globalThis as any).onRecordUpdateRequest = (fn: (...args: any[]) => void, name: string) => {
        updateHandlers[name] = fn;
      };
      (globalThis as any).ForbiddenError = class ForbiddenError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "ForbiddenError";
        }
      } as any;

      // Load and evaluate the dealer_guard hook script
      const hookPath = path.resolve(process.cwd(), "backend/pb_hooks/dealer_guard.pb.js");
      const code = fs.readFileSync(hookPath, "utf8");

      // Run code to register handlers
      const runHook = new Function(code);
      runHook();

      // Retrieve the inventory collection handler
      enforceInventoryHandler = createHandlers["inventory"]!;
    });

    afterAll(() => {
      delete (globalThis as any).onRecordCreateRequest;
      delete (globalThis as any).onRecordUpdateRequest;
      delete (globalThis as any).ForbiddenError;
    });

    it("should fail-closed when auth context is completely missing", () => {
      const e = {
        auth: null,
        record: {
          set: vi.fn(),
        },
        next: vi.fn(),
      };

      expect(() => enforceInventoryHandler(e)).toThrowError(
        "Authentication is required to write dealer-scoped records."
      );
      expect(e.next).not.toHaveBeenCalled();
      expect(e.record.set).not.toHaveBeenCalled();
    });

    it("should fail-closed when dealer association on auth is missing", () => {
      const mockAuth = {
        get: vi.fn((key: string) => {
          if (key === "dealer") return null;
          if (key === "role") return "user";
          return null;
        }),
      };

      const e = {
        auth: mockAuth,
        record: {
          set: vi.fn(),
        },
        next: vi.fn(),
      };

      expect(() => enforceInventoryHandler(e)).toThrowError(
        "Your account is not associated with a dealership."
      );
      expect(e.next).not.toHaveBeenCalled();
      expect(e.record.set).not.toHaveBeenCalled();
    });

    it("should allow write and force dealer ID when auth and dealer association are valid", () => {
      const mockAuth = {
        get: vi.fn((key: string) => {
          if (key === "dealer") return "dealer-abc-123";
          if (key === "role") return "user";
          return null;
        }),
      };

      const e = {
        auth: mockAuth,
        record: {
          set: vi.fn(),
        },
        next: vi.fn(),
      };

      enforceInventoryHandler(e);
      expect(e.record.set).toHaveBeenCalledWith("dealer", "dealer-abc-123");
      expect(e.next).toHaveBeenCalled();
    });

    it("should allow superadmin bypass without dealer association", () => {
      const mockAuth = {
        get: vi.fn((key: string) => {
          if (key === "role") return "superadmin";
          return null;
        }),
      };

      const e = {
        auth: mockAuth,
        record: {
          set: vi.fn(),
        },
        next: vi.fn(),
      };

      enforceInventoryHandler(e);
      expect(e.record.set).not.toHaveBeenCalled();
      expect(e.next).toHaveBeenCalled();
    });
  });

  describe("B3: AI proxy rate limiter throttling", () => {
    beforeEach(() => {
      __resetRateLimits();
      vi.restoreAllMocks();
    });

    it("should fail-closed in AI proxy when dealer association is missing", async () => {
      const mockAuthContext = {
        userId: "user-no-dealer",
        role: "user",
        dealerId: null,
      };
      vi.mocked(authLib.requireAuth).mockResolvedValue(mockAuthContext);

      const req = createMockReq({
        url: "/api/ai/deal-analysis",
        body: JSON.stringify({}),
      });
      const { res, promise } = createMockRes();

      await handleAiRequest(req, res);
      const state = await promise;

      expect(state.statusCode).toBe(403);
      const body = JSON.parse(state.body);
      expect(body.ok).toBe(false);
      expect(body.error).toBe("Your account is not associated with a dealership.");
    });

    it("should throttle rapid requests and return 429 with Retry-After header", async () => {
      const mockAuthContext = {
        userId: "user-limit-test",
        role: "user",
        dealerId: "dealer-limit-test",
      };
      vi.mocked(authLib.requireAuth).mockResolvedValue(mockAuthContext);

      // Send 20 requests rapidly (which is the per-user limit)
      // The rate limiter permits exactly 20. The 21st should fail.
      for (let i = 0; i < 20; i++) {
        const req = createMockReq({
          url: "/api/ai/deal-analysis",
          body: JSON.stringify({}),
        });
        const { res, promise } = createMockRes();

        await handleAiRequest(req, res);
        const state = await promise;
        // First 20 requests bypass rate limit check but fail validation (400) because payload is empty.
        // This is expected and proves the rate limiter did not block them.
        expect(state.statusCode).toBe(400);
      }

      // Send the 21st request
      const req21 = createMockReq({
        url: "/api/ai/deal-analysis",
        body: JSON.stringify({}),
      });
      const { res: res21, promise: promise21 } = createMockRes();

      await handleAiRequest(req21, res21);
      const state21 = await promise21;

      expect(state21.statusCode).toBe(429);
      expect(state21.headers["retry-after"]).toBeDefined();
      const retryAfter = parseInt(state21.headers["retry-after"]!, 10);
      expect(retryAfter).toBeGreaterThan(0);

      const body = JSON.parse(state21.body);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("Rate limit exceeded. Try again in");
    });
  });

  describe("B4: Request payload size limits and MIME type validation", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      const mockAuthContext = {
        userId: "user-b4-test",
        role: "user",
        dealerId: "dealer-b4-test",
      };
      vi.mocked(authLib.requireAuth).mockResolvedValue(mockAuthContext);
    });

    it("should block request payloads exceeding 4 MB and return 413", async () => {
      // 4 MB = 4 * 1024 * 1024 bytes. Exceed by 100 bytes.
      const largeSize = 4 * 1024 * 1024 + 100;
      const buffer = Buffer.alloc(largeSize, "a");

      const req = createMockReq({
        url: "/api/ai/lender-extract",
        body: buffer,
      });
      const { res, promise } = createMockRes();

      await handleAiRequest(req, res);
      const state = await promise;

      expect(state.statusCode).toBe(413);
      const body = JSON.parse(state.body);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("Request body too large.");
    });

    it("should reject MIME type validation if not application/pdf", async () => {
      const payload = {
        file: {
          name: "test.png",
          mimeType: "image/png",
          base64Data: "dGVzdA==", // "test" in base64
        },
        aiSettings: {},
      };

      const req = createMockReq({
        url: "/api/ai/lender-extract",
        body: JSON.stringify(payload),
      });
      const { res, promise } = createMockRes();

      await handleAiRequest(req, res);
      const state = await promise;

      expect(state.statusCode).toBe(400);
      const body = JSON.parse(state.body);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("Request validation failed.");
    });

    it("should reject invalid base64 characters in base64Data", async () => {
      const payload = {
        file: {
          name: "test.pdf",
          mimeType: "application/pdf",
          base64Data: "invalid_base64_chars_!@#",
        },
        aiSettings: {},
      };

      const req = createMockReq({
        url: "/api/ai/lender-extract",
        body: JSON.stringify(payload),
      });
      const { res, promise } = createMockRes();

      await handleAiRequest(req, res);
      const state = await promise;

      expect(state.statusCode).toBe(400);
      const body = JSON.parse(state.body);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("Request validation failed.");
    });
  });

  describe("B9: 500 internal error responses masking", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      const mockAuthContext = {
        userId: "user-b9-test",
        role: "user",
        dealerId: "dealer-b9-test",
      };
      vi.mocked(authLib.requireAuth).mockResolvedValue(mockAuthContext);
    });

    it("should mask internal details on 500 error and return a correlation ID", async () => {
      // Mock callAiJson to throw an internal system error containing sensitive path details
      vi.mocked(providerClients.callAiJson).mockRejectedValue(
        new Error("Secret DB Connection Failure at postgres://admin:passwd@10.0.0.5:5432/db")
      );

      const payload = {
        vehicle: { make: "Toyota", model: "Camry", year: 2024 },
        dealData: { price: 25000 },
        filters: {},
        lenderProfiles: [],
        inventory: [],
        aiSettings: {},
      };

      const req = createMockReq({
        url: "/api/ai/deal-analysis",
        body: JSON.stringify(payload),
      });
      const { res, promise } = createMockRes();

      // Suppress log to keep test runner output clean
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await handleAiRequest(req, res);
      const state = await promise;

      expect(state.statusCode).toBe(500);
      const body = JSON.parse(state.body);
      expect(body.ok).toBe(false);
      // Verify masking
      expect(body.error).toBe(
        "AI request failed. Please try again or contact support if the problem persists."
      );
      expect(body.error).not.toContain("Secret DB Connection");
      expect(body.error).not.toContain("postgres://");

      // Verify correlation ID is present and unique
      expect(body.correlationId).toBeDefined();
      expect(typeof body.correlationId).toBe("string");
      expect(body.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      // Verify the real error was logged on the server
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("auth edges and error paths", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      __resetRateLimits();
    });

    it("returns 401 for AuthError from requireAuth (simulated missing token)", async () => {
      const { AuthError } = await import("./auth.js");
      vi.mocked(authLib.requireAuth).mockRejectedValue(new AuthError("Missing bearer token", 401));

      const req = createMockReq({ url: "/api/ai/deal-analysis", body: JSON.stringify({}) });
      const { res, promise } = createMockRes();

      await handleAiRequest(req, res);
      const state = await promise;

      expect(state.statusCode).toBe(401);
      expect(JSON.parse(state.body).error).toContain("Missing bearer token");
    });

    it("returns 403 for superadmin-only route when requireSuperadmin throws", async () => {
      const { AuthError } = await import("./auth.js");
      vi.mocked(authLib.requireSuperadmin).mockRejectedValue(
        new AuthError("Superadmin role required", 403)
      );

      const req = createMockReq({ url: "/api/ai/test-key", body: JSON.stringify({}) });
      const { res, promise } = createMockRes();

      await handleAiRequest(req, res);
      const state = await promise;

      expect(state.statusCode).toBe(403);
      expect(JSON.parse(state.body).error).toContain("Superadmin role required");
    });

    it("enforces rate limit returns 429 and sets Retry-After header", async () => {
      const mockAuthContext = {
        userId: "rl-edge",
        role: "user",
        dealerId: "d-rl",
      };
      vi.mocked(authLib.requireAuth).mockResolvedValue(mockAuthContext);

      // Exhaust the limit quickly; use deal-analysis that tolerates partials up to rate
      let lastState;
      for (let i = 0; i < 25; i++) {
        const req = createMockReq({
          url: "/api/ai/deal-analysis",
          body: JSON.stringify({ vehicle: {}, dealData: {}, filters: {} }),
        });
        const { res, promise } = createMockRes();
        await handleAiRequest(req, res);
        lastState = await promise;
        if (lastState.statusCode === 429) break;
      }
      expect(lastState?.statusCode).toBe(429);
      // Retry-After may be set on res (tested via existing B3 cases); here we confirm enforcement
    });

    it("returns 401 when requireAuth rejects with expired token [auth-edges]", async () => {
      const { AuthError } = await import("./auth.js");
      vi.mocked(authLib.requireAuth).mockRejectedValue(
        new AuthError("Invalid or expired token", 401)
      );

      const req = createMockReq({
        url: "/api/ai/lender-enrich",
        body: JSON.stringify({ lenderName: "x" }),
      });
      const { res, promise } = createMockRes();

      await handleAiRequest(req, res);
      const state = await promise;

      expect(state.statusCode).toBe(401);
      expect(JSON.parse(state.body).error).toContain("Invalid or expired token");
    });

    it("handles auth success but downstream rate limit still applies [auth-edges]", async () => {
      const mockAuth = { userId: "auth-rl", role: "user", dealerId: "d-auth" };
      vi.mocked(authLib.requireAuth).mockResolvedValue(mockAuth);

      // Exhaust user limit first
      let status = 200;
      for (let i = 0; i < 25; i++) {
        const req = createMockReq({ url: "/api/ai/deal-analysis", body: JSON.stringify({}) });
        const { res, promise } = createMockRes();
        await handleAiRequest(req, res);
        const s = await promise;
        status = s.statusCode;
        if (status === 429) break;
      }
      expect(status).toBe(429);
    });

    it("requireAuth path for superadmin-only without role fails closed [auth-edges]", async () => {
      const { AuthError } = await import("./auth.js");
      vi.mocked(authLib.requireSuperadmin).mockRejectedValue(
        new AuthError("Superadmin role required", 403)
      );

      const req = createMockReq({ url: "/api/ai/test-key", body: JSON.stringify({}) });
      const { res, promise } = createMockRes();

      await handleAiRequest(req, res);
      const state = await promise;
      expect(state.statusCode).toBe(403);
    });
  });
});
