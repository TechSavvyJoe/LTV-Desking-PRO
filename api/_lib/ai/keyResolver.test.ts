import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const records: Array<Record<string, unknown>> = [];
  const authWithPassword = vi.fn();
  const getFullList = vi.fn(async () => records.map((record) => ({ ...record })));
  const update = vi.fn(async (id: string, patch: Record<string, unknown>) => {
    const record = records.find((item) => item.id === id);
    if (record) Object.assign(record, patch);
    return record;
  });
  const create = vi.fn(async (data: Record<string, unknown>) => {
    const record = { id: `record-${records.length + 1}`, ...data };
    records.push(record);
    return record;
  });
  const collection = vi.fn((name: string) => ({
    authWithPassword,
    getFullList: name === "ai_provider_keys" ? getFullList : vi.fn(),
    update: name === "ai_provider_keys" ? update : vi.fn(),
    create: name === "ai_provider_keys" || name === "audit_log" ? create : vi.fn(),
  }));
  return { records, authWithPassword, getFullList, update, create, collection };
});

vi.mock("pocketbase", () => ({
  default: class PocketBaseMock {
    collection = mocks.collection;
    authStore = { isValid: true };
  },
}));

import {
  getMaskedProviderKeys,
  invalidateKeyCache,
  invalidateServiceAuthCache,
  isAiKeyEnvelope,
  openProviderApiKey,
  resolveProviderKeys,
  sealProviderApiKey,
  updateProviderKeys,
} from "./keyResolver.js";

const serviceEnv = {
  NODE_ENV: "production",
  PB_INTERNAL_URL: "https://pb.example.test",
  PB_SERVICE_COLLECTION: "api_service_accounts",
  PB_SERVICE_EMAIL: "ai-proxy@example.test",
  PB_SERVICE_PASSWORD: "not-a-real-password",
} as NodeJS.ProcessEnv;

describe("AI provider key resolver boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.records.splice(0, mocks.records.length, {
      id: "keys-1",
      openaiApiKey: "sk-full-sentinel-openai-123456",
      anthropicApiKey: "",
      geminiApiKey: "AIza-full-sentinel-gemini-987654",
      lastTested: {},
    });
    mocks.authWithPassword.mockResolvedValue({ token: "service-token" });
    invalidateKeyCache();
    invalidateServiceAuthCache();
  });

  it("authenticates with the narrow service collection instead of _superusers", async () => {
    const keys = await resolveProviderKeys(serviceEnv);

    expect(keys.openai).toBe("sk-full-sentinel-openai-123456");
    expect(mocks.collection).toHaveBeenCalledWith("api_service_accounts");
    expect(mocks.collection).not.toHaveBeenCalledWith("_superusers");
  });

  it("does not silently fall back to process provider keys in production", async () => {
    mocks.authWithPassword.mockRejectedValueOnce(new Error("denied"));

    const keys = await resolveProviderKeys({
      ...serviceEnv,
      OPENAI_API_KEY: "sk-should-not-mask-broken-service-auth",
    });

    expect(keys).toEqual({});
  });

  it("returns configured flags and suffixes without exposing full keys", async () => {
    const masked = await getMaskedProviderKeys(serviceEnv);
    const serialized = JSON.stringify(masked);

    expect(masked.configured).toEqual({ openai: true, anthropic: false, gemini: true });
    expect(masked.openaiApiKey).toBe("••••3456");
    expect(masked.geminiApiKey).toBe("••••7654");
    expect(serialized).not.toContain("full-sentinel");
  });

  it("updates server-side, writes an actor-attributed audit row, and returns only a mask", async () => {
    const secret = "sk-new-full-sentinel-00001111";
    const masked = await updateProviderKeys({ openaiApiKey: secret }, "owner-user-id", serviceEnv);

    expect(mocks.update).toHaveBeenCalledWith("keys-1", { openaiApiKey: secret });
    expect(mocks.create).toHaveBeenCalledWith({
      actor: "owner-user-id",
      action: "ai_key_updated",
      target: "openai",
      details: {},
    });
    expect(masked.openaiApiKey).toBe("••••1111");
    expect(JSON.stringify(masked)).not.toContain(secret);
  });

  it("reuses the cached service auth token across calls in a warm instance", async () => {
    await getMaskedProviderKeys(serviceEnv);
    invalidateKeyCache();
    await resolveProviderKeys(serviceEnv);
    await getMaskedProviderKeys(serviceEnv);

    expect(mocks.authWithPassword).toHaveBeenCalledTimes(1);
  });

  it("re-authenticates once and retries when PB rejects the cached token", async () => {
    // Warm the auth cache first.
    await getMaskedProviderKeys(serviceEnv);
    expect(mocks.authWithPassword).toHaveBeenCalledTimes(1);

    // Simulate a revoked/expired token: the next read 401s once.
    mocks.getFullList.mockRejectedValueOnce(
      Object.assign(new Error("The request requires valid record authorization token."), {
        status: 401,
      })
    );

    const masked = await getMaskedProviderKeys(serviceEnv);

    expect(masked.configured.openai).toBe(true);
    expect(mocks.authWithPassword).toHaveBeenCalledTimes(2);
  });

  it("propagates non-auth PB errors without a hidden re-auth loop", async () => {
    await getMaskedProviderKeys(serviceEnv);
    mocks.getFullList.mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 500 }));

    await expect(getMaskedProviderKeys(serviceEnv)).rejects.toThrow("boom");
    expect(mocks.authWithPassword).toHaveBeenCalledTimes(1);
  });

  it("dual-reads legacy plaintext and seals new writes when AI_KEYS_MASTER is set", async () => {
    const master = "a".repeat(64); // 32-byte hex key
    const env = { ...serviceEnv, AI_KEYS_MASTER: master };

    // Legacy plaintext still resolves.
    const keys = await resolveProviderKeys(env);
    expect(keys.openai).toBe("sk-full-sentinel-openai-123456");

    const secret = "sk-new-full-sentinel-enc-9999";
    const masked = await updateProviderKeys({ openaiApiKey: secret }, "owner-user-id", env);
    expect(masked.openaiApiKey).toBe("••••9999");

    const stored = mocks.update.mock.calls.at(-1)?.[1] as { openaiApiKey: string };
    expect(isAiKeyEnvelope(stored.openaiApiKey)).toBe(true);
    expect(stored.openaiApiKey).not.toContain(secret);
    expect(openProviderApiKey(stored.openaiApiKey, master)).toBe(secret);

    invalidateKeyCache();
    mocks.records[0]!.openaiApiKey = stored.openaiApiKey;
    const resolved = await resolveProviderKeys(env);
    expect(resolved.openai).toBe(secret);
  });

  it("seal/open round-trip rejects wrong master without leaking ciphertext as a key", () => {
    const sealed = sealProviderApiKey("sk-roundtrip-abcdef", "b".repeat(64));
    expect(isAiKeyEnvelope(sealed)).toBe(true);
    expect(openProviderApiKey(sealed, "c".repeat(64))).toBeUndefined();
    expect(openProviderApiKey(sealed, undefined)).toBeUndefined();
    expect(openProviderApiKey("sk-plain-legacy", undefined)).toBe("sk-plain-legacy");
  });
});
