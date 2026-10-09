/**
 * @vitest-environment jsdom
 */

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_SETTINGS } from "../lib/aiModelRegistry";
import type { LenderProfile, Settings } from "../types";
import AiLenderManagerModal from "./AiLenderManagerModal";
import { saveLenderProfile, updateLenderProfile } from "../lib/api";
import { processLenderSheet } from "../services/aiProcessor";
import { announcePrivateSessionBoundary } from "../lib/privateSession";

type PersistedProgram = NonNullable<Awaited<ReturnType<typeof saveLenderProfile>>>;
const persisted = (id: string, name: string): PersistedProgram => ({
  id,
  name,
  active: true,
  tiers: [],
  dealer: "synthetic-dealer",
  created: "2026-10-09 00:00:00Z",
  updated: "2026-10-09 00:00:00Z",
});

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
  it("can cancel a pending save and save a new batch before its old receipt returns", async () => {
    vi.mocked(processLenderSheet)
      .mockResolvedValueOnce([
        { name: "Old first", tiers: [] },
        { name: "Old second", tiers: [] },
      ])
      .mockResolvedValueOnce([
        { name: "New first", tiers: [] },
        { name: "New second", tiers: [] },
      ]);
    let oldRelease!: (value: PersistedProgram | null) => void;
    let newRelease!: (value: PersistedProgram | null) => void;
    vi.mocked(saveLenderProfile)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            oldRelease = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            newRelease = resolve;
          })
      );
    const update = vi.fn();
    const props = { onClose: vi.fn(), currentProfiles: [], onUpdateProfiles: update, settings };
    const view = render(<AiLenderManagerModal {...props} isOpen />);
    const extract = async () => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await act(async () =>
        fireEvent.change(input, {
          target: {
            files: [new File(["synthetic"], "programs.pdf", { type: "application/pdf" })],
          },
        })
      );
      await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Extract programs" }))
      );
    };
    await extract();
    fireEvent.click(screen.getByRole("button", { name: "Save lender programs" }));
    await waitFor(() => expect(saveLenderProfile).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    view.rerender(<AiLenderManagerModal {...props} isOpen={false} />);
    view.rerender(<AiLenderManagerModal {...props} isOpen />);
    await extract();
    fireEvent.click(screen.getByRole("button", { name: "Save lender programs" }));
    await waitFor(() => expect(saveLenderProfile).toHaveBeenCalledTimes(2));
    await act(async () => oldRelease(persisted("old", "Old first")));
    expect(update).not.toHaveBeenCalled();
    expect(saveLenderProfile).toHaveBeenCalledTimes(2);
    await act(async () => newRelease(persisted("new", "New first")));
    await waitFor(() => expect(saveLenderProfile).toHaveBeenCalledTimes(3));
    expect(vi.mocked(saveLenderProfile).mock.calls.map(([profile]) => profile.name)).toEqual([
      "Old first",
      "New first",
      "New second",
    ]);
    expect(update).toHaveBeenCalledTimes(2);
  });
  it.each(["unmount", "session switch"])("stops a two-program save after %s", async (boundary) => {
    vi.mocked(processLenderSheet).mockResolvedValueOnce([
      { name: "First synthetic bank", tiers: [] },
      { name: "Second synthetic bank", tiers: [] },
    ]);
    let release!: (value: PersistedProgram | null) => void;
    vi.mocked(saveLenderProfile).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const update = vi.fn();
    const view = render(
      <AiLenderManagerModal
        isOpen
        onClose={vi.fn()}
        currentProfiles={[]}
        onUpdateProfiles={update}
        settings={settings}
      />
    );
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () =>
      fireEvent.change(fileInput, {
        target: {
          files: [new File(["synthetic"], "programs.pdf", { type: "application/pdf" })],
        },
      })
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Extract programs" }))
    );
    fireEvent.click(screen.getByRole("button", { name: "Save lender programs" }));
    await waitFor(() => expect(saveLenderProfile).toHaveBeenCalledOnce());
    await act(async () => {
      if (boundary === "unmount") view.unmount();
      else announcePrivateSessionBoundary();
      release(persisted("first", "First synthetic bank"));
    });
    expect(saveLenderProfile).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });
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
