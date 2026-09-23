import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { CommandPalette, useCommandPaletteHotkey } from "./CommandPalette";
import type { PaletteItem } from "./CommandPalette";

afterEach(cleanup);

const makeItems = () => {
  const spies = {
    desk: vi.fn(),
    pipeline: vi.fn(),
    deal: vi.fn(),
    vehicle: vi.fn(),
  };
  const items: PaletteItem[] = [
    { id: "nav-desk", label: "The Desk", group: "Go to", onSelect: spies.desk },
    { id: "nav-pipeline", label: "Pipeline", group: "Go to", onSelect: spies.pipeline },
    {
      id: "deal-1",
      label: "Maria Lopez",
      detail: "2021 Honda Civic · STK 4402",
      keywords: ["4402", "1HGCV1F3XMA000000"],
      group: "Saved deals",
      onSelect: spies.deal,
    },
    {
      id: "veh-1",
      label: "2020 Toyota Camry SE",
      detail: "STK 9911",
      keywords: ["9911"],
      group: "Inventory",
      onSelect: spies.vehicle,
    },
  ];
  return { items, spies };
};

const optionLabels = () =>
  screen.getAllByRole("option").map((el) => el.querySelector("span > span")?.textContent);

describe("CommandPalette [takeover-P1 #8]", () => {
  it("renders nothing while closed", () => {
    const { items } = makeItems();
    render(<CommandPalette open={false} onClose={() => {}} items={items} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists every item grouped, marks the first active, and focuses the search box", async () => {
    const { items } = makeItems();
    render(<CommandPalette open onClose={() => {}} items={items} />);

    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Go to" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Saved deals" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Inventory" })).toBeTruthy();

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(4);
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");
    expect(options[1]?.getAttribute("aria-selected")).toBe("false");

    const input = screen.getByRole("combobox");
    await waitFor(() => expect(document.activeElement).toBe(input));
    // Roving active descendant points at the highlighted option.
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0]?.id);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    // Lenders aren't indexed, so the default prompt must not promise them.
    expect(input.getAttribute("placeholder")).toBe(
      "Search deals and vehicles — or jump to a screen…"
    );
  });

  it("matches on label, keywords (stock/VIN) and detail — label prefix ranks first", () => {
    const { items } = makeItems();
    render(<CommandPalette open onClose={() => {}} items={items} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "4402" } });
    expect(optionLabels()).toEqual(["Maria Lopez"]);

    fireEvent.change(input, { target: { value: "1hgcv" } });
    expect(optionLabels()).toEqual(["Maria Lopez"]);

    fireEvent.change(input, { target: { value: "camry" } });
    expect(optionLabels()).toEqual(["2020 Toyota Camry SE"]);

    // "pi" is a label prefix for Pipeline; nothing else should outrank it.
    fireEvent.change(input, { target: { value: "pi" } });
    expect(optionLabels()[0]).toBe("Pipeline");
  });

  it("empty state: announced as a status outside any listbox, combobox collapsed", () => {
    const { items } = makeItems();
    render(<CommandPalette open onClose={() => {}} items={items} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "zzz" } });

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    // A listbox with no options fails aria-required-children, so none renders.
    expect(screen.queryByRole("listbox")).toBeNull();
    const message = screen.getByText(/No matches for “zzz”/);
    expect(message.closest('[role="listbox"]')).toBeNull();
    expect(message.closest('[role="status"]')).toBe(screen.getByRole("status"));
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.hasAttribute("aria-controls")).toBe(false);
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);

    // Results coming back re-create and re-link the listbox; the status empties.
    fireEvent.change(input, { target: { value: "" } });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("keyboard: arrows move the highlight, Enter runs the item and closes, Escape closes", () => {
    const { items, spies } = makeItems();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} items={items} />);
    const input = screen.getByRole("combobox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]?.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(input, { key: "End" });
    expect(screen.getAllByRole("option")[3]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "Home" });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    fireEvent.keyDown(input, { key: "Enter" });
    expect(spies.pipeline).toHaveBeenCalledTimes(1);
    expect(spies.desk).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("ArrowDown with no results still highlights the first row once results arrive", () => {
    const { items } = makeItems();
    const { rerender } = render(<CommandPalette open onClose={() => {}} items={[]} />);
    const input = screen.getByRole("combobox");

    // Inventory hasn't loaded yet; the user arrows down on an empty list.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);

    // Items refresh without any typing; the first row must be active again.
    rerender(<CommandPalette open onClose={() => {}} items={items} />);
    const options = screen.getAllByRole("option");
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0]?.id);
  });

  it("handles keys wherever focus sits inside the dialog, not only on the input", () => {
    const { items } = makeItems();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} items={items} />);

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]?.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(screen.getAllByRole("option")[0]!, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("consumes the keys it handles so window-level shortcuts and dialogs underneath don't also fire", () => {
    const windowKeys = vi.fn();
    window.addEventListener("keydown", windowKeys);
    try {
      const { items } = makeItems();
      render(<CommandPalette open onClose={() => {}} items={items} />);
      const input = screen.getByRole("combobox");

      for (const key of ["ArrowDown", "ArrowUp", "End", "Home", "Enter", "Escape"]) {
        fireEvent.keyDown(input, { key });
      }
      expect(windowKeys).not.toHaveBeenCalled();

      // Keys the palette ignores still bubble (e.g. the ⌘K chord itself).
      fireEvent.keyDown(input, { key: "k", metaKey: true });
      expect(windowKeys).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", windowKeys);
    }
  });

  it("returns focus to the element that opened it when closed with Escape", () => {
    const { items } = makeItems();
    const Host: React.FC = () => {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open palette
          </button>
          <CommandPalette open={open} onClose={() => setOpen(false)} items={items} />
        </>
      );
    };
    render(<Host />);
    const trigger = screen.getByRole("button", { name: "Open palette" });
    trigger.focus();
    fireEvent.click(trigger);

    const input = screen.getByRole("combobox");
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("focus-restore survives the opener unmounting in the same commit the palette mounts [WCAG 2.4.3, mechanism-level]", () => {
    // This is NOT a regression test for AppShell's own fix (AppShell.tsx:832):
    // it builds its own Host harness that already calls
    // `accountRef.current?.focus()` before setMenuOpen/setPaletteOpen, so it
    // cannot fail against a build of AppShell.tsx that omits that call. What
    // it does verify is the underlying mechanism CommandPalette + useRestoreFocus
    // rely on: when the element that opened the palette is focused *before* the
    // state batch that unmounts it and mounts CommandPalette, useRestoreFocus
    // correctly captures that still-mounted element (not <body>) and Escape
    // returns focus there. AppShell.tsx's own gating/ordering has no test in
    // this unit's file set — a real AppShell-level regression test (or a
    // CommandPalette `returnFocusRef` prop + test) needs a file outside the
    // allowed set for this unit, so that coverage is reported as blocked, not
    // claimed here.
    const { items } = makeItems();
    const Host: React.FC = () => {
      const [menuOpen, setMenuOpen] = React.useState(true);
      const [paletteOpen, setPaletteOpen] = React.useState(false);
      const accountRef = React.useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={accountRef} type="button">
            Account
          </button>
          {menuOpen && (
            <button
              type="button"
              onClick={() => {
                accountRef.current?.focus();
                setMenuOpen(false);
                setPaletteOpen(true);
              }}
            >
              Search
            </button>
          )}
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={items} />
        </>
      );
    };
    render(<Host />);
    const account = screen.getByRole("button", { name: "Account" });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
    const input = screen.getByRole("combobox");
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(account);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("keeps DOM focus on the input: options are not Tab stops and clicks don't steal focus", () => {
    const { items } = makeItems();
    render(<CommandPalette open onClose={() => {}} items={items} />);
    const input = screen.getByRole("combobox");
    expect(document.activeElement).toBe(input);

    for (const option of screen.getAllByRole("option")) expect(option.tabIndex).toBe(-1);

    // The focus trap skips tabindex="-1", leaving the input as its only stop,
    // so Tab and Shift+Tab are both held on it instead of landing on an option.
    expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(false);
    expect(fireEvent.keyDown(input, { key: "Tab", shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(input);

    // mousedown is cancelled so clicking an option never blurs the input.
    expect(fireEvent.mouseDown(screen.getAllByRole("option")[2]!)).toBe(false);
    // Nor does clicking non-focusable chrome (group headings, listbox padding,
    // footer hints): focus would drop to <body>, where Escape never reaches the
    // palette and desk shortcuts fire behind the scrim.
    expect(fireEvent.mouseDown(screen.getByRole("group", { name: "Go to" }))).toBe(false);
    expect(fireEvent.mouseDown(screen.getByRole("listbox"))).toBe(false);
    expect(fireEvent.mouseDown(screen.getByText("navigate"))).toBe(false);
    // The input itself keeps its native mousedown (caret placement, selection).
    expect(fireEvent.mouseDown(input)).toBe(true);
  });

  it("scrolls the keyboard-highlighted option into view", () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
    try {
      const { items } = makeItems();
      render(<CommandPalette open onClose={() => {}} items={items} />);
      scrollIntoView.mockClear();

      fireEvent.keyDown(screen.getByRole("combobox"), { key: "End" });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(screen.getAllByRole("option")[3]);
    } finally {
      if (original) Object.defineProperty(Element.prototype, "scrollIntoView", original);
      else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it("hover follows real pointer movement only, not events synthesized by scrolling", () => {
    const { items } = makeItems();
    render(<CommandPalette open onClose={() => {}} items={items} />);
    const selected = () =>
      screen.getAllByRole("option").map((o) => o.getAttribute("aria-selected") === "true");

    // The first move after opening only records where the pointer rests.
    fireEvent.mouseMove(screen.getAllByRole("option")[2]!, { clientX: 40, clientY: 90 });
    expect(selected()).toEqual([true, false, false, false]);
    fireEvent.mouseMove(screen.getAllByRole("option")[2]!, { clientX: 42, clientY: 91 });
    expect(selected()).toEqual([false, false, true, false]);

    // Arrow keys scroll rows under the resting cursor; the browser's synthetic
    // mousemove at the same coordinates must not steal the highlight back.
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "End" });
    fireEvent.mouseMove(screen.getAllByRole("option")[1]!, { clientX: 42, clientY: 91 });
    expect(selected()).toEqual([false, false, false, true]);
  });

  it("mouse: clicking an option runs it and closes", () => {
    const { items, spies } = makeItems();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} items={items} />);
    fireEvent.click(screen.getByRole("option", { name: /Maria Lopez/ }));
    expect(spies.deal).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("⌘K / Ctrl+K opens; other modifier combos and a bare K are ignored", () => {
    const onOpen = vi.fn();
    const Host: React.FC = () => {
      useCommandPaletteHotkey(onOpen);
      return null;
    };
    render(<Host />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.keyDown(window, { key: "K", ctrlKey: true });
    expect(onOpen).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: "k", metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true, altKey: true });
    fireEvent.keyDown(window, { key: "k" });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("⌘K does not open over another modal dialog, but the palette never blocks itself", () => {
    const onOpen = vi.fn();
    const Host: React.FC<{ other?: "dialog" | "alertdialog"; paletteOpen?: boolean }> = ({
      other,
      paletteOpen = false,
    }) => {
      useCommandPaletteHotkey(onOpen);
      return (
        <>
          {other && <div role={other} aria-modal="true" aria-label="Underneath" />}
          <CommandPalette open={paletteOpen} onClose={() => {}} items={[]} />
        </>
      );
    };
    const { rerender } = render(<Host other="dialog" />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    rerender(<Host other="alertdialog" />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(onOpen).not.toHaveBeenCalled();

    rerender(<Host paletteOpen />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
