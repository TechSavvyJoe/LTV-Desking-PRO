import React, { useEffect, useState, useRef } from "react";
import { subscribeConfirm, type ConfirmRequest } from "../../lib/confirm";
import { useFocusTrap, useRestoreFocus } from "../../hooks/useKeyboard";
import Button from "./Button";

export const ConfirmDialog: React.FC = () => {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeConfirm(setRequest), []);

  const isOpen = !!request;

  const close = (confirmed: boolean) => {
    request?.resolve(confirmed);
    setRequest(null);
  };

  // Accessibility: labeled alert dialog, focus trap (auto-focuses the first
  // control = Cancel), focus restore on close, and Escape to cancel. [a11y]
  // useRestoreFocus first so the opener is captured before the trap moves focus. [review/P2]
  useRestoreFocus(isOpen);
  useFocusTrap(panelRef as React.RefObject<HTMLElement>, isOpen);

  // `close` is re-created every render (it closes over `request`); keep a ref
  // so the effect below can stay keyed on `isOpen` alone without going stale.
  const closeRef = useRef(close);
  closeRef.current = close;

  // Escape is handled via a CAPTURE-phase window listener, not a keydown
  // handler on the dialog panel. A panel-scoped or bubble-phase handler only
  // fires when focus (or the click target) is still inside the dialog, but
  // the scrim backdrop is a non-focusable div with no onClick — clicking it,
  // or any interaction that blurs the panel, drops focus to <body> and such
  // a handler would never see the event. Capture phase runs before every
  // bubble-phase listener on window — including a parent dialog's own
  // window keydown → close listener (e.g. Settings) — regardless of focus
  // location or listener registration order, so stopImmediatePropagation
  // here reliably keeps Escape from reaching it. [P2]
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeRef.current(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen]);

  if (!request) return null;

  return (
    // --z-confirm (150) — confirm dialogs must layer above modals (--z-modal: 100),
    // since they are often launched from within one (e.g. destructive actions in Settings).
    <div
      className="fixed inset-0 flex items-center justify-center dc-scrim p-4"
      style={{ zIndex: "var(--z-confirm)" }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-md rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-5 shadow-md"
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-[var(--color-text)]">
          {request.title}
        </h2>
        <p id="confirm-message" className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          {request.message}
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => close(false)}>
            {request.cancelLabel}
          </Button>
          <Button
            type="button"
            variant={request.tone === "danger" ? "danger" : "primary"}
            onClick={() => close(true)}
          >
            {request.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
