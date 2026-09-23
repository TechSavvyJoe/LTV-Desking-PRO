/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LenderProfile } from "../types";
import LenderProfileModal from "./LenderProfileModal";

afterEach(() => {
  cleanup();
});

const flaggedProfile: LenderProfile = {
  id: "lender_1",
  name: "Test Bank",
  bookValueSource: "Trade",
  minIncome: 0,
  maxPti: 0,
  tiers: [
    {
      name: "Tier A",
      minFico: 600,
      maxLtv: 125,
      maxTerm: 72,
      needsReview: true,
      rangeFlags: ["maxLtv=1500 outside 20-200"],
    },
  ],
};

describe("LenderProfileModal", () => {
  it("shows a warning row for a tier flagged by the AI extraction", () => {
    render(
      <LenderProfileModal
        profile={flaggedProfile}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText(/Needs review:/)).toBeTruthy();
    expect(screen.getByText(/maxLtv=1500 outside 20-200/)).toBeTruthy();
    expect(screen.getByText(/Edit the flagged field or mark it verified\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark verified" })).toBeTruthy();
  });

  it("clears needsReview/rangeFlags when the flagged field is edited", () => {
    const onSave = vi.fn();
    render(
      <LenderProfileModal
        profile={flaggedProfile}
        isOpen={true}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    // Expand the tier to access its fields (click the header, not the name
    // input itself — the input stops propagation of its own clicks).
    fireEvent.click(screen.getByText(/FICO 600/));

    const maxLtvInput = document.querySelector('input[name="maxLtv"]') as HTMLInputElement;
    expect(maxLtvInput).toBeTruthy();
    fireEvent.change(maxLtvInput, { target: { value: "130" } });

    fireEvent.click(screen.getByRole("button", { name: "Save Lender" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]?.[0] as LenderProfile;
    expect(saved.tiers?.[0]?.needsReview).toBeFalsy();
    expect(saved.tiers?.[0]?.rangeFlags).toBeFalsy();
    expect(saved.tiers?.[0]?.maxLtv).toBe(130);
  });

  it("does not clear needsReview/rangeFlags when an unrelated field is edited", () => {
    const onSave = vi.fn();
    render(
      <LenderProfileModal
        profile={flaggedProfile}
        isOpen={true}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    fireEvent.change(nameInput, { target: { value: "Tier A Renamed" } });

    fireEvent.click(screen.getByRole("button", { name: "Save Lender" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]?.[0] as LenderProfile;
    expect(saved.tiers?.[0]?.needsReview).toBe(true);
    expect(saved.tiers?.[0]?.rangeFlags).toEqual(["maxLtv=1500 outside 20-200"]);
  });

  it("clears needsReview/rangeFlags when Mark verified is clicked", () => {
    const onSave = vi.fn();
    render(
      <LenderProfileModal
        profile={flaggedProfile}
        isOpen={true}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark verified" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Lender" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]?.[0] as LenderProfile;
    expect(saved.tiers?.[0]?.needsReview).toBeFalsy();
    expect(saved.tiers?.[0]?.rangeFlags).toBeFalsy();
  });
});
