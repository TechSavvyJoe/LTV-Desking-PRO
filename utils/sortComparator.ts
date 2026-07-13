/**
 * Shared null/"N/A"/"Error"-aware cell comparator used by the inventory sort
 * in DealContext and the desk grid sort in DeskScreen (previously two drifted
 * copies of the same logic).
 *
 * Semantics (identical in both original call sites):
 * - null / undefined / "N/A" / "Error" always sort LAST, regardless of
 *   direction (invalid vs invalid is a tie).
 * - two numbers compare numerically, two strings via localeCompare.
 * - mixed/other types: behavior is call-site specific — see `mixedFallback`.
 */
export type SortDirection = "asc" | "desc";

/**
 * How to compare when values are neither both-numbers nor both-strings:
 * - "none": treat as a tie (DealContext's historical behavior).
 * - "stringify": coerce both to String and localeCompare (DeskScreen's
 *   historical behavior, which also covers its displayName column).
 */
export type MixedFallback = "none" | "stringify";

const isInvalidSortValue = (value: unknown): boolean =>
  value === null || value === undefined || value === "N/A" || value === "Error";

export const compareSortValues = (
  left: unknown,
  right: unknown,
  direction: SortDirection,
  mixedFallback: MixedFallback = "none"
): number => {
  const leftInvalid = isInvalidSortValue(left);
  const rightInvalid = isInvalidSortValue(right);

  if (leftInvalid && rightInvalid) return 0;
  if (leftInvalid) return 1;
  if (rightInvalid) return -1;

  if (typeof left === "number" && typeof right === "number") {
    return direction === "asc" ? left - right : right - left;
  }
  if (typeof left === "string" && typeof right === "string") {
    return direction === "asc" ? left.localeCompare(right) : right.localeCompare(left);
  }
  if (mixedFallback === "stringify") {
    const leftText = String(left);
    const rightText = String(right);
    return direction === "asc"
      ? leftText.localeCompare(rightText)
      : rightText.localeCompare(leftText);
  }
  return 0;
};
