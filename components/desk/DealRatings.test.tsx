/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INITIAL_DEAL_DATA, INITIAL_SETTINGS, SAMPLE_INVENTORY } from "../../constants";
import { calculateFinancials } from "../../services/calculator";
import type { DealAssessment, DealCheck } from "../../services/dealAssessment";
import { DealRatings } from "./DealRatings";

const assessment: DealAssessment = {
  version: "rules-v1",
  readiness: 0,
  completeness: 0,
  passed: 0,
  total: 12,
  checks: [],
  label: "Inputs needed",
  fitCount: 0,
  checkedLenders: 0,
  pendingLenders: 0,
  sampleLenders: 0,
  lenderMatchPercent: null,
  budgetUsedPercent: null,
  budgetHeadroom: null,
  pti: null,
  dti: null,
  totalPayments: null,
  totalInterest: null,
  frontGross: null,
  productGross: null,
  totalGross: null,
  profitTargetPercent: null,
  profitHeadroom: null,
};
const check = (id: string, label: string, status: DealCheck["status"] = "missing"): DealCheck => ({
  id,
  label,
  status,
  detail: `Confirm ${label}.`,
});
const vehicle = calculateFinancials(SAMPLE_INVENTORY[0]!, INITIAL_DEAL_DATA, INITIAL_SETTINGS);
const renderRatings = (
  checks: DealCheck[],
  props: Partial<React.ComponentProps<typeof DealRatings>> = {}
) =>
  render(
    <DealRatings
      vehicle={{ ...vehicle, assessment: { ...assessment, checks } }}
      dealData={INITIAL_DEAL_DATA}
      {...props}
    />
  );

describe("actionable deal checks", () => {
  afterEach(cleanup);

  it("offers the first two supported unresolved checks while retaining the full checklist", () => {
    const onResolve = vi.fn();
    renderRatings(
      [
        check("vehicle", "Book value"),
        check("fico", "Customer FICO"),
        check("income", "Monthly income"),
        check("debt", "Monthly obligations"),
        check("budget", "Payment budget", "pass"),
      ],
      { onResolveCheck: onResolve }
    );
    const next = screen.getByRole("region", { name: "Next to resolve" });
    expect(within(next).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(within(next).getByRole("button", { name: "Resolve Customer FICO" }));
    expect(onResolve).toHaveBeenCalledWith("fico");
    expect(screen.queryByRole("button", { name: "Resolve Monthly obligations" })).toBeNull();
    expect(screen.getByText(/Why this rating · 4 checks to resolve/)).toBeTruthy();
    expect(screen.getByText("Confirm Monthly obligations.")).toBeTruthy();
  });

  it("opens profit details and focuses the exact authorized input", () => {
    renderRatings(
      [check("cost", "All-in vehicle cost"), check("reserve", "Lender reserve estimate")],
      { onProfitChange: vi.fn() }
    );
    fireEvent.click(screen.getByRole("button", { name: "Resolve All-in vehicle cost" }));
    expect(
      screen.getByText("Set profit inputs").parentElement?.getAttribute("open")
    ).not.toBeNull();
    expect(document.activeElement?.id).toBe("rating-unit-cost");
    fireEvent.click(screen.getByRole("button", { name: "Resolve Lender reserve estimate" }));
    expect(document.activeElement?.id).toBe("rating-reserve");
  });

  it("suppresses manager-only actions and fields when profit editing is not granted", () => {
    renderRatings(
      [
        check("cost", "All-in vehicle cost"),
        check("profit", "Dealer gross target"),
        check("income", "Monthly income"),
      ],
      { onResolveCheck: vi.fn() }
    );
    expect(screen.queryByRole("button", { name: "Resolve All-in vehicle cost" })).toBeNull();
    expect(screen.queryByLabelText("All-in unit cost ($)")).toBeNull();
    expect(screen.getByText(/A manager must confirm costs/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resolve Monthly income" })).toBeTruthy();
  });

  it("identifies the program review owner and routes the lender hold through the supplied action", () => {
    const onResolve = vi.fn();
    renderRatings([check("lender", "Program rules match")], { onResolveCheck: onResolve });
    expect(screen.getByText(/Program review: dealership admin/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolve Program rules match" }));
    expect(onResolve).toHaveBeenCalledWith("lender");
    expect(screen.getByText(/Published rules only; no lender decision/)).toBeTruthy();
  });
});
