import type { LenderProfile } from "../types";

/** An expiration is enforced only when the dealer actually records one. */
export function programReviewHold(
  profile: Pick<LenderProfile, "reviewRequired" | "expiresOn">,
  asOf: Date = new Date()
): string | null {
  if (profile.reviewRequired) return "Program needs human review against its source document.";
  const expiry = profile.expiresOn?.trim();
  if (!expiry) return null;
  const parsed = new Date(`${expiry}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(expiry) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== expiry
  ) {
    return "Program expiration needs review; confirm the date on the source document.";
  }
  return expiry < asOf.toISOString().slice(0, 10)
    ? "Program has expired; review a current source document."
    : null;
}
