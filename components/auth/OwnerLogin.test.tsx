/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authClear: vi.fn(),
  currentUser: vi.fn(),
  login: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("../../lib/auth", () => ({
  login: mocks.login,
}));

vi.mock("../../lib/pocketbase", () => ({
  getCurrentUser: mocks.currentUser,
  pb: { authStore: { clear: mocks.authClear } },
}));

vi.mock("../../lib/toast", () => ({
  toast: { success: mocks.toastSuccess },
}));

vi.mock("../common/AnnouncementBanner", () => ({
  AnnouncementBanner: () => null,
}));

import { OwnerLogin } from "./OwnerLogin";

const submitCredentials = () => {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: "admin@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: "ValidPassword123!" },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign in to admin console/i }));
};

describe("OwnerLogin administrative role gate", () => {
  beforeEach(() => {
    mocks.currentUser.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("admits a dealership administrator", async () => {
    const onSuccess = vi.fn();
    mocks.login.mockResolvedValue({ success: true, user: { role: "admin" } });

    render(<OwnerLogin onSuccess={onSuccess} />);
    submitCredentials();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(mocks.authClear).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Signed in to the admin console");
  });

  it("admits a platform superadmin", async () => {
    const onSuccess = vi.fn();
    mocks.login.mockResolvedValue({ success: true, user: { role: "superadmin" } });

    render(<OwnerLogin onSuccess={onSuccess} />);
    submitCredentials();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(mocks.authClear).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Signed in to the owner console");
  });

  it("clears the session and rejects a non-administrative user", async () => {
    const onSuccess = vi.fn();
    mocks.login.mockResolvedValue({ success: true, user: { role: "sales" } });

    render(<OwnerLogin onSuccess={onSuccess} />);
    submitCredentials();

    expect(
      await screen.findByText(
        "This account doesn't have admin access. Sign in with an admin account."
      )
    ).toBeTruthy();
    expect(mocks.authClear).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
