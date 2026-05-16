import { pb, User, Dealer, clearSuperadminDealerOverride, asRecord } from "./pocketbase";
import { validatePassword } from "./passwordPolicy";

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
    console.error("Login failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Login failed",
    };
  }
};

/**
 * Register a new user
 */
export const register = async (
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  dealerCode: string
): Promise<AuthResult> => {
  try {
    // Enforce password policy + check against haveibeenpwned breach corpus
    // before we hit PB. Saves a roundtrip if the password is unacceptable.
    const policyCheck = await validatePassword(password);
    if (!policyCheck.ok) {
      return { success: false, error: policyCheck.error ?? "Password rejected." };
    }

    // First, find the dealer by code
    const dealers = await pb.collection("dealers").getList(1, 1, {
      filter: pb.filter("code = {:code}", { code: dealerCode }),
    });

    if (dealers.items.length === 0) {
      return { success: false, error: "Invalid dealer code" };
    }

    const dealer = asType<Dealer>(dealers.items[0]);
    if (!dealer) {
      return { success: false, error: "Dealer not found" };
    }

    // Create the user
    const userData = {
      email,
      password,
      passwordConfirm: password,
      firstName,
      lastName,
      dealer: dealer.id,
      role: "sales", // Default role for new users
    };

    await pb.collection("users").create(userData);

    // Auto-login after registration
    return await login(email, password);
  } catch (error) {
    console.error("Registration failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Registration failed",
    };
  }
};

/**
 * Logout current user
 */
export const logout = (): void => {
  clearSuperadminDealerOverride(); // Clear any superadmin dealer override
  sessionStorage.removeItem("superadmin_view_mode"); // Clear view mode
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
    console.error("Password reset request failed:", error);
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
    console.error("Profile update failed:", error);
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
