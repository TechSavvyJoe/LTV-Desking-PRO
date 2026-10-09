import { describe, expect, it } from "vitest";
import { programReviewHold } from "./programTrust";

describe("lender program provenance", () => {
  const today = new Date("2026-10-08T23:59:59Z");
  it("holds extracted drafts even when their numbers are plausible", () => {
    expect(programReviewHold({ reviewRequired: true }, today)).toMatch(/human review/);
  });
  it("honors inclusive explicit expiration and never invents an expiry", () => {
    expect(programReviewHold({ expiresOn: "2026-10-08" }, today)).toBeNull();
    expect(programReviewHold({ expiresOn: "2026-10-07" }, today)).toMatch(/expired/);
    expect(programReviewHold({}, today)).toBeNull();
  });
  it("holds impossible and malformed recorded dates", () => {
    for (const expiresOn of ["2026-02-30", "10/08/2026", "invalid"])
      expect(programReviewHold({ expiresOn }, today)).toMatch(/needs review/);
  });
});
