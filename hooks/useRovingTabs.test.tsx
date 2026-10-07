import React, { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useRovingTabs } from "./useRovingTabs";

afterEach(cleanup);

const KEYS = ["summary", "lenders", "addons"] as const;
type Key = (typeof KEYS)[number];

const Harness: React.FC<{
  orientation?: "horizontal" | "vertical" | "both";
  ariaOrientation?: "horizontal" | "vertical";
}> = ({ orientation, ariaOrientation }) => {
  const [active, setActive] = useState<Key>("summary");
  const tabs = useRovingTabs({
    keys: KEYS,
    active,
    onChange: setActive,
    idPrefix: "t",
    orientation,
    ariaOrientation,
  });
  return (
    <div>
      <div aria-label="Sections" {...tabs.getTabListProps()}>
        {KEYS.map((k) => (
          <button key={k} {...tabs.getTabProps(k)}>
            {k}
          </button>
        ))}
      </div>
      <div {...tabs.getPanelProps(active, { focusable: true })}>panel:{active}</div>
    </div>
  );
};

const tabAt = (i: number) => screen.getAllByRole("tab")[i] as HTMLElement;

describe("useRovingTabs [a11y]", () => {
  it("wires tablist / tab / tabpanel ids and a roving tabindex", () => {
    render(<Harness />);
    const list = screen.getByRole("tablist", { name: "Sections" });
    expect(list.getAttribute("aria-orientation")).toBe("horizontal");

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabAt(0).getAttribute("aria-controls")).toBe("t-panel-summary");

    const panel = screen.getByRole("tabpanel");
    expect(panel.id).toBe("t-panel-summary");
    expect(panel.getAttribute("aria-labelledby")).toBe("t-tab-summary");
    expect(panel.getAttribute("tabindex")).toBe("0");
  });

  it("arrow keys move focus and selection with wrapping; Home/End jump", () => {
    render(<Harness />);
    tabAt(0).focus();

    fireEvent.keyDown(tabAt(0), { key: "ArrowRight" });
    expect(screen.getByRole("tabpanel").textContent).toBe("panel:lenders");
    expect(document.activeElement).toBe(tabAt(1));
    expect(tabAt(1).getAttribute("tabindex")).toBe("0");
    expect(tabAt(0).getAttribute("tabindex")).toBe("-1");

    fireEvent.keyDown(tabAt(1), { key: "End" });
    expect(document.activeElement).toBe(tabAt(2));

    fireEvent.keyDown(tabAt(2), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabAt(0)); // wraps forward

    fireEvent.keyDown(tabAt(0), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabAt(2)); // wraps backward

    fireEvent.keyDown(tabAt(2), { key: "Home" });
    expect(document.activeElement).toBe(tabAt(0));
    expect(screen.getByRole("tabpanel").textContent).toBe("panel:summary");
  });

  it("vertical lists use ArrowUp/ArrowDown and ignore Left/Right", () => {
    render(<Harness orientation="vertical" />);
    expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("vertical");
    tabAt(0).focus();

    fireEvent.keyDown(tabAt(0), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabAt(0));

    fireEvent.keyDown(tabAt(0), { key: "ArrowDown" });
    expect(document.activeElement).toBe(tabAt(1));

    fireEvent.keyDown(tabAt(1), { key: "ArrowUp" });
    expect(document.activeElement).toBe(tabAt(0));
  });

  it("'both' orientation accepts all four arrow keys and omits aria-orientation", () => {
    render(<Harness orientation="both" />);
    expect(screen.getByRole("tablist").hasAttribute("aria-orientation")).toBe(false);
    tabAt(0).focus();

    fireEvent.keyDown(tabAt(0), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabAt(1));

    fireEvent.keyDown(tabAt(1), { key: "ArrowDown" });
    expect(document.activeElement).toBe(tabAt(2));

    fireEvent.keyDown(tabAt(2), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabAt(1));

    fireEvent.keyDown(tabAt(1), { key: "ArrowUp" });
    expect(document.activeElement).toBe(tabAt(0));
  });

  it("'both' orientation announces the caller's ariaOrientation instead of omitting it", () => {
    // A tablist that is actually laid out vertically (e.g. a sidebar nav
    // that reflows to a horizontal row at narrow widths) must not rely on
    // WAI-ARIA's implicit "horizontal" default for tablist — it has to say
    // "vertical" explicitly while still accepting all four arrow keys.
    render(<Harness orientation="both" ariaOrientation="vertical" />);
    expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("vertical");
    tabAt(0).focus();

    fireEvent.keyDown(tabAt(0), { key: "ArrowDown" });
    expect(document.activeElement).toBe(tabAt(1));

    fireEvent.keyDown(tabAt(1), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabAt(2));
  });

  it("clicking a tab selects it", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: "addons" }));
    expect(screen.getByRole("tabpanel").textContent).toBe("panel:addons");
    expect(tabAt(2).getAttribute("aria-selected")).toBe("true");
  });
});
