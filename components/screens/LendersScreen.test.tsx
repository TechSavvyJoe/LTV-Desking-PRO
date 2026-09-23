/**
 * @vitest-environment jsdom
 */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LenderProfile, LenderTier } from "../../types";

const mocks = vi.hoisted(() => ({
  role: "sales",
  profiles: [] as LenderProfile[],
  focusVin: null as string | null,
  /** Every lender list the screen wrote through setLenderProfiles. */
  writes: [] as LenderProfile[][],
  openAiUpload: vi.fn(),
  updateLenderProfile: vi.fn(async () => ({})),
}));

vi.mock("react-router-dom", () => ({
  useOutletContext: () => ({ openAiUpload: mocks.openAiUpload }),
}));

vi.mock("../../lib/pocketbase", () => ({
  getCurrentUser: () => ({ role: mocks.role }),
}));

vi.mock("../../lib/api", () => ({
  updateLenderProfile: mocks.updateLenderProfile,
}));

vi.mock("../../lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../../lib/queryClient", () => ({
  currentDealerQueryKeys: () => ({ lenderProfiles: ["lenderProfiles"] }),
  queryClient: { setQueryData: vi.fn(), invalidateQueries: vi.fn() },
  queryKeys: { lenderProfiles: ["lenderProfiles"] },
}));

vi.mock("../../context/DealContext", async () => {
  const { useState } = await import("react");
  const vehicle = {
    vin: "V1",
    vehicle: "2021 Camry",
    modelYear: 2021,
    mileage: 20000,
    price: 22000,
    jdPower: 21000,
    jdPowerRetail: 23000,
    amountToFinance: 20000,
    monthlyPayment: 400,
    frontEndLtv: 95,
    otdLtv: 95,
  };
  return {
    useDealContext: () => {
      const [profiles, setProfiles] = useState<LenderProfile[]>(mocks.profiles);
      return {
        dealData: { loanTerm: 72, downPayment: 0, backendProducts: 0, interestRate: 9 },
        filters: { creditScore: 520, monthlyIncome: 5000 },
        safeLenderProfiles: profiles,
        setLenderProfiles: (
          update: LenderProfile[] | ((prev: LenderProfile[]) => LenderProfile[])
        ) => {
          setProfiles((prev) => {
            const next = typeof update === "function" ? update(prev) : update;
            mocks.writes.push(next);
            return next;
          });
        },
        processedInventory: [vehicle],
        unitsPerLender: {},
        focusVin: mocks.focusVin,
        activeVehicle: null,
        refetchData: vi.fn(),
      };
    },
  };
});

import { LendersScreen } from "./LendersScreen";

afterEach(() => {
  cleanup();
  mocks.writes = [];
  mocks.focusVin = null;
});

const flaggedLender = (): LenderProfile => ({
  id: "L1",
  name: "Bank A",
  bookValueSource: "Trade",
  tiers: [
    {
      name: "Tier A",
      maxTerm: 84,
      maxLtv: 130,
      needsReview: true,
      rangeFlags: ["minFico=6600 outside 300-850", "baseInterestRate=649 outside 0-40"],
    },
  ],
});

const lastWrittenTier = (): LenderTier | undefined => mocks.writes.at(-1)?.[0]?.tiers?.[0];

const openLender = (name: string) =>
  fireEvent.click(screen.getByRole("row", { name: new RegExp(`${name} program details`) }));

