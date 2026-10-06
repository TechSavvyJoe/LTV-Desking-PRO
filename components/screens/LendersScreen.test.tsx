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
  filters: { creditScore: 520, monthlyIncome: 5000 } as {
    creditScore: number | null;
    monthlyIncome: number | null;
  },
  unitsPerLender: {} as Record<string, number>,
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
        filters: mocks.filters,
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
        unitsPerLender: mocks.unitsPerLender,
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
  mocks.filters = { creditScore: 520, monthlyIncome: 5000 };
  mocks.unitsPerLender = {};
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

  it("renders the empty state without a table when there are no programs", () => {
    mocks.role = "admin";
    mocks.profiles = [];
    render(<LendersScreen />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("heading", { name: "No lender programs yet" })).toBeTruthy();
  });

  it("names flagged fields only (never values) and says 'needs review' in the row name", () => {
    mocks.role = "sales";
    mocks.profiles = [flaggedLender()];
    render(<LendersScreen />);
    openLender("Bank A");

    const tierRow = screen.getByRole("button", { name: "Show details for Tier A, needs review" });
    expect(screen.getByText("Needs review").getAttribute("title")).toBe(
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

  it("never shows Matched for a review-held best candidate", () => {
    mocks.role = "sales";
    mocks.focusVin = "V1";
    mocks.profiles = [flaggedLender()];
    render(<LendersScreen />);
    openLender("Bank A");

    expect(screen.queryByText("Matched")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Show details for Tier A, needs review" })
    ).toBeTruthy();
  });

  it("still shows Matched for an eligible tier", () => {
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

    expect(screen.getByText("Matched")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show details for Clean, matched" })).toBeTruthy();
  });

  it("inline edits lift only the edited field's flag; type-then-delete re-flags it", () => {
    mocks.role = "admin";
    mocks.profiles = [flaggedLender()];
    render(<LendersScreen />);
    openLender("Bank A");
    fireEvent.click(screen.getByRole("button", { name: /details for Tier A/ }));

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
    expect(screen.queryByText("Needs review")).toBeNull();
  });

  describe("status pill: pending vs. genuine fail", () => {
    const ficoLender = (over: Partial<LenderProfile> = {}): LenderProfile => ({
      id: "LF",
      name: "Fico Bank",
      bookValueSource: "Trade",
      tiers: [{ name: "Prime", minFico: 640, maxLtv: 130, maxTerm: 84 }],
      ...over,
    });
    const pill = (text: string) => screen.queryByText(text, { selector: "span" });

    it("shows a neutral 'Needs FICO' pill (not 'No vehicle fit') for a no-FICO deal", () => {
      mocks.role = "sales";
      mocks.focusVin = "V1";
      mocks.filters = { creditScore: null, monthlyIncome: 5000 };
      mocks.profiles = [ficoLender()];
      render(<LendersScreen />);

      const needsFico = pill("Needs FICO");
      expect(needsFico).toBeTruthy();
      expect(needsFico?.style.color).toBe("var(--color-text-muted)");
      expect(needsFico?.style.background).toBe("var(--color-bg-muted)");
      expect(pill("No vehicle fit")).toBeNull();
    });

    it("shows a muted 'Pick a unit on the desk' pill when no vehicle is focused", () => {
      mocks.role = "sales";
      mocks.focusVin = null;
      mocks.filters = { creditScore: 700, monthlyIncome: 5000 };
      mocks.profiles = [ficoLender()];
      render(<LendersScreen />);

      const pick = pill("Pick a unit on the desk");
      expect(pick?.style.color).toBe("var(--color-text-muted)");
      expect(pill("No vehicle fit")).toBeNull();
    });

    it("says 'Verify sample' for a sample program once the FICO is in", () => {
      mocks.role = "sales";
      mocks.focusVin = "V1";
      mocks.filters = { creditScore: 700, monthlyIncome: 5000 };
      mocks.profiles = [ficoLender({ isSample: true })];
      render(<LendersScreen />);

      expect(pill("Verify sample")).toBeTruthy();
      expect(pill("No vehicle fit")).toBeNull();
    });

    it("keeps the warning 'No vehicle fit' for a genuine fail", () => {
      mocks.role = "sales";
      mocks.focusVin = "V1";
      mocks.filters = { creditScore: 700, monthlyIncome: 5000 };
      // Vehicle OTD LTV is 95%; an 80% cap is a real rejection, not unknown.
      mocks.profiles = [
        ficoLender({ tiers: [{ name: "Tight", minFico: 640, maxLtv: 80, maxTerm: 84 }] }),
      ];
      render(<LendersScreen />);

      const noFit = pill("No vehicle fit");
      expect(noFit).toBeTruthy();
      expect(noFit?.style.color).toBe("var(--color-warning)");
      expect(pill("Needs FICO")).toBeNull();
    });
  });

  describe("Buy rate column visibility", () => {
    const rated: LenderProfile = {
      id: "LR",
      name: "Rate Bank",
      bookValueSource: "Trade",
      tiers: [{ name: "A", maxLtv: 130, maxTerm: 84, baseInterestRate: 6.49 }],
    };

    it("drops the Buy rate column (header and cells) for sales", () => {
      mocks.role = "sales";
      mocks.profiles = [rated];
      render(<LendersScreen />);

      const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
      expect(headers).not.toContain("Buy rate");
      expect(headers).toHaveLength(7);
      const row = screen.getByRole("row", { name: /Rate Bank program details/ });
      expect(row.querySelectorAll('[role="cell"]')).toHaveLength(7);
      expect(row.style.gridTemplateColumns.split(" ")).toHaveLength(7);
      expect(screen.queryByText("6.49%")).toBeNull();
    });

    it("shows the Buy rate column for a manager", () => {
      mocks.role = "manager";
      mocks.profiles = [rated];
      render(<LendersScreen />);

      const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
      expect(headers).toContain("Buy rate");
      expect(headers).toHaveLength(8);
      const row = screen.getByRole("row", { name: /Rate Bank program details/ });
      expect(row.querySelectorAll('[role="cell"]')).toHaveLength(8);
      expect(row.style.gridTemplateColumns.split(" ")).toHaveLength(8);
      expect(screen.getByText("6.49%")).toBeTruthy();
    });
  });

  describe("disclosure buttons and buy-rate field", () => {
    it("carries aria-expanded on a real button (not the row) and toggles it", () => {
      mocks.role = "sales";
      mocks.profiles = [flaggedLender()];
      render(<LendersScreen />);

      const row = screen.getByRole("row", { name: /Bank A program details/ });
      expect(row.hasAttribute("aria-expanded")).toBe(false);
      expect(row.hasAttribute("aria-controls")).toBe(false);

      const toggle = screen.getByRole("button", { name: "Show tiers for Bank A" });
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(toggle);
      const hide = screen.getByRole("button", { name: "Hide tiers for Bank A" });
      expect(hide.getAttribute("aria-expanded")).toBe("true");
      expect(document.getElementById("lender-panel-L1")).toBeTruthy();

      const tierToggle = screen.getByRole("button", { name: /Show details for Tier A/ });
      expect(tierToggle.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(tierToggle);
      expect(
        screen
          .getByRole("button", { name: /Hide details for Tier A/ })
          .getAttribute("aria-expanded")
      ).toBe("true");

      fireEvent.click(hide);
      expect(document.getElementById("lender-panel-L1")).toBeNull();
    });

    it("shows no Buy rate field in the tier editor for sales, but does for admin", () => {
      mocks.role = "sales";
      mocks.profiles = [flaggedLender()];
      render(<LendersScreen />);
      openLender("Bank A");
      fireEvent.click(screen.getByRole("button", { name: /details for Tier A/ }));
      expect(screen.queryByLabelText(/Buy rate/)).toBeNull();
      expect(document.getElementById("tier-L1-0-rate")).toBeNull();
      expect(screen.queryByLabelText(/Reserve/)).toBeNull();
      cleanup();

      mocks.role = "admin";
      render(<LendersScreen />);
      openLender("Bank A");
      fireEvent.click(screen.getByRole("button", { name: /details for Tier A/ }));
      expect(document.getElementById("tier-L1-0-rate")).toBeTruthy();
      expect(screen.queryByLabelText(/Reserve/)).not.toBeNull();
    });
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
    fireEvent.click(screen.getByRole("button", { name: /details for Bare/ }));

    const verify = screen.getByRole("button", { name: "Mark verified" }) as HTMLButtonElement;
    expect(verify.disabled).toBe(false);
    fireEvent.click(verify);
    expect(lastWrittenTier()?.needsReview).toBeUndefined();
    expect(screen.queryByText("Needs review")).toBeNull();
  });
});
