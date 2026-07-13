import { pb, User, clearSuperadminDealerOverride, asRecord } from "./pocketbase";
import { STORAGE_KEYS } from "../constants";
import { createLogger } from "./logger";

const authLogger = createLogger("auth");

// Local alias delegates to the shared helper in lib/pocketbase.ts so the
// cast lives in exactly one place.
const asType = asRecord;

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

/**
 * Login with email and password
 */
export const login = async (email: string, password: string): Promise<AuthResult> => {
  try {
    const authData = await pb.collection("users").authWithPassword(email, password);
    return {
      success: true,
      user: asType<User>(authData.record) ?? undefined,
    };
  } catch (error) {
    authLogger.error("Login failed", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Login failed",
    };
  }
};

/**
 * Renew the auth token. PocketBase tokens hard-expire (~14 days from login,
 * not sliding); without periodic refresh an active user dies mid-deal with
 * cryptic save failures. Called on app boot and on a timer. 401s are handled
 * globally by pb.afterSend (sessionExpired broadcast). [G65]
 */
export const refreshSession = async (): Promise<void> => {
  if (!pb.authStore.isValid) return;
  try {
    await pb.collection("users").authRefresh();
  } catch {
    // afterSend already broadcast sessionExpired on 401; network errors are
    // non-fatal here — the next call will retry.
  }
};

/**
 * Logout current user
 */
export const logout = (): void => {
  clearSuperadminDealerOverride(); // Clear any superadmin dealer override
  sessionStorage.removeItem("superadmin_view_mode"); // Clear view mode
  // Shared-desk hygiene: remove the previous user's in-progress deal, customer
  // identifiers, favorites, and notes — they used to survive logout in
  // localStorage and bleed into the next login on the same machine. [C1]
  try {
    for (const key of [
      STORAGE_KEYS.DEAL_DATA,
      STORAGE_KEYS.FILTERS,
      STORAGE_KEYS.FAVORITES,
      STORAGE_KEYS.SCRATCH_PAD,
      STORAGE_KEYS.SETTINGS,
    ]) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // localStorage unavailable — nothing to clear
  }
  pb.authStore.clear();
  // Reload to clear all cached data (inventory, deals, lender profiles) from the previous session
  window.location.reload();
};

/**
 * Request password reset
 */
export const requestPasswordReset = async (email: string): Promise<boolean> => {
  try {
    await pb.collection("users").requestPasswordReset(email);
    return true;
  } catch (error) {
    authLogger.error("Password reset request failed", error as Error);
    return false;
  }
};

/**
 * Update user profile
 */
export const updateProfile = async (
  userId: string,
  data: Partial<Pick<User, "firstName" | "lastName" | "phone">>
): Promise<User | null> => {
  try {
    const updated = await pb.collection("users").update(userId, data);
    return asType<User>(updated);
  } catch (error) {
    authLogger.error("Profile update failed", error as Error);
    return null;
  }
};

/**
 * Subscribe to auth state changes
 */
export const onAuthStateChange = (callback: (user: User | null) => void): (() => void) => {
  // Initial call
  callback(asType<User>(pb.authStore.model));

  // Subscribe to changes
  const unsubscribe = pb.authStore.onChange((_token, model) => {
    callback(asType<User>(model));
  });

  return unsubscribe;
};

// Helper to get current user
export const getCurrentUser = (): User | null => {
  return asType<User>(pb.authStore.model);
};

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  return pb.authStore.isValid;
};
