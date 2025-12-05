import { pb, User, Dealer } from "./pocketbase";
import type { RecordModel } from "pocketbase";

// Helper for type-safe casting
const asType = <T>(record: RecordModel | null | undefined): T | null =>
  record ? (record as unknown as T) : null;

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

/**
 * Login with email and password
 */
export const login = async (
  email: string,
  password: string
): Promise<AuthResult> => {
  try {
    const authData = await pb
      .collection("users")
      .authWithPassword(email, password);
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
    // First, find the dealer by code
    const dealers = await pb.collection("dealers").getList(1, 1, {
      filter: `code = "${dealerCode}"`,
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
  pb.authStore.clear();
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
export const onAuthStateChange = (
  callback: (user: User | null) => void
): (() => void) => {
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
