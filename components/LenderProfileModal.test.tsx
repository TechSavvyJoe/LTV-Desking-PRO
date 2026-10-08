/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LenderProfile, LenderTier } from "../types";
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
  it("lets an admin convert a sample program to verified, and saving persists it", () => {
    const onSave = vi.fn();
    const sample: LenderProfile = {
      id: "sample_1",
      name: "Sample Bank",
      bookValueSource: "Trade",
      isSample: true,
      tiers: [{ name: "Tier A", minFico: 640, maxLtv: 125, maxTerm: 84 }],
    };
    render(<LenderProfileModal profile={sample} isOpen={true} onClose={vi.fn()} onSave={onSave} />);

    expect(screen.getByRole("group", { name: "Sample program" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark program verified" }));
    expect(screen.getByRole("alert").textContent).toMatch(/source document/);
    fireEvent.change(screen.getByLabelText("Source document / version"), {
      target: { value: "Synthetic official sheet v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark program verified" }));
    expect(screen.queryByRole("group", { name: "Sample program" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save program" }));
    expect((onSave.mock.calls[0]?.[0] as LenderProfile).isSample).toBe(false);
    expect((onSave.mock.calls[0]?.[0] as LenderProfile).verifiedAt).toMatch(/^\d{4}-\d{2}/);
  });

  it("shows no sample notice for a verified program", () => {
    render(
      <LenderProfileModal
        profile={flaggedProfile}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(screen.queryByRole("group", { name: "Sample program" })).toBeNull();
  });

  it("holds a changed reviewed program and refuses verification after explicit expiry", () => {
    const onSave = vi.fn();
    render(
      <LenderProfileModal
        profile={{
          ...flaggedProfile,
          tiers: [{ name: "Tier A", minFico: 600 }],
          sourceReference: "Synthetic sheet",
          verifiedAt: "2026-01-01T00:00:00Z",
        }}
        isOpen={true}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    fireEvent.change(screen.getByLabelText("Valid through (if specified)"), {
      target: { value: "2000-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark program verified" }));
    expect(screen.getByRole("alert").textContent).toMatch(/expired/);
    fireEvent.click(screen.getByRole("button", { name: "Save program" }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ reviewRequired: true, verifiedAt: "" });
  });

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

    fireEvent.click(screen.getByRole("button", { name: "Save program" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Save program" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Save program" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]?.[0] as LenderProfile;
    expect(saved.tiers?.[0]?.needsReview).toBeFalsy();
    expect(saved.tiers?.[0]?.rangeFlags).toBeFalsy();
  });

  // Realistic server output: the implausible values were DROPPED, so the
  // flagged fields are empty. [ai-range-guard]
  const profileWith = (tier: LenderTier): LenderProfile => ({ ...flaggedProfile, tiers: [tier] });
  const renderModal = (profile: LenderProfile) => {
    const onSave = vi.fn();
    render(
      <LenderProfileModal profile={profile} isOpen={true} onClose={vi.fn()} onSave={onSave} />
    );
    const save = (): LenderTier | undefined => {
      fireEvent.click(screen.getByRole("button", { name: "Save program" }));
      return (onSave.mock.calls.at(-1)?.[0] as LenderProfile | undefined)?.tiers?.[0];
    };
    return { save };
  };
  const input = (name: string) => {
    const el = document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
    expect(el).toBeTruthy();
    return el as HTMLInputElement;
  };
  const markVerified = () =>
    screen.getByRole("button", { name: "Mark verified" }) as HTMLButtonElement;

  it("keeps the hold on a two-flag tier when only one flagged field is fixed", () => {
    const { save } = renderModal(
      profileWith({
        name: "Tier B",
        maxTerm: 72,
        needsReview: true,
        rangeFlags: ["minFico=6600 outside 300-850", "maxLtv=1500 outside 20-200"],
      })
    );

    fireEvent.click(screen.getByText("72mo"));
    fireEvent.change(input("maxLtv"), { target: { value: "130" } });

    // The warning stays, now naming only the field still missing.
    expect(screen.getByText(/Needs review:/).textContent).toContain("minFico");
    expect(screen.getByText(/Needs review:/).textContent).not.toContain("maxLtv");

    const saved = save();
    expect(saved?.maxLtv).toBe(130);
    expect(saved?.needsReview).toBe(true);
    expect(saved?.rangeFlags).toEqual(["minFico=6600 outside 300-850"]);
  });

  it("keeps the hold when a flagged field is typed into and then cleared", () => {
    const { save } = renderModal(
      profileWith({
        name: "Tier B",
        maxTerm: 72,
        needsReview: true,
        rangeFlags: ["maxLtv=1500 outside 20-200"],
      })
    );

    fireEvent.click(screen.getByText("72mo"));
    fireEvent.change(input("maxLtv"), { target: { value: "1" } });
    expect(screen.queryByText(/Needs review:/)).toBeNull();
    fireEvent.change(input("maxLtv"), { target: { value: "" } });
    expect(screen.getByText(/Needs review:/)).toBeTruthy();

    const saved = save();
    expect(saved?.maxLtv).toBeUndefined();
    expect(saved?.needsReview).toBe(true);
    expect(saved?.rangeFlags).toEqual(["maxLtv=1500 outside 20-200"]);
  });

  it("disables Mark verified until every flagged field holds a number", () => {
    const { save } = renderModal(
      profileWith({
        name: "Tier B",
        maxTerm: 72,
        maxLtv: 125,
        needsReview: true,
        rangeFlags: ["maxLtv=1500 outside 20-200", "minFico=6600 outside 300-850"],
      })
    );

    expect(markVerified().disabled).toBe(true);
    expect(screen.getByText(/Enter min FICO first/)).toBeTruthy();
    fireEvent.click(markVerified());
    expect(save()?.needsReview).toBe(true);

    fireEvent.click(screen.getByText("72mo"));
    fireEvent.change(input("minFico"), { target: { value: "660" } });

    // minFico's flag lifted itself; the remaining flagged field (maxLtv) holds
    // a number, so verifying can no longer leave a limit blank.
    expect(markVerified().disabled).toBe(false);
    expect(screen.queryByText(/first — a verified tier/)).toBeNull();
    fireEvent.click(markVerified());

    const saved = save();
    expect(saved?.needsReview).toBeFalsy();
    expect(saved?.rangeFlags).toBeFalsy();
    expect(saved?.minFico).toBe(660);
    expect(saved?.maxLtv).toBe(125);
  });

  it("offers an input for a flagged field the card has no editor for", () => {
    const { save } = renderModal(
      profileWith({
        name: "Tier C",
        maxTerm: 72,
        maxLtv: 120,
        needsReview: true,
        rangeFlags: ["frontEndLtv=1.1 outside 20-200"],
      })
    );

    expect(markVerified().disabled).toBe(true);
    fireEvent.click(screen.getByText("72mo"));
    fireEvent.change(input("frontEndLtv"), { target: { value: "110" } });

    // The input stays mounted after its flag resolves (no focus loss mid-typing).
    expect(input("frontEndLtv").value).toBe("110");
    const saved = save();
    expect(saved?.frontEndLtv).toBe(110);
    expect(saved?.needsReview).toBeFalsy();
    expect(saved?.rangeFlags).toBeFalsy();
  });
});
