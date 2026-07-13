/**
 * @vitest-environment jsdom
 */

import { fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFocusTrap, useKeyboardShortcuts } from "./useKeyboard";

describe("useKeyboardShortcuts", () => {
  it("invokes a plain Escape shortcut exactly once", () => {
    const onEscape = vi.fn();
    renderHook(() => useKeyboardShortcuts({ escape: onEscape }));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("normalizes Command and Control shortcuts", () => {
    const onSave = vi.fn();
    renderHook(() => useKeyboardShortcuts({ "ctrl+s": onSave }));

    fireEvent.keyDown(window, { key: "s", metaKey: true });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("does not invoke shortcuts while disabled", () => {
    const onEscape = vi.fn();
    renderHook(() => useKeyboardShortcuts({ escape: onEscape }, false));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onEscape).not.toHaveBeenCalled();
  });
});

describe("useFocusTrap", () => {
  let container: HTMLDivElement;

  const makeButton = (label: string) => {
    const button = document.createElement("button");
    button.textContent = label;
    container.appendChild(button);
    return button;
  };

  afterEach(() => {
    container?.remove();
  });

  it("focuses the first focusable element on activation and wraps Tab", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const first = makeButton("first");
    const last = makeButton("last");

    renderHook(() => useFocusTrap({ current: container }, true));

    expect(document.activeElement).toBe(first);

    // Tab from the last element wraps to the first
    last.focus();
    fireEvent.keyDown(container, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    // Shift+Tab from the first element wraps to the last
    fireEvent.keyDown(container, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("includes elements added after activation in the Tab cycle", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const first = makeButton("first");
    makeButton("middle");

    renderHook(() => useFocusTrap({ current: container }, true));
    expect(document.activeElement).toBe(first);

    // Simulate content mounting later (e.g. a PDF-status link inside a modal).
    const added = makeButton("added-later");

    // The trap must treat the late-added element as the new last stop:
    // Shift+Tab from the first element wraps to it...
    fireEvent.keyDown(container, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(added);

    // ...and Tab from it wraps back to the first element.
    fireEvent.keyDown(container, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });
});
