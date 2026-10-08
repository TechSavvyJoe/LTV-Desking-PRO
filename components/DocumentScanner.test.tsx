import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recognize = vi.hoisted(() => vi.fn());
vi.mock("tesseract.js", () => ({ default: { recognize } }));
import { DocumentScanner } from "./DocumentScanner";

beforeEach(() => {
  recognize.mockResolvedValue({ data: { text: "Net Pay $1,400.00\nGross Pay $2,000.00" } });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function upload(file = new File(["synthetic test image"], "stub.png", { type: "image/png" })) {
  fireEvent.change(screen.getByLabelText("Upload pay stub image"), { target: { files: [file] } });
}

describe("Gross income confirmation", () => {
  it.each([
    ["weekly", 8666.67],
    ["biweekly", 4333.33],
    ["semimonthly", 4000],
    ["monthly", 2000],
  ])(
    "converts %s gross pay to monthly income only after explicit confirmation",
    async (frequency, monthly) => {
      const apply = vi.fn();
      render(<DocumentScanner onIncomeExtracted={apply} onClose={vi.fn()} />);
      upload();
      const button = await screen.findByRole("button", { name: "Apply monthly income" });
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(apply).not.toHaveBeenCalled();
      expect(
        (screen.getByLabelText("Current-period gross pay ($)") as HTMLInputElement).value
      ).toBe("2000");
      fireEvent.change(screen.getByLabelText("Pay frequency"), { target: { value: frequency } });
      fireEvent.click(button);
      expect(apply).toHaveBeenCalledWith(monthly);
    }
  );

  it("does not present net-only pay as gross income", async () => {
    recognize.mockResolvedValue({ data: { text: "Net Pay $1,400.00\nYTD $10,000.00" } });
    render(<DocumentScanner onIncomeExtracted={vi.fn()} onClose={vi.fn()} />);
    upload();
    await screen.findByText(/Couldn't find current gross pay/);
    expect(screen.queryByRole("button", { name: "Apply monthly income" })).toBeNull();
  });

  it("clears a previous result when the next file is unsupported", async () => {
    render(<DocumentScanner onIncomeExtracted={vi.fn()} onClose={vi.fn()} />);
    upload();
    await screen.findByRole("button", { name: "Apply monthly income" });
    upload(new File(["pdf"], "stub.pdf", { type: "application/pdf" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Apply monthly income" })).toBeNull()
    );
    expect(recognize).toHaveBeenCalledTimes(1);
  });
});
