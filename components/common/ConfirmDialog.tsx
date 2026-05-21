import React, { useEffect, useState } from "react";
import { subscribeConfirm, type ConfirmRequest } from "../../lib/confirm";
import Button from "./Button";

export const ConfirmDialog: React.FC = () => {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => subscribeConfirm(setRequest), []);

  if (!request) return null;

  const close = (confirmed: boolean) => {
    request.resolve(confirmed);
    setRequest(null);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-2xl animate-slide-up">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
          {request.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {request.message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => close(false)}>
            {request.cancelLabel}
          </Button>
          <Button
            type="button"
            variant={request.tone === "danger" ? "danger" : "primary"}
            size="sm"
            onClick={() => close(true)}
          >
            {request.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
