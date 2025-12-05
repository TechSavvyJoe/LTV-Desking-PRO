type ToastType = "success" | "error" | "warning" | "info";

type ToastListener = (message: string, type: ToastType) => void;

let listener: ToastListener | null = null;

export const toast = {
  success: (message: string) => listener && listener(message, "success"),
  error: (message: string) => listener && listener(message, "error"),
  warning: (message: string) => listener && listener(message, "warning"),
  info: (message: string) => listener && listener(message, "info"),
};

export const subscribe = (l: ToastListener) => {
  listener = l;
  return () => {
    listener = null;
  };
};
