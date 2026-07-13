import PocketBase from "pocketbase";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { ProviderKeys } from "./modelSelection.js";
import { createLogger } from "../../../lib/logger.js";

// Safe creation: keyResolver runs in serverless (node) contexts where
// import.meta.env may not be defined (unlike client Vite bundles).
const keyResolverLogger = (() => {
  try {
    return createLogger("key-resolver");
  } catch {
    // Fallback preserves original console.warn behavior + error details.
    interface FallbackLogger {
      warn: (message: string, context?: unknown) => void;
      error: (message: string, error?: unknown) => void;
      debug: () => void;
      info: () => void;
    }
    return {
      warn: (message: string, context?: unknown) =>
        console.warn(`[key-resolver] ${message}`, context),
      error: (message: string, error?: unknown) =>
        console.error(`[key-resolver] ${message}`, error),
      debug: () => {},
      info: () => {},
    } as FallbackLogger;
  }
})();

/**
 * Resolves AI provider keys at request time.
 *
 * Source of truth in production: the `ai_provider_keys` collection in
 * PocketBase, edited by the owner via the Owner Console Settings tab.
 *
 * Fallback for local dev: process.env.{OPENAI,ANTHROPIC,GEMINI,GOOGLE}_API_KEY.
 * Only used when (a) the PB URL isn't configured or (b) the PB record has no
 * keys yet. Keeps `npm run dev` workable without first booting PB and
 * configuring keys.
 *
 * Caches keys for 60 seconds per worker to avoid hammering PB on every
 * AI request. Settings changes propagate within a minute.
 *
 * SEC-001 envelope encryption: when `AI_KEYS_MASTER` is set (Fly/Vercel
 * secret), keys are AES-256-GCM encrypted at rest in PocketBase. Dual-read
 * accepts legacy plaintext until the next Owner Console write re-encrypts.
 */

/** Wire prefix for AES-256-GCM envelopes stored in ai_provider_keys. */
export const AI_KEY_ENVELOPE_PREFIX = "enc:v1:";

const envFallback = (env: NodeJS.ProcessEnv): ProviderKeys => ({
  openai: env.OPENAI_API_KEY,
  anthropic: env.ANTHROPIC_API_KEY,
  gemini: env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY,
});

const getPbConfig = (env: NodeJS.ProcessEnv) => ({
  url: env.PB_INTERNAL_URL ?? env.POCKETBASE_URL ?? env.VITE_POCKETBASE_URL,
  collection: env.PB_SERVICE_COLLECTION ?? "api_service_accounts",
  email: env.PB_SERVICE_EMAIL,
  password: env.PB_SERVICE_PASSWORD,
});

type ProviderId = "openai" | "anthropic" | "gemini";

interface ProviderKeyRecord {
  id: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  lastTested?: Partial<Record<ProviderId, { at: string; ok: boolean; error?: string }>>;
}

export interface MaskedProviderKeys {
  id?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  configured: Record<ProviderId, boolean>;
  lastTested: NonNullable<ProviderKeyRecord["lastTested"]>;
}

const maskKey = (raw: string | undefined): string => {
  const value = raw?.trim();
  return value ? `••••${value.slice(-4)}` : "";
};

/**
 * Derive a 32-byte AES key from AI_KEYS_MASTER.
 * Accepts 64-char hex, or any passphrase (SHA-256 hashed).
 */
export const deriveAiKeysMaster = (master: string): Buffer => {
  const trimmed = master.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, "hex");
  return createHash("sha256").update(trimmed, "utf8").digest();
};

export const isAiKeyEnvelope = (value: string | undefined | null): boolean =>
  Boolean(value?.startsWith(AI_KEY_ENVELOPE_PREFIX));

/**
 * Encrypt a provider API key for PocketBase storage. No-op when master is unset
 * (local/dev without AI_KEYS_MASTER continues to store plaintext).
 */
export const sealProviderApiKey = (plaintext: string, master: string | undefined): string => {
  const value = plaintext.trim();
  if (!value || !master?.trim()) return value;
  const key = deriveAiKeysMaster(master);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    AI_KEY_ENVELOPE_PREFIX +
    [iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(
      "."
    )
  );
};

/**
 * Dual-read decrypt: envelopes decrypt when master is present; legacy plaintext
 * that looks like a provider key is returned as-is until the next write.
 * Encrypted values without a master (or with a wrong master) yield undefined
 * so we never send ciphertext to a provider.
 */
