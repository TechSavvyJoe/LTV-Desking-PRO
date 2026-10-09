import { STORAGE_KEYS } from "../constants";

export const AUTH_IDENTITY_CHANGED_EVENT = "ltv:auth-identity-changed";
let privateSessionEpoch = 0;
export const getPrivateSessionEpoch = (): number => privateSessionEpoch;

/** A→B→A is still a new session; old asynchronous responses stay invalid. */
export const announcePrivateSessionBoundary = (): void => {
  privateSessionEpoch += 1;
  window.dispatchEvent(new Event(AUTH_IDENTITY_CHANGED_EVENT));
};

/** Keep drafts private to the authenticated identity, including legacy caches. */
export const clearPrivateSessionStorage = (): void => {
  try {
    for (const key of Object.values(STORAGE_KEYS)) {
      // Theme is the only browser preference that carries no dealer/customer data.
      if (key !== STORAGE_KEYS.THEME) window.localStorage.removeItem(key);
    }
    window.sessionStorage.removeItem("superadmin_dealer_override");
    window.sessionStorage.removeItem("superadmin_view_mode");
  } catch {
    // Storage may be disabled; cached queries are cleared independently.
  }
};
