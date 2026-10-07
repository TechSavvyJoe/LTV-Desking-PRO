import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SectionErrorBoundary } from "./ErrorBoundary";

afterEach(cleanup);

const Bomb: React.FC = () => {
  throw new Error("boom");
};

describe("SectionErrorBoundary fallback copy", () => {
  it('builds the reassurance sentence from the section label instead of hardcoding "desk"', () => {
    // Silence the expected React error-boundary console.error noise.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getByText } = render(
      <SectionErrorBoundary label="The owner console">
        <Bomb />
      </SectionErrorBoundary>
    );

    expect(getByText("The owner console couldn't load")).toBeTruthy();
    expect(
      getByText(
        "The owner console hit an unexpected error. The other screens still work — try again, or reload if it keeps happening."
      )
    ).toBeTruthy();

    consoleSpy.mockRestore();
  });

  it("uses the label passed for the desk section too", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getByText } = render(
      <SectionErrorBoundary label="The desk">
        <Bomb />
      </SectionErrorBoundary>
    );

    expect(
      getByText(
        "The desk hit an unexpected error. The other screens still work — try again, or reload if it keeps happening."
      )
    ).toBeTruthy();

    consoleSpy.mockRestore();
  });
});
