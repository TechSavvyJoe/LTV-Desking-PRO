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

  it("shows a helpful empty state when nothing matches", () => {
    const { items } = makeItems();
    render(<CommandPalette open onClose={() => {}} items={items} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/No matches for “zzz”/)).toBeTruthy();
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
});
