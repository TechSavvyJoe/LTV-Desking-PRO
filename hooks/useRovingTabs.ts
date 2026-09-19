import { useCallback } from "react";
import type React from "react";

export interface RovingTabsOptions<K extends string> {
  /** Tab keys in visual order. */
  keys: readonly K[];
  active: K;
  onChange: (key: K) => void;
  /** Stable id prefix; tabs render as `${prefix}-tab-${key}`, panels as `${prefix}-panel-${key}`. */
  idPrefix: string;
  orientation?: "horizontal" | "vertical";
}

/**
 * WAI-ARIA tabs pattern: roving tabindex, arrow-key movement that wraps,
 * Home/End, and id/aria-controls wiring between each tab and its panel.
 * Selection follows focus (automatic activation), which suits the small tab
 * sets in this product. Spread the returned prop bags onto plain elements so
 * each screen keeps its own styling. [a11y]
 */
export function useRovingTabs<K extends string>({
  keys,
  active,
  onChange,
  idPrefix,
  orientation = "horizontal",
}: RovingTabsOptions<K>) {
  const tabId = (k: K) => `${idPrefix}-tab-${k}`;
  const panelId = (k: K) => `${idPrefix}-panel-${k}`;

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const prevKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
      const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
      const i = keys.indexOf(active);
      let target: number | null = null;
      if (e.key === nextKey) target = (i + 1) % keys.length;
      else if (e.key === prevKey) target = (i - 1 + keys.length) % keys.length;
      else if (e.key === "Home") target = 0;
      else if (e.key === "End") target = keys.length - 1;
      if (target === null) return;
      const key = keys[target];
      if (key === undefined) return;
      e.preventDefault();
      onChange(key);
      document.getElementById(`${idPrefix}-tab-${key}`)?.focus();
    },
    [keys, active, onChange, idPrefix, orientation]
  );

  const getTabListProps = () => ({
    role: "tablist" as const,
    "aria-orientation": orientation,
  });

  const getTabProps = (k: K) => ({
    id: tabId(k),
    role: "tab" as const,
    type: "button" as const,
    "aria-selected": k === active,
    "aria-controls": panelId(k),
    tabIndex: k === active ? 0 : -1,
    onKeyDown,
    onClick: () => onChange(k),
  });

  /** `focusable` puts the panel in the tab order — only when it holds no focusable content. */
  const getPanelProps = (k: K, opts: { focusable?: boolean } = {}) => ({
    id: panelId(k),
    role: "tabpanel" as const,
    "aria-labelledby": tabId(k),
    ...(opts.focusable ? { tabIndex: 0 } : {}),
  });

  return { getTabListProps, getTabProps, getPanelProps };
}

export default useRovingTabs;
