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

/** Grid tracks are minmax(...) pairs, so count them rather than splitting on spaces. */
const trackCount = (el: HTMLElement) =>
  el.style.gridTemplateColumns.match(/minmax\(/g)?.length ?? 0;

const lastWrittenTier = (): LenderTier | undefined => mocks.writes.at(-1)?.[0]?.tiers?.[0];

const openLender = (name: string) =>
  fireEvent.click(screen.getByRole("row", { name: new RegExp(`${name} program details`) }));

describe("LendersScreen", () => {
  it("offers the rate sheet upload only to admins (header and empty state)", () => {
    mocks.role = "sales";
    mocks.profiles = [];
    render(<LendersScreen />);
    expect(screen.queryAllByRole("button", { name: /Upload rate sheet/i })).toHaveLength(0);
    expect(screen.getByText(/Ask your admin to load lender programs/)).toBeTruthy();
    cleanup();

    mocks.role = "admin";
    render(<LendersScreen />);
    expect(screen.getAllByRole("button", { name: /Upload rate sheet/i })).toHaveLength(2);
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

    const tierRow = screen.getByRole("button", {
      name: "Show details for Tier A at Bank A, needs review",
    });
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
      screen.getByRole("button", { name: "Show details for Tier A at Bank A, needs review" })
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
    expect(
      screen.getByRole("button", { name: "Show details for Clean at Bank B, matched" })
    ).toBeTruthy();
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

    it("never shows a sample as a decline, even when its FICO floor is above the deal's [PR #25 review]", () => {
      mocks.role = "sales";
      mocks.focusVin = "V1";
      mocks.filters = { creditScore: 720, monthlyIncome: 5000 };
      mocks.profiles = [
        ficoLender({
          isSample: true,
          tiers: [{ name: "Super prime", minFico: 800, maxLtv: 130, maxTerm: 84 }],
        }),
      ];
      render(<LendersScreen />);

      expect(pill("Verify sample")).toBeTruthy();
      expect(pill("FICO below min")).toBeNull();
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
      expect(trackCount(row)).toBe(7);
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
      expect(trackCount(row)).toBe(8);
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

  describe("responsive and screen-reader markup", () => {
    const rated = (over: Partial<LenderProfile> = {}): LenderProfile => ({
      id: "LR",
      name: "Rate Bank",
      bookValueSource: "Trade",
      tiers: [
        { name: "A", minFico: 640, maxLtv: 130, maxTerm: 84, baseInterestRate: 6.49 },
        { name: "B", minFico: 600, maxLtv: 120, maxTerm: 72, baseInterestRate: 8.99 },
      ],
      ...over,
    });

    it("labels every body cell except Lender for the stacked layout (manager sees Buy rate)", () => {
      mocks.role = "manager";
      mocks.profiles = [rated()];
      render(<LendersScreen />);

      const row = screen.getByRole("row", { name: /Rate Bank program details/ });
      const cells = Array.from(row.querySelectorAll('[role="cell"]'));
      expect(cells.map((c) => c.getAttribute("data-label"))).toEqual([
        null,
        "Tier",
        "Max LTV",
        "Max term",
        "Min FICO",
        "Buy rate",
        "Units fitting",
        "Status",
      ]);
    });

    it("drops the Buy rate data-label with the column for sales", () => {
      mocks.role = "sales";
      mocks.profiles = [rated()];
      render(<LendersScreen />);

      const row = screen.getByRole("row", { name: /Rate Bank program details/ });
      const labels = Array.from(row.querySelectorAll('[role="cell"]')).map((c) =>
        c.getAttribute("data-label")
      );
      expect(labels).not.toContain("Buy rate");
      expect(labels).toHaveLength(7);
    });

    it("gives the header row, tier chip and units bar their layout hooks", () => {
      mocks.role = "sales";
      mocks.profiles = [rated()];
      const { container } = render(<LendersScreen />);

      const header = screen.getAllByRole("columnheader")[0]!.parentElement as HTMLElement;
      expect(header.className).toContain("lenders-screen-columns");
      expect(header.className).not.toContain("lenders-screen-table-row");
      expect(container.querySelector(".lenders-tier-count")?.textContent).toBe("2 tiers");
      expect(container.querySelector(".lenders-units-bar")).toBeTruthy();
      const first = screen.getByRole("row", { name: /Rate Bank program details/ });
      expect(
        first.style.gridTemplateColumns.startsWith("var(--lender-track, minmax(140px, 1.7fr))")
      ).toBe(true);
    });

    it("keeps the tier pill on one line", () => {
      mocks.role = "sales";
      mocks.profiles = [rated()];
      render(<LendersScreen />);
      const pill = screen.getByTitle("Derived from program tiers");
      expect(pill.style.whiteSpace).toBe("nowrap");
      expect(pill.style.display).toBe("inline-block");
    });

    it("exposes the program on/off control as a named switch with its state", () => {
      mocks.role = "admin";
      mocks.profiles = [rated()];
      render(<LendersScreen />);
      openLender("Rate Bank");

      const sw = screen.getByRole("switch", { name: "Rate Bank program active" });
      expect(sw.getAttribute("aria-checked")).toBe("true");
      expect(sw.textContent).toBe("Active");
      fireEvent.click(sw);
      const off = screen.getByRole("switch", { name: "Rate Bank program active" });
      expect(off.getAttribute("aria-checked")).toBe("false");
      expect(off.textContent).toBe("Disabled");
      expect(mocks.writes.at(-1)?.[0]?.active).toBe(false);
    });

    it("hides the program switch from roles that cannot edit", () => {
      mocks.role = "sales";
      mocks.profiles = [rated()];
      render(<LendersScreen />);
      openLender("Rate Bank");
      expect(screen.queryByRole("switch")).toBeNull();
    });

    it("names the lender in the drawer heading, tier toggles, and the colspan", () => {
      mocks.role = "manager";
      mocks.profiles = [rated()];
      render(<LendersScreen />);
      openLender("Rate Bank");

      expect(screen.getByRole("heading", { name: "Rate Bank program parameters" })).toBeTruthy();
      expect(screen.getByRole("button", { name: /Show details for A at Rate Bank/ })).toBeTruthy();
      expect(document.getElementById("lender-panel-LR")?.getAttribute("aria-colspan")).toBe("8");
      cleanup();

      mocks.role = "sales";
      render(<LendersScreen />);
      openLender("Rate Bank");
      expect(document.getElementById("lender-panel-LR")?.getAttribute("aria-colspan")).toBe("7");
    });

    it("reads an empty value as 'not set' and hides the dash", () => {
      mocks.role = "manager";
      mocks.profiles = [
        { id: "LE", name: "Empty Bank", bookValueSource: "Trade", tiers: [] } as LenderProfile,
      ];
      render(<LendersScreen />);

      const row = screen.getByRole("row", { name: /Empty Bank program details/ });
      const ltv = row.querySelector('[data-label="Max LTV"]') as HTMLElement;
      expect(ltv.querySelector('[aria-hidden="true"]')?.textContent).toBe("—");
      expect(ltv.querySelector(".sr-only")?.textContent).toBe("not set");
      expect(row.querySelectorAll(".sr-only")).toHaveLength(4);

      openLender("Empty Bank");
      const contact = screen.getByText("Buyer contact");
      expect(contact.querySelector(".sr-only")?.textContent).toBe("not set");
    });

    it("names the lender on Edit full program and hides the arrow", () => {
      mocks.role = "admin";
      mocks.profiles = [rated()];
      render(<LendersScreen />);
      openLender("Rate Bank");

      const edit = screen.getByRole("button", { name: "Edit full program for Rate Bank" });
      expect(edit.textContent).toContain("Edit full program");
      expect(edit.querySelector('[aria-hidden="true"]')?.textContent).toBe("→");
    });
  });
});
