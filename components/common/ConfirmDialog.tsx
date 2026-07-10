import React, { useEffect, useState, useRef } from "react";
import { subscribeConfirm, type ConfirmRequest } from "../../lib/confirm";
import { useFocusTrap, useRestoreFocus, useKeyboardShortcuts } from "../../hooks/useKeyboard";
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
  useFocusTrap(panelRef as React.RefObject<HTMLElement>, isOpen);
  useRestoreFocus(isOpen);
  useKeyboardShortcuts({ escape: () => close(false) }, isOpen);

  if (!request) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
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
