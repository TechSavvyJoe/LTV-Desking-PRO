export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

export interface ConfirmRequest extends Required<Omit<ConfirmOptions, "tone">> {
  tone: "default" | "danger";
  resolve: (confirmed: boolean) => void;
}

type ConfirmListener = (request: ConfirmRequest) => void;

let listener: ConfirmListener | null = null;

export const confirmAction = (options: ConfirmOptions): Promise<boolean> =>
  new Promise((resolve) => {
    const request: ConfirmRequest = {
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel ?? "Confirm",
      cancelLabel: options.cancelLabel ?? "Cancel",
      tone: options.tone ?? "default",
      resolve,
    };

    if (!listener) {
      console.warn("Confirmation requested before dialog listener mounted.");
      resolve(false);
      return;
    }

    listener(request);
  });

export const subscribeConfirm = (nextListener: ConfirmListener): (() => void) => {
  listener = nextListener;
  return () => {
    listener = null;
  };
};
