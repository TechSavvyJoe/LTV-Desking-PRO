// FIX: React was not imported, causing an error with React.Dispatch.
import type React from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { Settings } from "../types";
import { INITIAL_SETTINGS, STORAGE_KEYS } from "../constants";

export function useSettings(): [
  Settings,
  React.Dispatch<React.SetStateAction<Settings>>
] {
  const [settings, setSettings] = useLocalStorage<Settings>(
    STORAGE_KEYS.SETTINGS,
    INITIAL_SETTINGS
  );
  return [settings, setSettings];
}
