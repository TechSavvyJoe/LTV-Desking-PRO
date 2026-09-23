import { useCallback } from "react";
import type React from "react";

export interface RovingTabsOptions<K extends string> {
  /** Tab keys in visual order. */
  keys: readonly K[];
  active: K;
  onChange: (key: K) => void;
  /** Stable id prefix; tabs render as `${prefix}-tab-${key}`, panels as `${prefix}-panel-${key}`. */
  idPrefix: string;
  /**
   * "both" is for a tablist that reflows between a vertical and a horizontal
   * layout at different widths: all four arrow keys move focus. Pass
   * `ariaOrientation` alongside it so `aria-orientation` still announces the
   * layout's *actual* current axis — WAI-ARIA 1.2 gives tablist an implicit
   * orientation of "horizontal", so omitting the attribute is not neutral,
   * it's wrong for any list that is currently laid out vertically.
   */
  orientation?: "horizontal" | "vertical" | "both";
  /**
   * The layout axis to announce via `aria-orientation`, for callers whose
   * `orientation` is "both" (arrow-key handling already matches "horizontal"
   * or "vertical" for the other two values, so this is only consulted when
   * both axes are live and the caller must say which one is currently drawn,
   * e.g. from a `matchMedia` breakpoint check). If omitted with
   * `orientation: "both"`, `aria-orientation` is left off entirely, which
   * assistive tech then reads as WAI-ARIA's implicit "horizontal" default —
   * so every "both" caller whose list can render vertically should pass this.
   */
  ariaOrientation?: "horizontal" | "vertical";
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
  ariaOrientation,
}: RovingTabsOptions<K>) {
  const tabId = (k: K) => `${idPrefix}-tab-${k}`;
  const panelId = (k: K) => `${idPrefix}-panel-${k}`;

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const prevKeys =
        orientation === "vertical"
          ? ["ArrowUp"]
          : orientation === "both"
            ? ["ArrowUp", "ArrowLeft"]
            : ["ArrowLeft"];
      const nextKeys =
        orientation === "vertical"
          ? ["ArrowDown"]
          : orientation === "both"
            ? ["ArrowDown", "ArrowRight"]
            : ["ArrowRight"];
      const i = keys.indexOf(active);
      let target: number | null = null;
      if (nextKeys.includes(e.key)) target = (i + 1) % keys.length;
      else if (prevKeys.includes(e.key)) target = (i - 1 + keys.length) % keys.length;
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

  const getTabListProps = () => {
    // "both" has no single fixed axis, so the announced orientation comes
    // from the caller's ariaOrientation (the layout's current axis) instead
    // of the key-handling `orientation` value.
    const emitted = orientation === "both" ? ariaOrientation : orientation;
    return {
      role: "tablist" as const,
      ...(emitted ? { "aria-orientation": emitted } : {}),
    };
  };

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
