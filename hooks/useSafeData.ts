import { useMemo } from "react";

export function useSafeData<T>(data: T[] | null | undefined): T[] {
  return useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter((item) => item && typeof item === "object");
  }, [data]);
}
