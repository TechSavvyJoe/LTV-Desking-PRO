import PocketBase from "pocketbase";
import type { ProviderKeys } from "./modelSelection";

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
 */

interface CachedKeys {
  keys: ProviderKeys;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60_000;
let cache: CachedKeys | null = null;

const envFallback = (env: NodeJS.ProcessEnv): ProviderKeys => ({
  openai: env.OPENAI_API_KEY,
  anthropic: env.ANTHROPIC_API_KEY,
  gemini: env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY,
});

const getPbConfig = (env: NodeJS.ProcessEnv) => ({
  url: env.PB_INTERNAL_URL ?? env.POCKETBASE_URL ?? env.VITE_POCKETBASE_URL,
  email: env.PB_SERVICE_EMAIL,
  password: env.PB_SERVICE_PASSWORD,
});

const fetchKeysFromPocketBase = async (
  env: NodeJS.ProcessEnv
): Promise<ProviderKeys | null> => {
  const { url, email, password } = getPbConfig(env);
  if (!url || !email || !password) return null;

  const pb = new PocketBase(url);
  try {
    await pb.collection("_superusers").authWithPassword(email, password);
  } catch (error) {
    console.warn("[ai] PB service auth failed:", (error as Error).message);
    return null;
  }

  try {
    const list = await pb.collection("ai_provider_keys").getFullList({ sort: "created" });
    const first = list[0];
    if (!first) return null;
    const record = first as unknown as {
      openaiApiKey?: string;
      anthropicApiKey?: string;
      geminiApiKey?: string;
    };
    return {
      openai: record.openaiApiKey || undefined,
      anthropic: record.anthropicApiKey || undefined,
      gemini: record.geminiApiKey || undefined,
    };
  } catch (error) {
    console.warn("[ai] Failed to read ai_provider_keys:", (error as Error).message);
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
  const merged = fromPb ? mergeKeys(fromPb, envFallback(env)) : envFallback(env);

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
  const { url, email, password } = getPbConfig(env);
  if (!url || !email || !password) return;

  const pb = new PocketBase(url);
  try {
    await pb.collection("_superusers").authWithPassword(email, password);
    const list = await pb.collection("ai_provider_keys").getFullList({ sort: "created" });
    const existing = list[0];
    const lastTested = (existing as unknown as { lastTested?: Record<string, unknown> })
      ?.lastTested ?? {};
    const patch = {
      lastTested: {
        ...lastTested,
        [provider]: { at: new Date().toISOString(), ok: result.ok, error: result.error },
      },
    };
    if (existing) {
      await pb.collection("ai_provider_keys").update(existing.id, patch);
    }
  } catch (error) {
    console.warn("[ai] failed to record test status:", (error as Error).message);
  }
};
