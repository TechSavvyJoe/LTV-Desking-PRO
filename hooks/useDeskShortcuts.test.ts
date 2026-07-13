/**
 * @vitest-environment jsdom
 */

import { fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDeskShortcuts } from "./useDeskShortcuts";

describe("useDeskShortcuts", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens shortcuts help on ? and closes on Escape", () => {
    const onOpenShortcutsHelp = vi.fn();
    const onCloseShortcutsHelp = vi.fn();
    const { rerender } = renderHook(
      (props: { open: boolean }) =>
        useDeskShortcuts({
          orderedVins: ["vin-a"],
          focusedVin: "vin-a",
          onFocusVin: vi.fn(),
          onToggleCompare: vi.fn(),
          isModalOpen: false,
          shortcutsHelpOpen: props.open,
          onOpenShortcutsHelp,
          onCloseShortcutsHelp,
        }),
      { initialProps: { open: false } }
    );

    fireEvent.keyDown(window, { key: "?" });
    expect(onOpenShortcutsHelp).toHaveBeenCalledTimes(1);

    rerender({ open: true });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCloseShortcutsHelp).toHaveBeenCalledTimes(1);
  });

  it("saves with Cmd/Ctrl+S when a save handler is provided", () => {
    const onSaveDeal = vi.fn();
    renderHook(() =>
      useDeskShortcuts({
        orderedVins: ["vin-a"],
        focusedVin: "vin-a",
        onFocusVin: vi.fn(),
        onToggleCompare: vi.fn(),
        isModalOpen: false,
        onSaveDeal,
      })
    );

    fireEvent.keyDown(window, { key: "s", metaKey: true });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(onSaveDeal).toHaveBeenCalledTimes(2);
  });

  it("navigates inventory with arrow keys and toggles compare with c", () => {
    const onFocusVin = vi.fn();
    const onToggleCompare = vi.fn();
    renderHook(() =>
      useDeskShortcuts({
        orderedVins: ["vin-a", "vin-b"],
        focusedVin: "vin-a",
        onFocusVin,
        onToggleCompare,
        isModalOpen: false,
      })
    );

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(onFocusVin).toHaveBeenCalledWith("vin-b");

    fireEvent.keyDown(window, { key: "c" });
    expect(onToggleCompare).toHaveBeenCalledWith("vin-a");
  });

  it("focuses desk search on /", () => {
    const input = document.createElement("input");
    input.id = "desk-search";
    document.body.appendChild(input);

    renderHook(() =>
      useDeskShortcuts({
        orderedVins: [],
        focusedVin: null,
        onFocusVin: vi.fn(),
        onToggleCompare: vi.fn(),
        isModalOpen: false,
      })
    );

    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(input);
  });

  it("ignores shortcuts while typing or when the modal is open", () => {
    const onFocusVin = vi.fn();
    const onSaveDeal = vi.fn();
    renderHook(() =>
      useDeskShortcuts({
        orderedVins: ["vin-a"],
        focusedVin: "vin-a",
        onFocusVin,
        onToggleCompare: vi.fn(),
        isModalOpen: true,
        onSaveDeal,
      })
    );

    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(onFocusVin).not.toHaveBeenCalled();
    expect(onSaveDeal).not.toHaveBeenCalled();
  });
});
