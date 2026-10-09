/** @vitest-environment jsdom */
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  INITIAL_DEAL_DATA,
  INITIAL_FILTER_DATA,
  INITIAL_SETTINGS,
  SAMPLE_INVENTORY,
} from "../../constants";
import { calculateFinancials } from "../../services/calculator";
import { PaymentTarget } from "./PaymentTarget";

const dealData = { ...INITIAL_DEAL_DATA, downPayment: 1000, interestRate: 8.9, loanTerm: 72 };
const vehicle = calculateFinancials(
  { ...SAMPLE_INVENTORY[0]!, price: 30_000 },
  dealData,
  INITIAL_SETTINGS
);
const props = {
  vehicle,
  dealData,
  settings: INITIAL_SETTINGS,
  filters: { ...INITIAL_FILTER_DATA, maxPayment: 350 },
  profiles: [
    {
      id: "sample",
      name: "Sample program",
      isSample: true,
      tiers: [{ name: "Sample", maxLtv: 150 }],
    },
  ],
};
afterEach(cleanup);

describe("payment ceiling proposal", () => {
  it("applies cash and undoes it without changing term, retaining pending evidence", () => {
    const calls = vi.fn();
    function Harness() {
      const [structure, setStructure] = useState(dealData);
      const repriced = calculateFinancials(vehicle, structure, INITIAL_SETTINGS);
      return (
        <PaymentTarget
          {...props}
          vehicle={repriced}
          dealData={structure}
          onApply={(term, down) => {
            calls(term, down);
            setStructure({ ...structure, downPayment: down, loanTerm: term });
          }}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByText("Calculation & remaining checks"));
    expect(screen.getByText(/0 verified program fits · 1 pending/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply cash down" }));
    expect(calls.mock.calls[0]?.[0]).toBe(72);
    expect(calls.mock.calls[0]?.[1]).toBeGreaterThan(1000);
    expect(screen.getByRole("status").textContent).toMatch(/within the entered ceiling/);
    fireEvent.click(screen.getByRole("button", { name: "Undo cash change" }));
    expect(calls).toHaveBeenLastCalledWith(72, 1000);
    expect(screen.getByRole("button", { name: "Apply cash down" })).toBeTruthy();
  });

  it("cannot undo a previous structure after the price or source inputs change", () => {
    const apply = vi.fn();
    const view = render(<PaymentTarget {...props} onApply={apply} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply cash down" }));
    const next = { ...dealData, downPayment: apply.mock.calls[0]?.[1] as number };
    view.rerender(<PaymentTarget {...props} dealData={next} onApply={apply} />);
    expect(screen.getByRole("button", { name: "Undo cash change" })).toBeTruthy();
    view.rerender(
      <PaymentTarget
        {...props}
        dealData={next}
        vehicle={{ ...vehicle, price: 31_000 }}
        onApply={apply}
      />
    );
    expect(screen.queryByRole("button", { name: "Undo cash change" })).toBeNull();
  });

  it("offers no application when the payment ceiling is missing", () => {
    render(<PaymentTarget {...props} filters={INITIAL_FILTER_DATA} onApply={vi.fn()} />);
    expect(screen.getByText("Enter a positive payment ceiling.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Apply cash down" })).toBeNull();
  });
});
