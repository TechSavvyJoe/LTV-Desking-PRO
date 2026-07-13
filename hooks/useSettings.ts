import type React from "react";
import { useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { Settings } from "../types";
import { INITIAL_SETTINGS, SETTINGS_CHANGED_EVENT, STORAGE_KEYS } from "../constants";

/**
 * Settings read for consumers OUTSIDE the DealProvider (e.g. TableCell).
 *
 * Stays live after mount: DealContext.updateSettings writes the same
 * localStorage key and dispatches SETTINGS_CHANGED_EVENT for same-tab
 * updates; the native "storage" event covers other tabs. Without this,
 * consumers rendered stale settings until remount. [settings-staleness]
 */
export function useSettings(): [Settings, React.Dispatch<React.SetStateAction<Settings>>] {
  const [settings, setSettings] = useLocalStorage<Settings>(
    STORAGE_KEYS.SETTINGS,
    INITIAL_SETTINGS
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reread = () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (!raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setSettings(parsed as Settings);
        }
      } catch {
        // Unparseable write — keep the last good in-memory value.
      }
    };

    const onStorage = (event: StorageEvent) => {
      // key === null means localStorage.clear() — re-read in that case too.
      if (event.key === STORAGE_KEYS.SETTINGS || event.key === null) reread();
    };

    window.addEventListener(SETTINGS_CHANGED_EVENT, reread);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, reread);
      window.removeEventListener("storage", onStorage);
    };
  }, [setSettings]);

  return [settings, setSettings];
}
