/**
 * @vitest-environment jsdom
 */

import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_SETTINGS } from "../lib/aiModelRegistry";
import type { LenderProfile, Settings } from "../types";
import AiLenderManagerModal from "./AiLenderManagerModal";
import { saveLenderProfile, updateLenderProfile } from "../lib/api";

vi.mock("../lib/api", () => ({
  saveLenderProfile: vi.fn(async (data) => ({ ...data, id: "new-program" })),
  updateLenderProfile: vi.fn(async (id, data) => ({ ...data, id })),
}));

vi.mock("../services/aiProcessor", () => ({
  processLenderSheet: vi.fn(
    async (): Promise<Partial<LenderProfile>[]> => [
      {
        name: "Flagged Bank",
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
      },
    ]
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const settings: Settings = {
  defaultTerm: 72,
  defaultApr: 8.9,
  defaultState: "MI",
  docFee: 280,
  cvrFee: 24,
  defaultStateFees: 31,
  outOfStateTransitFee: 10,
  customTaxRate: null,
  miTradeInCreditCap: 12000,
  vscPrice: 2495,
  gapPrice: 895,
  ltvThresholds: { warn: 115, danger: 125, critical: 135 },
  ai: DEFAULT_AI_SETTINGS,
};

describe("AiLenderManagerModal", () => {
  it("shows the warning row for a draft tier carrying rangeFlags", async () => {
    render(
      <AiLenderManagerModal
        isOpen={true}
        onClose={vi.fn()}
        currentProfiles={[]}
        onUpdateProfiles={vi.fn()}
        settings={settings}
      />
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(["dummy"], "ratesheet.pdf", { type: "application/pdf" });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Extract programs" }));
    });

    expect(
      await screen.findByText(/Needs review — verify against the lender's official sheet/)
    ).toBeTruthy();
    expect(
      screen.getByText(/Dropped implausible sheet value: maxLtv=1500 outside 20-200/)
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Saved as pending — never counted as a lender fit until the tier is corrected\./
      )
    ).toBeTruthy();
  });

  it.each([false, true])(
    "saves extraction as a source-linked draft, existing=%s",
    async (existing) => {
      render(
        <AiLenderManagerModal
          isOpen={true}
          onClose={vi.fn()}
          currentProfiles={
            existing
              ? [
                  {
                    id: "existing",
                    name: "Flagged Bank",
                    tiers: [],
                    verifiedAt: "old-review",
                    reviewRequired: false,
                  },
                ]
              : []
          }
          onUpdateProfiles={vi.fn()}
          settings={settings}
        />
      );
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(fileInput, {
          target: {
            files: [new File(["synthetic"], "current-program.pdf", { type: "application/pdf" })],
          },
        });
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Extract programs" }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save lender programs" }));
      });
      const expected = expect.objectContaining({
        sourceReference: "current-program.pdf",
        reviewRequired: true,
        verifiedAt: "",
        isSample: false,
      });
      if (existing) {
        expect(updateLenderProfile).toHaveBeenCalledWith("existing", expected);
        expect(saveLenderProfile).not.toHaveBeenCalled();
      } else {
        expect(saveLenderProfile).toHaveBeenCalledWith(expected);
        expect(updateLenderProfile).not.toHaveBeenCalled();
      }
    }
  );
});
