import React, { useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pb, setSuperadminDealerOverride } from "./lib/pocketbase";
import App from "./App";

vi.mock("./lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/auth")>()),
  refreshSession: vi.fn(async () => true),
}));
vi.mock("./lib/analytics", () => ({ identify: vi.fn() }));
vi.mock("./components/shell/AppShell", () => ({ default: () => <Outlet /> }));
vi.mock("./components/desk/DeskScreen", () => ({ default: () => <div>Desk</div> }));
vi.mock("./components/auth/Login", () => ({ Login: () => <div>Sign in</div> }));
vi.mock("./context/DealContext", () => ({
  DealProvider: ({ children }: { children: ReactNode }) => {
    const [draft, setDraft] = useState("");
    return (
      <>
        <input
          aria-label="Private draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {children}
      </>
    );
  },
  useDealContext: vi.fn(),
}));

const token = "test." + btoa(JSON.stringify({ exp: 4_000_000_000 })) + ".test";
const identity = (id: string, role: string, dealer = "dealer-a") =>
  pb.authStore.save(token, { id, role, dealer, collectionId: "users", collectionName: "users" });

afterEach(() => {
  cleanup();
  pb.authStore.clear();
  localStorage.clear();
  sessionStorage.clear();
});

describe("mounted app private session state", () => {
  it.each([
    ["same-user", "sales", "dealer-a"],
    ["next-user", "manager", "dealer-a"],
    ["same-user", "manager", "dealer-b"],
  ])("resets in-memory drafts on identity change %s/%s/%s", async (id, role, dealer) => {
    identity("same-user", "manager");
    render(
      <MemoryRouter initialEntries={["/desk"]}>
        <App />
      </MemoryRouter>
    );
    fireEvent.change(await screen.findByLabelText("Private draft"), {
      target: { value: "manager private notes" },
    });
    act(() => identity(id, role, dealer));
    expect((screen.getByLabelText("Private draft") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Desk")).toBeTruthy();
  });

  it("keeps the mounted draft for same-identity token refresh", async () => {
    identity("same-user", "manager");
    render(
      <MemoryRouter initialEntries={["/desk"]}>
        <App />
      </MemoryRouter>
    );
    fireEvent.change(await screen.findByLabelText("Private draft"), {
      target: { value: "current notes" },
    });
    act(() => identity("same-user", "manager"));
    expect((screen.getByLabelText("Private draft") as HTMLInputElement).value).toBe(
      "current notes"
    );
  });

  it("resets private state when an owner switches dealerships, preserving a same-dealer selection", async () => {
    identity("owner", "superadmin", "");
    setSuperadminDealerOverride("dealer-a");
    render(
      <MemoryRouter initialEntries={["/desk"]}>
        <App />
      </MemoryRouter>
    );
    fireEvent.change(await screen.findByLabelText("Private draft"), {
      target: { value: "dealer-a notes" },
    });
    act(() => setSuperadminDealerOverride("dealer-a"));
    expect((screen.getByLabelText("Private draft") as HTMLInputElement).value).toBe(
      "dealer-a notes"
    );
    act(() => setSuperadminDealerOverride("dealer-b"));
    expect((screen.getByLabelText("Private draft") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Desk")).toBeTruthy();
  });

  it("returns to sign-in after 401 and truthfully reports purged browser drafts", async () => {
    identity("same-user", "manager");
    render(
      <MemoryRouter initialEntries={["/desk"]}>
        <App />
      </MemoryRouter>
    );
    await screen.findByLabelText("Private draft");
    await act(async () => {
      await pb.afterSend!(new Response("{}", { status: 401 }), {});
    });
    expect(screen.queryByLabelText("Private draft")).toBeNull();
    expect(screen.getByText("Sign in")).toBeTruthy();
    expect(
      screen.getByText("Your session ended. Sign in again. Private browser drafts were cleared.")
    ).toBeTruthy();
  });
});
