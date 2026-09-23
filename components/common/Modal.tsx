import React, { useEffect, useId, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon } from "./Icons";
import { useFocusTrap, useRestoreFocus, useKeyboardShortcuts } from "../../hooks/useKeyboard";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const scrollPositionRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  // Unique per instance so two dialogs can never share an id, and the
  // description is actually linked to the dialog for assistive tech. [a11y]
  const uid = useId();
  const titleId = `${uid}-title`;
  const descriptionId = `${uid}-desc`;

  // Accessibility: trap focus inside the dialog, restore it to the trigger on
  // close, and close on Escape. The hooks existed but were wired to nothing. [a11y]
  // useRestoreFocus is declared FIRST: effects run in declaration order, so it
  // snapshots the opener before the trap moves focus into the dialog. [review/P2]
  useRestoreFocus(isOpen);
  useFocusTrap(panelRef as React.RefObject<HTMLElement>, isOpen);
  useKeyboardShortcuts({ escape: () => onClose() }, isOpen);

  // Body scroll lock lives in its own effect, keyed only on isOpen. React
  // runs an effect's cleanup both when it closes AND when the component
  // unmounts, so unmounting while open (e.g. the ⌘K palette or a route
  // error boundary swapping the screen out from under an open modal) still
  // restores the body instead of leaving the page frozen and scrolled. [a11y]
  useEffect(() => {
    if (!isOpen) return;

    // Save current scroll position BEFORE locking body
    scrollPositionRef.current = window.scrollY;

    // Lock body scroll
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollPositionRef.current}px`;
    document.body.style.width = "100%";
    document.body.style.left = "0";

    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.left = "";
      window.scrollTo(0, scrollPositionRef.current);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => setIsAnimating(true));
    } else if (isVisible) {
      // IMMEDIATELY stop the enter animation when closing starts
      setIsAnimating(false);

      // Only delay the visibility (unmount) for the exit animation
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isVisible]);

  if (!isVisible && !isOpen) return null;

  const sizeClasses = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
    full: "max-w-full m-4 h-[calc(100vh-2rem)]",
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop — one scrim token for every overlay in the product. */}
      <div
        className={`
          fixed inset-0 dc-scrim
          transition-opacity duration-200 ease-out
          ${isAnimating ? "opacity-100" : "opacity-0"}
        `}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Panel */}
      <div
        className={`
          relative w-full ${sizeClasses[size]}
          bg-[var(--color-bg)]
          border border-[var(--color-border)]
          rounded-lg shadow-md
          transform transition-all duration-200 ease-out
          flex flex-col max-h-[calc(100vh-3rem)]
          ${
            isAnimating ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"
          }
        `}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--color-border)] flex-shrink-0">
          <div>
            <h3 id={titleId} className="text-lg font-semibold text-[var(--color-text)] leading-6">
              {title}
            </h3>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-[var(--color-text-muted)]">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="
              -mr-2 p-2 min-w-[36px] min-h-[36px]
              text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]
              hover:bg-[var(--color-bg-muted)]
              rounded transition-colors
            "
            aria-label="Close dialog"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="px-6 py-5 overflow-y-auto custom-scrollbar flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)] rounded-b-lg flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default Modal;
