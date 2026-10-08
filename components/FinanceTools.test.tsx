import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FinanceTools from "./FinanceTools";
import { INITIAL_DEAL_DATA, INITIAL_SETTINGS, SAMPLE_INVENTORY } from "../constants";
import { calculateFinancials } from "../services/calculator";

const vehicle = {
  ...calculateFinancials(SAMPLE_INVENTORY[0]!, INITIAL_DEAL_DATA, INITIAL_SETTINGS),
  price: 30000,
  amountToFinance: 18000,
};
const props = {
  scratchPadNotes: "",
  setScratchPadNotes: vi.fn(),
  activeVehicle: vehicle,
  dealData: { ...INITIAL_DEAL_DATA, interestRate: 0, loanTerm: 60 },
};
afterEach(cleanup);

describe("Finance tools follow the quoted structure", () => {
  it("preserves a genuine zero APR and initializes payment with financed principal", () => {
    render(<FinanceTools {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Payment" }));
    expect((screen.getByLabelText("Loan amount ($)") as HTMLInputElement).value).toBe("18000");
    expect((screen.getByLabelText("Interest rate (%)") as HTMLInputElement).value).toBe("0");
    expect(screen.getByText("$300")).toBeTruthy();
  });

  it("syncs financed amount into payment and compare and clears a missing APR", () => {
    const { rerender } = render(<FinanceTools {...props} />);
    rerender(
      <FinanceTools
        {...props}
        activeVehicle={{ ...vehicle, amountToFinance: 12000 }}
        dealData={{ ...props.dealData, interestRate: "" }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset to active deal" }));
    fireEvent.click(screen.getByRole("tab", { name: "Payment" }));
    expect((screen.getByLabelText("Loan amount ($)") as HTMLInputElement).value).toBe("12000");
    expect((screen.getByLabelText("Interest rate (%)") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("N/A")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Compare" }));
    expect((screen.getByLabelText("Loan amount ($)") as HTMLInputElement).value).toBe("12000");
  });

  it("does not quote an interest-free payment when APR is cleared", () => {
    render(<FinanceTools {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Payment" }));
    fireEvent.change(screen.getByLabelText("Interest rate (%)"), { target: { value: "" } });
    expect(screen.getByText("N/A")).toBeTruthy();
    expect(screen.queryByText("$300")).toBeNull();
  });

  it("does not invent a financed amount or term for incomplete active deals", () => {
    render(
      <FinanceTools
        {...props}
        activeVehicle={{ ...vehicle, amountToFinance: "N/A" }}
        dealData={{ ...props.dealData, loanTerm: 0 }}
      />
    );
    fireEvent.click(screen.getByRole("tab", { name: "Payment" }));
    expect((screen.getByLabelText("Loan amount ($)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Term (mo)") as HTMLSelectElement).value).toBe("0");
    expect(screen.getByText("N/A")).toBeTruthy();
  });

  it("keeps a 96-month active term visible", () => {
    render(<FinanceTools {...props} dealData={{ ...props.dealData, loanTerm: 96 }} />);
    fireEvent.click(screen.getByRole("tab", { name: "Payment" }));
    expect((screen.getByLabelText("Term (mo)") as HTMLSelectElement).value).toBe("96");
  });

  it("does not infer approval purchasing power or warranty savings from cleared inputs", () => {
    render(<FinanceTools {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Max App" }));
    fireEvent.change(screen.getByLabelText("Bank approval amount ($)"), { target: { value: "" } });
    expect(screen.getByText("N/A")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Warranty" }));
    fireEvent.change(screen.getByLabelText("Warranty cost / month ($)"), { target: { value: "" } });
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
    expect(screen.getByText(/Enter product cost, term/)).toBeTruthy();
  });
});
