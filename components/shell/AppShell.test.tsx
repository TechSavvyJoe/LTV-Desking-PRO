import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("../../context/DealContext", () => ({
  useDealContext: () => ({
    inventory: [],
    lenderProfiles: [],
    savedDeals: [],
    settings: {},
    setSettings: vi.fn(),
    persistSettings: vi.fn(),
    setLenderProfiles: vi.fn(),
    setFocusVin: vi.fn(),
    setSearchQuery: vi.fn(),
    message: null,
    setMessage: vi.fn(),
    dataLoading: false,
    dataError: null,
    refetchData: vi.fn(),
  }),
}));

vi.mock("../../lib/pocketbase", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSuperadminDealerOverride: () => null,
  setSuperadminDealerOverride: vi.fn(),
  clearSuperadminDealerOverride: vi.fn(),
  collections: { dealers: { getOne: vi.fn().mockResolvedValue({ name: "Dealer One" }) } },
  asRecord: (r: unknown) => r,
}));

vi.mock("../../lib/api", () => ({
  getAllDealers: vi.fn().mockResolvedValue([]),
  getSystemSettings: vi.fn().mockResolvedValue({}),
  getCachedSystemSettings: () => null,
}));

vi.mock("../../lib/auth", () => ({ logout: vi.fn() }));

vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

// Lazy modals are only fetched on open; render nothing for them.
vi.mock("../SettingsModal", () => ({ default: () => null }));
vi.mock("../AiLenderManagerModal", () => ({ default: () => null }));

import { AppShell } from "./AppShell";

const userWithRole = (role: string) => ({
  id: "u1",
  email: "pat@example.com",
  firstName: "Pat",
  lastName: "Lee",
  role,
  dealer: "d1",
  expand: { dealer: { name: "Dealer One" } },
});

const renderShell = () =>
  render(
    <MemoryRouter initialEntries={["/desk"]}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route path="desk" element={<div>Desk screen</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  mocks.getCurrentUser.mockReturnValue(userWithRole("admin"));
});

afterEach(cleanup);

describe("AppShell", () => {
  it("avatar menu Search opens the palette; Escape returns focus to the account button", async () => {
    renderShell();
    const account = screen.getByRole("button", { name: "Account menu" });
    fireEvent.click(account);
    fireEvent.click(screen.getByRole("menuitem", { name: "Search" }));

    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeTruthy();
    const input = screen.getByRole("combobox");
    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
    expect(document.activeElement).toBe(account);
  });

  it("shows the rate sheet upload pill for an admin but not for sales", () => {
    const { unmount } = renderShell();
    expect(screen.getByRole("button", { name: "Upload rate sheet" })).toBeTruthy();
    unmount();

    mocks.getCurrentUser.mockReturnValue(userWithRole("sales"));
    renderShell();
    expect(screen.queryByRole("button", { name: "Upload rate sheet" })).toBeNull();
  });

  it("names the theme toggle for what it will do", () => {
    renderShell();
    const toggle = screen.getByRole("button", { name: "Switch to dark theme" });
    expect(screen.queryByRole("button", { name: "Toggle theme" })).toBeNull();
    expect(toggle.classList.contains("app-shell-icon-btn")).toBe(true);
  });

  it("gives the touch-sized header controls the shared icon-button class", () => {
    renderShell();
    expect(
      screen
        .getByRole("button", { name: "Upload rate sheet" })
        .classList.contains("app-shell-icon-btn")
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Account menu" }).classList.contains("app-shell-icon-btn")
    ).toBe(true);
  });

  it("reads nav counts with their unit", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.textContent).toContain("0 deals");
    expect(nav.textContent).toContain("0 units");
    expect(nav.textContent).toContain("0 programs");
  });

  it("shows Finance tools as a labeled primary navigation link", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.querySelector('a[href="/tools"]')?.textContent).toBe("Finance tools");
  });

  it("reopens the setup checklist from the account menu after it was hidden", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Hide setup card" }));
    expect(screen.queryByRole("region", { name: "Set up your dealership" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Setup checklist" }));
    expect(screen.getByRole("region", { name: "Set up your dealership" })).toBeTruthy();
  });

  it("scrolls only the nav to the active tab, instantly, after a route change", () => {
    const scrollTo = vi.fn();
    const scrollIntoView = vi.fn();
    const originalTo = Element.prototype.scrollTo;
    const originalInto = Element.prototype.scrollIntoView;
    Element.prototype.scrollTo = scrollTo;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderShell();
      expect(scrollTo).toHaveBeenCalledWith({ left: expect.any(Number), behavior: "instant" });
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollTo = originalTo;
      Element.prototype.scrollIntoView = originalInto;
    }
  });

  it("the ⌘K header button is a secondary action (hidden at phone widths)", () => {
    renderShell();
    const btn = screen.getByRole("button", { name: "Search and commands" });
    expect(btn.classList.contains("app-shell-secondary-action")).toBe(true);
  });
});
