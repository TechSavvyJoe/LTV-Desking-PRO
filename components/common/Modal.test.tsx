import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Modal from "./Modal";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";
  document.body.style.left = "";
});

describe("Modal body scroll lock", () => {
  it("locks the body while open", () => {
    render(
      <Modal isOpen title="Edit lender" onClose={vi.fn()}>
        <p>content</p>
      </Modal>
    );

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");
  });

  it("restores the body lock when closed via props", () => {
    const { rerender } = render(
      <Modal isOpen title="Edit lender" onClose={vi.fn()}>
        <p>content</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Modal isOpen={false} title="Edit lender" onClose={vi.fn()}>
        <p>content</p>
      </Modal>
    );

    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
  });

  it("restores the body lock when unmounted while still open", () => {
    // Regression: a screen unmounting an open Modal (⌘K navigation, a route
    // error boundary swapping the screen out) must not leave the page frozen.
    const { unmount } = render(
      <Modal isOpen title="Edit lender" onClose={vi.fn()}>
        <p>content</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.style.width).toBe("");
    expect(document.body.style.left).toBe("");
  });
});

describe("Modal focus management", () => {
  it("returns focus to the element that opened it when it closes", () => {
    // Regression: useFocusTrap ran before useRestoreFocus, so the "previously
    // focused" element was the dialog's own first control and focus fell to
    // <body> on close. Effects run in declaration order — restore must come first.
    const Harness: React.FC = () => {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open editor
          </button>
          <Modal isOpen={open} title="Edit lender" onClose={() => setOpen(false)}>
            <input aria-label="Lender name" />
          </Modal>
        </>
      );
    };
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open editor" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(document.activeElement).toBe(trigger);
  });
});
