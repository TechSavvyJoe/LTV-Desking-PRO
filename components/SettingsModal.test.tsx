/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_SETTINGS } from "../constants";

vi.mock("../lib/pocketbase", () => ({ getCurrentUser: () => ({ role: "admin" }) }));
vi.mock("../lib/toast", () => ({ toast: { error: vi.fn() } }));
import SettingsModal from "./SettingsModal";

describe("SettingsModal save receipts", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ providers: [], warnings: [] }) })
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("waits for a confirmed server save and guards duplicate submission and dismissal", async () => {
    let resolveWrite!: (saved: boolean) => void;
    const onSave = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveWrite = resolve;
        })
    );
    const onClose = vi.fn();
    render(<SettingsModal isOpen settings={INITIAL_SETTINGS} onClose={onClose} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSave).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => resolveWrite(true));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps edited settings available after failure and retries the same draft", async () => {
    const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onClose = vi.fn();
    render(<SettingsModal isOpen settings={INITIAL_SETTINGS} onClose={onClose} onSave={onSave} />);
    const fee = document.getElementById("settings-doc-fee") as HTMLInputElement;
    fireEvent.change(fee, { target: { value: "321" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByRole("alert")).textContent).toContain("this browser only");
    expect(onClose).not.toHaveBeenCalled();
    expect(fee.value).toBe("321");
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenNthCalledWith(2, expect.objectContaining({ docFee: 321 }));
  });

  it("does not treat a void callback or rejected request as confirmation", async () => {
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => undefined)
      .mockRejectedValueOnce(new Error("offline"));
    const onClose = vi.fn();
    render(<SettingsModal isOpen settings={INITIAL_SETTINGS} onClose={onClose} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("alert");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("still here"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
