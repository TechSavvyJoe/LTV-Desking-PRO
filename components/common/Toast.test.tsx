import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Toast } from "./Toast";
import { toast } from "../../lib/toast";

afterEach(cleanup);

describe("Toast live region announcements", () => {
  it("mutates the polite live region even when two consecutive messages are identical", () => {
    const { container } = render(<Toast />);
    const politeRegion = container.querySelector('[role="status"]') as HTMLElement;

    act(() => {
      toast.success("Deal saved");
    });
    const firstSpan = politeRegion.querySelector("span");
    expect(firstSpan?.textContent).toBe("Success: Deal saved");

    act(() => {
      toast.success("Deal saved");
    });
    const secondSpan = politeRegion.querySelector("span");
    expect(secondSpan?.textContent).toBe("Success: Deal saved");
    // Keyed on the publish id, so the second identical publish swaps in a
    // brand-new DOM node instead of leaving the old text node untouched —
    // that node-level change is what lets assistive tech re-announce it.
    expect(secondSpan).not.toBe(firstSpan);

    // Both toasts are still rendered on screen.
    expect(container.querySelectorAll(".toast-pop").length).toBe(2);
  });

  it("mutates the assertive live region for two identical consecutive errors", () => {
    const { container } = render(<Toast />);
    const assertiveRegion = container.querySelector('[role="alert"]') as HTMLElement;

    act(() => {
      toast.error("Could not save the deal.");
    });
    const firstSpan = assertiveRegion.querySelector("span");

    act(() => {
      toast.error("Could not save the deal.");
    });
    const secondSpan = assertiveRegion.querySelector("span");

    expect(secondSpan?.textContent).toBe("Error: Could not save the deal.");
    expect(secondSpan).not.toBe(firstSpan);
  });
});
