/**
 * Password policy: minimum length, character mix, and a check against
 * the haveibeenpwned breach corpus.
 *
 * Breach check uses k-anonymity: we hash the password with SHA-1 and only
 * send the first 5 chars (≈ 1/16th of a hex digit's entropy) to the HIBP
 * API. HIBP returns all hashes with that prefix; we check the rest locally.
 * The password itself is never transmitted.
 *
 * Reference: https://haveibeenpwned.com/API/v3#PwnedPasswords
 */

const MIN_LENGTH = 12;

export interface PolicyResult {
  ok: boolean;
  error?: string;
}

const sha1Hex = async (input: string): Promise<string> => {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
};

const structuralCheck = (password: string): PolicyResult => {
  if (password.length < MIN_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_LENGTH} characters.` };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, error: "Password must include at least one uppercase letter." };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, error: "Password must include at least one lowercase letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, error: "Password must include at least one number." };
  }
  return { ok: true };
};

/**
 * Returns { ok: false, error } if the password is too weak or appears in
 * the haveibeenpwned breach corpus. If the breach API is unreachable,
 * we degrade open (allow the password) — the policy still enforces
 * length + character mix, which is enough on its own.
 */
export const validatePassword = async (password: string): Promise<PolicyResult> => {
  const structural = structuralCheck(password);
  if (!structural.ok) return structural;

  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      // The Add-Padding header makes the response constant-size so an
      // observer can't infer popularity from response length.
      headers: { "Add-Padding": "true" },
    });
    if (!response.ok) return { ok: true }; // degrade open

    const body = await response.text();
    for (const line of body.split("\n")) {
      const [hashSuffix, countStr] = line.trim().split(":");
      if (hashSuffix === suffix) {
        const count = parseInt(countStr ?? "0", 10);
        if (count > 0) {
          return {
            ok: false,
            error: `This password has appeared in ${count.toLocaleString()} known data breaches. Please choose a different one.`,
          };
        }
      }
    }
    return { ok: true };
  } catch {
    return { ok: true }; // degrade open on network error
  }
};
