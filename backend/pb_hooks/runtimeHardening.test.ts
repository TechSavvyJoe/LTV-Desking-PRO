import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type HookEvent = Record<string, unknown>;
type HookHandler = (event: HookEvent) => unknown;

const hookSource = (name: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), "backend/pb_hooks", name), "utf8");

const setRuntimeGlobal = (name: string, value: unknown): void => {
  (globalThis as Record<string, unknown>)[name] = value;
};

const clearRuntimeGlobal = (name: string): void => {
  delete (globalThis as Record<string, unknown>)[name];
};

afterEach(() => {
  for (const name of [
    "onBootstrap",
    "cronAdd",
    "$app",
    "routerUse",
    "onRecordCreateRequest",
    "onRecordUpdateRequest",
    "ForbiddenError",
  ]) {
    clearRuntimeGlobal(name);
  }
  vi.restoreAllMocks();
});

describe("PocketBase hook runtime hardening", () => {
  it("does not rewrite equivalent authorization rules returned as string-like objects", () => {
    let bootstrapHandler: HookHandler | undefined;
    let retryHandler: (() => unknown) | undefined;
    const save = vi.fn();
    const collections = new Map<string, Record<string, unknown>>();
    const app = {
      findCollectionByNameOrId: vi.fn((name: string) => {
        let collection = collections.get(name);
        if (!collection) {
          collection = {};
          collections.set(name, collection);
        }
        return collection;
      }),
      save,
    };

    setRuntimeGlobal("onBootstrap", (handler: HookHandler) => {
      bootstrapHandler = handler;
    });
    setRuntimeGlobal(
      "cronAdd",
      (_name: string, _schedule: string, handler: () => unknown) => {
        retryHandler = handler;
      }
    );
    setRuntimeGlobal("$app", app);
    new Function(hookSource("authorization_rules.pb.js"))();

    expect(bootstrapHandler).toBeTypeOf("function");
    expect(retryHandler).toBeTypeOf("function");

    // First pass against empty collections populates every rule set.
    bootstrapHandler?.({ next: vi.fn(), app });
    expect(save).toHaveBeenCalled();
    expect(collections.has("deal_events")).toBe(true);

    // Simulate PB/Goja returning the persisted rules as string-like host
    // objects instead of primitives; the hook must treat them as equal and
    // stay a no-op instead of rewriting the schema every minute.
    for (const collection of collections.values()) {
      for (const [key, value] of Object.entries(collection)) {
        if (typeof value === "string") {
          collection[key] = { toString: () => value };
        }
      }
    }

    save.mockClear();
    retryHandler?.();
    expect(save).not.toHaveBeenCalled();
  });

  it("logs a structured auth error with its real HTTP status", () => {
    let middleware: HookHandler | undefined;
    setRuntimeGlobal("routerUse", (handler: HookHandler) => {
      middleware = handler;
    });
    new Function(hookSource("log.pb.js"))();

    expect(middleware).toBeTypeOf("function");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(600);
    const authError = Object.assign(new Error("expired token"), { value: { status: 401 } });
    const event = {
      next: () => {
        throw authError;
      },
      response: {},
      request: { method: "POST", url: { path: "/api/collections/users/auth-refresh" } },
      auth: null,
    };

    expect(() => middleware?.(event)).toThrow(authError);
    expect(log).toHaveBeenCalledOnce();
    const entry = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      status: number;
      error: boolean;
    };
    expect(entry.status).toBe(401);
    expect(entry.error).toBe(false);
  });

  it("deal_attribution.pb.js forces user on create and locks user on update for sales", () => {
    const createHandlers: Record<string, HookHandler> = {};
    const updateHandlers: Record<string, HookHandler> = {};
    setRuntimeGlobal("onRecordCreateRequest", (fn: HookHandler, name: string) => {
      createHandlers[name] = fn;
    });
    setRuntimeGlobal("onRecordUpdateRequest", (fn: HookHandler, name: string) => {
      updateHandlers[name] = fn;
    });
    setRuntimeGlobal(
      "ForbiddenError",
      class ForbiddenError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "ForbiddenError";
        }
      }
    );

    new Function(hookSource("deal_attribution.pb.js"))();

    expect(createHandlers.saved_deals).toBeTypeOf("function");
    expect(createHandlers.deal_events).toBeTypeOf("function");
    expect(updateHandlers.saved_deals).toBeTypeOf("function");

    const createEvent = {
      auth: {
        id: "auth-user-1",
        get: (key: string) => (key === "role" ? "sales" : ""),
        collection: () => ({ name: "users" }),
      },
      record: { set: vi.fn() },
      next: vi.fn(),
    };
    createHandlers.saved_deals?.(createEvent);
    expect(createEvent.record.set).toHaveBeenCalledWith("user", "auth-user-1");
    expect(createEvent.next).toHaveBeenCalled();

    const updateEvent = {
      auth: {
        id: "auth-user-1",
        get: (key: string) => (key === "role" ? "sales" : ""),
        collection: () => ({ name: "users" }),
      },
      record: {
        set: vi.fn(),
        original: () => ({ get: (key: string) => (key === "user" ? "original-owner" : "") }),
      },
      next: vi.fn(),
    };
    updateHandlers.saved_deals?.(updateEvent);
    expect(updateEvent.record.set).toHaveBeenCalledWith("user", "original-owner");
    expect(updateEvent.next).toHaveBeenCalled();
  });
});
