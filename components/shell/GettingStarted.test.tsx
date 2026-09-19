import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GettingStarted } from "./GettingStarted";

const base = {
  dealerId: "d1",
  inventoryCount: 0,
  lenderCount: 0,
  savedDealCount: 0,
  onImportInventory: vi.fn(),
  onAddLenders: vi.fn(),
  onDeskDeal: vi.fn(),
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GettingStarted [takeover: activation]", () => {
  it("lists the three setup steps as one-click actions when nothing is set up", () => {
    render(<GettingStarted {...base} />);
    expect(screen.getByRole("region", { name: "Set up your dealership" })).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");

    fireEvent.click(screen.getByRole("button", { name: "Import inventory" }));
    expect(base.onImportInventory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "AI Lender Upload" }));
    expect(base.onAddLenders).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Go to the desk" }));
    expect(base.onDeskDeal).toHaveBeenCalledTimes(1);
  });

  it("marks finished steps done, drops their action, and advances the progress bar", () => {
    render(<GettingStarted {...base} inventoryCount={12} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
    expect(screen.queryByRole("button", { name: "Import inventory" })).toBeNull();
    expect(screen.getByText(/1 of 3 done/)).toBeTruthy();
    expect(screen.getByText(/Done:/).textContent).toBe("Done: ");
  });

  it("disappears once every step is complete", () => {
    const { container } = render(
      <GettingStarted {...base} inventoryCount={1} lenderCount={1} savedDealCount={1} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("Hide persists for that dealer only", () => {
    const first = render(<GettingStarted {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("region")).toBeNull();
    first.unmount();

    render(<GettingStarted {...base} />);
    expect(screen.queryByRole("region")).toBeNull();
    cleanup();

    render(<GettingStarted {...base} dealerId="d2" />);
    expect(screen.getByRole("region", { name: "Set up your dealership" })).toBeTruthy();
  });
});