describe("LendersScreen", () => {
  it("offers AI Lender Upload only to admins (header and empty state)", () => {
    mocks.role = "sales";
    mocks.profiles = [];
    render(<LendersScreen />);
    expect(screen.queryAllByRole("button", { name: /AI Lender Upload/i })).toHaveLength(0);
    expect(screen.getByText(/Ask your admin to upload a rate sheet/)).toBeTruthy();
    cleanup();

    mocks.role = "admin";
    render(<LendersScreen />);
    expect(screen.getAllByRole("button", { name: /AI Lender Upload/i })).toHaveLength(2);
  });

  it("names flagged fields only (never values) and says 'needs review' in the row name", () => {
    mocks.role = "sales";
    mocks.profiles = [flaggedLender()];
    render(<LendersScreen />);
    openLender("Bank A");

    const tierRow = screen.getByRole("row", { name: "Tier A tier details, needs review" });
    expect(screen.getByText("NEEDS REVIEW").getAttribute("title")).toBe(
      "Needs review: min FICO, buy rate"
    );
    fireEvent.click(tierRow);

    const note = screen.getByRole("note");
    expect(note.textContent).toContain("Needs review: min FICO and buy rate read implausibly");
    expect(note.textContent).toContain("Held as pending");
    expect(note.textContent).not.toMatch(/6600|649|=/);
    // Sales cannot edit lender programs, so there is nothing to verify.
    expect(screen.queryByRole("button", { name: "Mark verified" })).toBeNull();
  });

  it("never shows MATCHED for a review-held best candidate", () => {
    mocks.role = "sales";
    mocks.focusVin = "V1";
    mocks.profiles = [flaggedLender()];
    render(<LendersScreen />);
    openLender("Bank A");

    expect(screen.queryByText("MATCHED")).toBeNull();
    expect(screen.getByRole("row", { name: "Tier A tier details, needs review" })).toBeTruthy();
  });

  it("still shows MATCHED for an eligible tier", () => {
    mocks.role = "sales";
    mocks.focusVin = "V1";
    mocks.profiles = [
      {
        id: "L2",
        name: "Bank B",
        bookValueSource: "Trade",
        tiers: [{ name: "Clean", maxTerm: 84, maxLtv: 130 }],
      },
    ];
    render(<LendersScreen />);
    openLender("Bank B");

    expect(screen.getByText("MATCHED")).toBeTruthy();
    expect(screen.getByRole("row", { name: "Clean tier details, matched" })).toBeTruthy();
  });

  it("inline edits lift only the edited field's flag; type-then-delete re-flags it", () => {
    mocks.role = "admin";
    mocks.profiles = [flaggedLender()];
    render(<LendersScreen />);
    openLender("Bank A");
    fireEvent.click(screen.getByRole("row", { name: /Tier A tier details/ }));

    const verify = () => screen.getByRole("button", { name: "Mark verified" }) as HTMLButtonElement;
    expect(verify().disabled).toBe(true);
    expect(screen.getByRole("note").textContent).toContain(
      "Enter min FICO and buy rate from the lender's sheet"
    );

    const fico = document.getElementById("tier-L1-0-fico") as HTMLInputElement;
    fireEvent.change(fico, { target: { value: "660" } });
    expect(lastWrittenTier()?.minFico).toBe(660);
    expect(lastWrittenTier()?.rangeFlags).toEqual(["baseInterestRate=649 outside 0-40"]);
    expect(lastWrittenTier()?.needsReview).toBe(true);

    fireEvent.change(fico, { target: { value: "" } });
    expect(lastWrittenTier()?.rangeFlags).toEqual(
      expect.arrayContaining(["minFico=6600 outside 300-850", "baseInterestRate=649 outside 0-40"])
    );
    expect(lastWrittenTier()?.needsReview).toBe(true);

    fireEvent.change(fico, { target: { value: "660" } });
    const rate = document.getElementById("tier-L1-0-rate") as HTMLInputElement;
    fireEvent.change(rate, { target: { value: "6.49" } });
    expect(lastWrittenTier()?.rangeFlags).toBeUndefined();
    expect(lastWrittenTier()?.needsReview).toBeUndefined();
    expect(screen.queryByText("NEEDS REVIEW")).toBeNull();
  });

  it("Mark verified clears a bare needsReview hold with no flagged fields", () => {
    mocks.role = "admin";
    mocks.profiles = [
      {
        id: "L3",
        name: "Bank C",
        bookValueSource: "Trade",
        tiers: [{ name: "Bare", maxTerm: 84, needsReview: true }],
      },
    ];
    render(<LendersScreen />);
    openLender("Bank C");
    fireEvent.click(screen.getByRole("row", { name: /Bare tier details/ }));

    const verify = screen.getByRole("button", { name: "Mark verified" }) as HTMLButtonElement;
    expect(verify.disabled).toBe(false);
    fireEvent.click(verify);
    expect(lastWrittenTier()?.needsReview).toBeUndefined();
    expect(screen.queryByText("NEEDS REVIEW")).toBeNull();
  });
});
