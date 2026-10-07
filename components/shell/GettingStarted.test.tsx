import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GettingStarted } from "./GettingStarted";

const base = {
  dealerId: "d1",
  inventoryCount: 0,
  lenderCount: 0,
  savedDealCount: 0,
  canManageSetup: true,
  onImportInventory: vi.fn(),
  onAddLenders: vi.fn(),
  onDeskDeal: vi.fn(),
};

/** jsdom has no matchMedia; stub the one query GettingStarted asks about. */
const stubCompact = (compact: boolean) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: compact && query.includes("1199px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("GettingStarted [takeover: activation]", () => {
  it("lists the three setup steps as one-click actions when nothing is set up", () => {
    render(<GettingStarted {...base} />);
    expect(screen.getByRole("region", { name: "Set up your dealership" })).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");

    fireEvent.click(screen.getByRole("button", { name: "Import inventory" }));
    expect(base.onImportInventory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Upload a rate sheet" }));
    expect(base.onAddLenders).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Search inventory" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Hide setup card" }));
    expect(screen.queryByRole("region")).toBeNull();
    first.unmount();

    render(<GettingStarted {...base} />);
    expect(screen.queryByRole("region")).toBeNull();
    cleanup();

    render(<GettingStarted {...base} dealerId="d2" />);
    expect(screen.getByRole("region", { name: "Set up your dealership" })).toBeTruthy();
  });

  it("shows non-admins only the step they can act on", () => {
    render(<GettingStarted {...base} canManageSetup={false} />);
    expect(screen.queryByRole("button", { name: "Import inventory" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Upload a rate sheet" })).toBeNull();
    // The admin-only steps are gone, not just their buttons.
    expect(screen.queryByText("Import your inventory")).toBeNull();
    expect(screen.queryByText("Load your lender programs")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText(/Desk and save your first deal/)).toBeTruthy();
    expect(screen.getByText(/your admin is finishing the rest of setup/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Search inventory" }));
    expect(base.onDeskDeal).toHaveBeenCalledTimes(1);
    expect(base.onImportInventory).not.toHaveBeenCalled();
    expect(base.onAddLenders).not.toHaveBeenCalled();
  });

  it("renders nothing for a non-admin who has no step left to take", () => {
    const { container } = render(
      <GettingStarted {...base} canManageSetup={false} savedDealCount={1} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("keeps the full checklist open on wide screens", () => {
    stubCompact(false);
    render(<GettingStarted {...base} />);
    expect(screen.queryByRole("button", { name: "Show steps" })).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("starts as a one-line strip at tablet/phone widths and expands on demand", () => {
    stubCompact(true);
    render(<GettingStarted {...base} />);
    expect(screen.getByRole("region", { name: "Set up your dealership" })).toBeTruthy();
    expect(screen.getByText("0 of 3 done")).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show steps" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Search inventory" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide steps" }));
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.getByRole("button", { name: "Show steps" })).toBeTruthy();
  });

  it("keeps keyboard focus on the toggle when the steps expand and collapse", () => {
    stubCompact(true);
    render(<GettingStarted {...base} />);
    const toggle = screen.getByRole("button", { name: "Show steps" });
    toggle.focus();
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(toggle);
    const hide = screen.getByRole("button", { name: "Hide steps" });
    expect(document.activeElement).toBe(hide);
    expect(hide.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(hide);
    const show = screen.getByRole("button", { name: "Show steps" });
    expect(document.activeElement).toBe(show);
    expect(show.getAttribute("aria-expanded")).toBe("false");
  });
});