export const openProviderApiKey = (
  stored: string | undefined | null,
  master: string | undefined
): string | undefined => {
  const value = stored?.trim();
  if (!value) return undefined;

  if (!isAiKeyEnvelope(value)) return value;

  if (!master?.trim()) {
    keyResolverLogger.warn(
      "Encrypted AI provider key found but AI_KEYS_MASTER is unset; treating as missing"
    );
    return undefined;
  }

  try {
    const payload = value.slice(AI_KEY_ENVELOPE_PREFIX.length);
    const [ivB64, ctB64, tagB64] = payload.split(".");
    if (!ivB64 || !ctB64 || !tagB64) throw new Error("malformed envelope");
    const key = deriveAiKeysMaster(master);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    keyResolverLogger.warn("Failed to decrypt AI provider key envelope", {
      error: (error as Error).message,
    });
    return undefined;
  }
};

const decryptRecordKeys = (
  record: ProviderKeyRecord,
  master: string | undefined
): ProviderKeys => ({
  openai: openProviderApiKey(record.openaiApiKey, master),
  anthropic: openProviderApiKey(record.anthropicApiKey, master),
  gemini: openProviderApiKey(record.geminiApiKey, master),
});

interface CachedKeys {
  keys: ProviderKeys;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60_000;
let cache: CachedKeys | null = null;

/**
 * Module-scope service-auth cache. `authWithPassword` costs a bcrypt round on
 * PocketBase's single shared CPU, and several exported functions each used to
 * re-auth per call (a single "save keys" action triggered 3+ password auths,
 * and the unauthenticated GET /api/ai/models re-drove it on every key-cache
 * expiry). PB auth tokens are long-lived, so a warm instance reuses one token
 * and only re-auths when the cache is stale or the token is rejected (401/403
 * mid-use retries once with fresh auth via `withServiceAuth`).
 */
interface ServiceAuthCache {
  pb: PocketBase;
  configKey: string;
  authenticatedAt: number;
}

const SERVICE_AUTH_TTL_MS = 30 * 60_000;
let serviceAuthCache: ServiceAuthCache | null = null;

/** Test-only: clear the cached service authentication between cases. */
export const invalidateServiceAuthCache = (): void => {
  serviceAuthCache = null;
};

const authenticateService = async (
  env: NodeJS.ProcessEnv,
  forceFresh = false
): Promise<PocketBase | null> => {
  const { url, collection, email, password } = getPbConfig(env);
  if (!url || !collection || !email || !password) return null;

  const configKey = `${url}|${collection}|${email}`;
  const now = Date.now();
  if (
    !forceFresh &&
    serviceAuthCache &&
    serviceAuthCache.configKey === configKey &&
    now - serviceAuthCache.authenticatedAt < SERVICE_AUTH_TTL_MS &&
    serviceAuthCache.pb.authStore?.isValid !== false
  ) {
    return serviceAuthCache.pb;
  }

  const pb = new PocketBase(url);
  try {
    await pb.collection(collection).authWithPassword(email, password);
    serviceAuthCache = { pb, configKey, authenticatedAt: now };
    return pb;
  } catch (error) {
    serviceAuthCache = null;
    keyResolverLogger.warn("PB service auth failed", { error: (error as Error).message });
    return null;
  }
};

const isAuthRejection = (error: unknown): boolean => {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 401 || status === 403;
};

/**
 * Run `operation` against an authenticated service client. Returns null when
 * the service is not configured or authentication fails. If PB rejects the
 * cached token mid-use (revoked/expired), retries exactly once with a forced
 * fresh authentication; other errors propagate to the caller unchanged.
 */
const withServiceAuth = async <T>(
  env: NodeJS.ProcessEnv,
  operation: (pb: PocketBase) => Promise<T>
): Promise<T | null> => {
  const pb = await authenticateService(env);
  if (!pb) return null;
  try {
    return await operation(pb);
  } catch (error) {
    if (!isAuthRejection(error)) throw error;
    serviceAuthCache = null;
    const fresh = await authenticateService(env, true);
    if (!fresh) throw error;
    return operation(fresh);
  }
};

const readProviderKeyRecord = async (pb: PocketBase): Promise<ProviderKeyRecord | null> => {
  const list = await pb.collection("ai_provider_keys").getFullList({ sort: "created" });
  return (list[0] as unknown as ProviderKeyRecord | undefined) ?? null;
};

const fetchKeysFromPocketBase = async (env: NodeJS.ProcessEnv): Promise<ProviderKeys | null> => {
  try {
    return await withServiceAuth(env, async (pb) => {
      const first = await readProviderKeyRecord(pb);
      if (!first) return null;
      return decryptRecordKeys(first, env.AI_KEYS_MASTER);
    });
  } catch (error) {
    keyResolverLogger.warn("Failed to read ai_provider_keys", { error: (error as Error).message });
    return null;
  }
};

const mergeKeys = (primary: ProviderKeys, fallback: ProviderKeys): ProviderKeys => ({
  openai: primary.openai || fallback.openai,
  anthropic: primary.anthropic || fallback.anthropic,
  gemini: primary.gemini || fallback.gemini,
});

export const resolveProviderKeys = async (
  env: NodeJS.ProcessEnv = process.env
): Promise<ProviderKeys> => {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.keys;

  const fromPb = await fetchKeysFromPocketBase(env);
  const allowEnvFallback = env.NODE_ENV !== "production" || env.ALLOW_AI_KEY_ENV_FALLBACK === "1";
  const fallback = allowEnvFallback ? envFallback(env) : {};
  const merged = fromPb ? mergeKeys(fromPb, fallback) : fallback;

  cache = { keys: merged, fetchedAt: now };
  return merged;
};

export const invalidateKeyCache = (): void => {
  cache = null;
};

export const updateProviderKeyTestStatus = async (
  provider: "openai" | "anthropic" | "gemini",
  result: { ok: boolean; error?: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<void> => {
  try {
    await withServiceAuth(env, async (pb) => {
      const existing = await readProviderKeyRecord(pb);
      const lastTested = existing?.lastTested ?? {};
      const patch = {
        lastTested: {
          ...lastTested,
          [provider]: { at: new Date().toISOString(), ok: result.ok, error: result.error },
        },
      };
      if (existing) {
        await pb.collection("ai_provider_keys").update(existing.id, patch);
      }
    });
  } catch (error) {
    keyResolverLogger.warn("Failed to record test status", { error: (error as Error).message });
  }
};

export const getMaskedProviderKeys = async (
  env: NodeJS.ProcessEnv = process.env
): Promise<MaskedProviderKeys> => {
  const masked = await withServiceAuth(env, async (pb): Promise<MaskedProviderKeys> => {
    const record = await readProviderKeyRecord(pb);
    if (!record) {
      return {
        configured: { openai: false, anthropic: false, gemini: false },
        lastTested: {},
      };
    }

    const opened = decryptRecordKeys(record, env.AI_KEYS_MASTER);
    // configured reflects "a non-empty value is stored" (including envelopes we
    // cannot open yet) so the UI still shows a key is present after master rotates.
    return {
      id: record.id,
      openaiApiKey: maskKey(opened.openai),
      anthropicApiKey: maskKey(opened.anthropic),
      geminiApiKey: maskKey(opened.gemini),
      configured: {
        openai: Boolean(record.openaiApiKey?.trim()),
        anthropic: Boolean(record.anthropicApiKey?.trim()),
        gemini: Boolean(record.geminiApiKey?.trim()),
      },
      lastTested: record.lastTested ?? {},
    };
  });

  if (masked === null) throw new Error("AI provider key service is not configured.");
  return masked;
};

export const updateProviderKeys = async (
  input: {
    openaiApiKey?: string;
    anthropicApiKey?: string;
    geminiApiKey?: string;
    clear?: ProviderId[];
  },
  actorId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<MaskedProviderKeys> => {
  const applied = await withServiceAuth(env, async (pb) => {
    const existing = await readProviderKeyRecord(pb);
    const patch: Record<string, string> = {};
    const changed = new Set<ProviderId>();
    const master = env.AI_KEYS_MASTER;

    for (const provider of ["openai", "anthropic", "gemini"] as const) {
      const value = input[`${provider}ApiKey`]?.trim();
      if (value) {
        // Seal when master is configured; otherwise store plaintext (dev/legacy).
        patch[`${provider}ApiKey`] = sealProviderApiKey(value, master);
        changed.add(provider);
      }
    }
    for (const provider of input.clear ?? []) {
      patch[`${provider}ApiKey`] = "";
      changed.add(provider);
    }

    if (Object.keys(patch).length === 0) return true;

    if (existing) {
      await pb.collection("ai_provider_keys").update(existing.id, patch);
    } else {
      await pb.collection("ai_provider_keys").create({
        openaiApiKey: patch.openaiApiKey ?? "",
        anthropicApiKey: patch.anthropicApiKey ?? "",
        geminiApiKey: patch.geminiApiKey ?? "",
        lastTested: {},
      });
    }

    for (const provider of changed) {
      const cleared = (input.clear ?? []).includes(provider);
      await pb.collection("audit_log").create({
        actor: actorId,
        action: cleared ? "ai_key_cleared" : "ai_key_updated",
        target: provider,
        details: {},
      });
    }

    invalidateKeyCache();
    return true;
  });

  if (applied === null) throw new Error("AI provider key service is not configured.");
  return getMaskedProviderKeys(env);
};

export const writeProviderKeyAudit = async (
  actorId: string,
  action: "ai_key_tested",
  target: ProviderId,
  details: { ok: boolean; error?: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<void> => {
  const written = await withServiceAuth(env, async (pb) => {
    await pb.collection("audit_log").create({ actor: actorId, action, target, details });
    return true;
  });
  if (written === null) throw new Error("AI provider key service is not configured.");
};
