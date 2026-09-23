import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";
import { confirmAction } from "../../lib/confirm";

afterEach(() => {
  cleanup();
});

describe("ConfirmDialog Escape handling", () => {
  it("cancels the confirm on Escape", async () => {
    render(<ConfirmDialog />);
    let resultPromise!: Promise<boolean>;
    act(() => {
      resultPromise = confirmAction({ title: "Discard changes?", message: "Are you sure?" });
    });

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(await resultPromise).toBe(false);
  });

  it("does not reach a window keydown listener registered by a parent", async () => {
    // Regression [P2]: a ConfirmDialog stacked over another dialog (e.g. a
    // destructive action inside Settings) must not let Escape also fire the
    // parent's own window keydown → close listener, which would discard
    // unsaved edits. The parent listener is registered on window before the
    // confirm even opens, matching real usage (Settings mounts, then a
    // confirm is triggered from within it).
    const parentOnClose = vi.fn();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") parentOnClose();
    };
    window.addEventListener("keydown", onKey);

    try {
      render(<ConfirmDialog />);
      let resultPromise!: Promise<boolean>;
      act(() => {
        resultPromise = confirmAction({ title: "Discard changes?", message: "Are you sure?" });
      });

      const dialog = await screen.findByRole("alertdialog");
      fireEvent.keyDown(dialog, { key: "Escape" });

      expect(await resultPromise).toBe(false);
      expect(parentOnClose).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", onKey);
    }
  });

  it("cancels via Escape even once focus has left the panel (scrim click, etc.), and still consumes it", async () => {
    // Regression [P2]: the fix moved Escape handling off a keydown handler on
    // the dialog panel (which only fires while focus is still inside it) onto
    // a capture-phase window listener. Reproduce the case a panel-scoped
    // handler misses: the panel is blurred (as a click on the non-focusable
    // scrim would do, since it has no onClick of its own) and Escape fires
    // with <body> as the target.
    const parentOnClose = vi.fn();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") parentOnClose();
    };
    window.addEventListener("keydown", onKey);

    try {
      render(<ConfirmDialog />);
      let resultPromise!: Promise<boolean>;
      act(() => {
        resultPromise = confirmAction({ title: "Discard changes?", message: "Are you sure?" });
      });

      await screen.findByRole("alertdialog");
      (document.activeElement as HTMLElement | null)?.blur();
      expect(document.activeElement).toBe(document.body);

      fireEvent.keyDown(document.body, { key: "Escape" });

      expect(await resultPromise).toBe(false);
      expect(parentOnClose).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", onKey);
    }
  });

  it("cancels via the Cancel button and restores focus", async () => {
    const Harness: React.FC = () => {
      const [result, setResult] = React.useState<string>("");
      return (
        <>
          <button
            type="button"
            onClick={async () => {
              const confirmed = await confirmAction({
                title: "Delete lender?",
                message: "This cannot be undone.",
              });
              setResult(confirmed ? "confirmed" : "cancelled");
            }}
          >
            Trigger
          </button>
          <span data-testid="result">{result}</span>
          <ConfirmDialog />
        </>
      );
    };

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Trigger" });
    trigger.focus();
    fireEvent.click(trigger);

    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect((await screen.findByTestId("result")).textContent).toBe("cancelled");
    expect(document.activeElement).toBe(trigger);
  });
});
