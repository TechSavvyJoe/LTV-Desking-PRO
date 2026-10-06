import type {
  CalculatedVehicle,
  DealData,
  EligibilityStatus,
  FilterData,
  LenderProfile,
  LenderTier,
  PendingCause,
} from "../types";
import { REVIEW_CONSTRAINT, SAMPLE_CONSTRAINT, checkBankEligibility } from "./lenderMatcher";

/**
 * lenderFit — aggregates the existing per-lender rules engine
 * (checkBankEligibility) into the "how many lenders fit" view the redesign
 * needs (the gauge's fitCount, the inventory "X/Y lenders" column, and the
 * Lenders matrix "units fitting" bars). It does NOT re-implement eligibility;
 * the rules engine stays the single source of truth. [WS-C]
 */

export interface LenderFitEntry {
  lenderId: string;
  name: string;
  eligible: boolean;
  status?: EligibilityStatus;
  reasons: string[];
  matchedTier: LenderTier | null;
  uncheckedConstraints?: string[];
  effectiveRate?: number | null;
  evaluatedConstraints?: number;
}

export interface PendingSummary {
  /** Active lenders whose result is held "pending" (unknown, not failed). */
  pendingCount: number;
  /** Most actionable cause across the pending lenders; null when none are pending. */
  pendingCause: PendingCause | null;
  /** One line saying what unblocks them (field names only); null when none are pending. */
  pendingReason: string | null;
}

export interface VehicleFit extends PendingSummary {
  entries: LenderFitEntry[];
  fitCount: number;
  fitNames: string[];
}

/* --- Pending causes ------------------------------------------------------ */

interface PendingCauseMeta {
  /** ≤ 3-word pill label (Lenders status column). */
  short: string;
  /** One-line reason for `count` pending lenders. */
  reason: (count: number) => string;
  /** Clause completing "N of M units are pending — …" on Reports. */
  rank: string;
}

const lendersWord = (n: number): string => `${n} lender${n === 1 ? "" : "s"}`;
const addTo =
  (field: string) =>
  (n: number): string =>
    `Add ${field} to check ${lendersWord(n)}`;

/**
 * Display metadata per cause. Keys are listed most-actionable first and that
 * order IS the priority `pendingCauseOf` uses: deal inputs the desk can supply
 * now, then vehicle data, then holds only an admin can clear (manual advance
 * check, AI review, sample verification). A sample lender missing a FICO says
 * "add a FICO" first; once the FICO is in, it says "verify sample".
 */
export const PENDING_CAUSE_META: Record<PendingCause, PendingCauseMeta> = {
  fico: {
    short: "Needs FICO",
    reason: addTo("a FICO score"),
    rank: "add a FICO on the desk to rank them",
  },
  income: {
    short: "Needs income",
    reason: addTo("monthly income"),
    rank: "add monthly income on the desk to rank them",
  },
  debt: {
    short: "Needs debt",
    reason: addTo("monthly debt"),
    rank: "add monthly debt on the desk to rank them",
  },
  term: {
    short: "Needs term",
    reason: addTo("a loan term"),
    rank: "set a loan term on the desk to rank them",
  },
  apr: {
    short: "Needs APR",
    reason: addTo("a quoted APR"),
    rank: "add a quoted APR on the desk to rank them",
  },
  backend: {
    short: "Needs backend",
    reason: addTo("the backend amount"),
    rank: "add the backend amount on the desk to rank them",
  },
  condition: {
    short: "Needs condition",
    reason: addTo("the vehicle condition"),
    rank: "set the vehicle condition on the desk to rank them",
  },
  mileage: {
    short: "Needs mileage",
    reason: addTo("vehicle mileage"),
    rank: "add mileage in Inventory to rank them",
  },
  year: {
    short: "Needs model year",
    reason: addTo("a model year"),
    rank: "add model years in Inventory to rank them",
  },
  make: {
    short: "Needs make",
    reason: addTo("the vehicle make"),
    rank: "add makes in Inventory to rank them",
  },
  book: {
    short: "Needs book value",
    reason: addTo("a book value"),
    rank: "add book values in Inventory to rank them",
  },
  payment: {
    short: "Needs payment",
    reason: (n) => `Complete the payment inputs to check ${lendersWord(n)}`,
    rank: "complete the payment inputs on the desk to rank them",
  },
  other: {
    short: "Pending",
    reason: (n) => `${lendersWord(n)} pending required information`,
    rank: "complete the deal on the desk to rank them",
  },
  advance: {
    short: "Verify advance",
    reason: (n) => `Max advance must be verified by hand for ${lendersWord(n)}`,
    rank: "max advance must be verified by hand before they count",
  },
  review: {
    short: "Needs review",
    reason: () => "Flagged tiers must be reviewed before they count",
    rank: "review the flagged tiers on Lenders to rank them",
  },
  sample: {
    short: "Verify sample",
    reason: () => "Sample programs must be verified before they count",
    rank: "verify the sample programs on Lenders to rank them",
  },
};

const CAUSE_PRIORITY = Object.keys(PENDING_CAUSE_META) as PendingCause[];

/** Classify one unchecked-constraint name from the rules engine. */
const causeOfConstraint = (constraint: string): PendingCause => {
  if (constraint === SAMPLE_CONSTRAINT) return "sample";
  if (constraint === REVIEW_CONSTRAINT) return "review";
  const c = constraint.toLowerCase();
  if (c === "credit score") return "fico";
  if (c.startsWith("monthly income")) return "income";
  if (c.startsWith("monthly debt")) return "debt";
  if (c.startsWith("computed payment")) return "payment";
  if (c === "loan term") return "term";
  if (c === "quoted apr") return "apr";
  if (c.startsWith("backend amount")) return "backend";
  if (c === "vehicle condition" || c === "certified vehicle status") return "condition";
  if (c === "vehicle mileage") return "mileage";
  if (c === "vehicle model year") return "year";
  if (c === "vehicle make") return "make";
  if (c.startsWith("book value") || c === "front-end ltv") return "book";
  if (c.startsWith("max advance")) return "advance";
  return "other";
};

const causesOf = (unchecked: readonly string[] | undefined): Set<PendingCause> =>
  new Set((unchecked ?? []).map(causeOfConstraint));

/** The most actionable cause holding one lender's check at pending. */
export const pendingCauseOf = (unchecked: readonly string[] | undefined): PendingCause => {
  const causes = causesOf(unchecked);
  return CAUSE_PRIORITY.find((cause) => causes.has(cause)) ?? "other";
};

const entryStatus = (e: LenderFitEntry): EligibilityStatus =>
  e.status ?? (e.eligible ? "eligible" : "ineligible");

/**
 * Summarize the pending entries for one vehicle: how many are held, the most
 * actionable cause across them, and a one-line reason that counts only the
 * lenders that cause actually blocks ("Add a FICO score to check 11 lenders").
 */
export const summarizePending = (entries: readonly LenderFitEntry[]): PendingSummary => {
  const pending = entries.filter((e) => entryStatus(e) === "pending");
  if (pending.length === 0) return { pendingCount: 0, pendingCause: null, pendingReason: null };
  const perEntry = pending.map((e) => causesOf(e.uncheckedConstraints));
  const cause =
    CAUSE_PRIORITY.find((c) => perEntry.some((causes) => causes.has(c))) ??
    ("other" as PendingCause);
  const blocked = perEntry.filter((causes) => causes.has(cause)).length || pending.length;
  return {
    pendingCount: pending.length,
    pendingCause: cause,
    pendingReason: PENDING_CAUSE_META[cause].reason(blocked),
  };
};

const isActive = (l: LenderProfile): boolean => l.active !== false;

const statusRank: Record<EligibilityStatus, number> = {
  eligible: 0,
  pending: 1,
  ineligible: 2,
};

const compareText = (left: string, right: string): number => {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
};

/** Verified fits rank by published effective rate, then evaluated rule quality. */
const compareFitEntries = (left: LenderFitEntry, right: LenderFitEntry): number => {
  const leftStatus = left.status ?? (left.eligible ? "eligible" : "ineligible");
  const rightStatus = right.status ?? (right.eligible ? "eligible" : "ineligible");
  const statusDelta = statusRank[leftStatus] - statusRank[rightStatus];
  if (statusDelta !== 0) return statusDelta;
  const leftUnchecked = left.uncheckedConstraints?.length ?? 0;
  const rightUnchecked = right.uncheckedConstraints?.length ?? 0;
  if (leftUnchecked !== rightUnchecked) {
    return leftUnchecked - rightUnchecked;
  }
  const leftRate = left.effectiveRate ?? null;
  const rightRate = right.effectiveRate ?? null;
  if (leftRate === null && rightRate !== null) return 1;
  if (leftRate !== null && rightRate === null) return -1;
  if (leftRate !== null && rightRate !== null) {
    const rateDelta = leftRate - rightRate;
    if (rateDelta !== 0) return rateDelta;
  }
  const leftEvaluated = left.evaluatedConstraints ?? 0;
  const rightEvaluated = right.evaluatedConstraints ?? 0;
  if (leftEvaluated !== rightEvaluated) {
    return rightEvaluated - leftEvaluated;
  }
  const nameDelta = compareText(left.name, right.name);
  return nameDelta !== 0 ? nameDelta : compareText(left.lenderId, right.lenderId);
};

/** Per-vehicle lender fit across all active lenders. */
export const lenderFitForVehicle = (
  vehicle: CalculatedVehicle,
  deal: DealData & FilterData,
  lenders: LenderProfile[]
): VehicleFit => {
  const entries: LenderFitEntry[] = [];
  for (const lender of lenders) {
    if (!lender || !isActive(lender)) continue;
    const r = checkBankEligibility(vehicle, deal, lender);
    const status: EligibilityStatus =
      r.status ??
      (r.eligible
        ? "eligible"
        : Array.isArray(r.uncheckedConstraints) && r.uncheckedConstraints.length > 0
          ? "pending"
          : "ineligible");
    entries.push({
      lenderId: lender.id,
      name: lender.name,
      eligible: r.eligible,
      status,
      reasons: r.reasons,
      matchedTier: r.matchedTier,
      uncheckedConstraints: r.uncheckedConstraints ?? [],
      effectiveRate: r.effectiveRate ?? null,
      evaluatedConstraints: r.evaluatedConstraints ?? 0,
    });
  }
  entries.sort(compareFitEntries);
  const fit = entries.filter((e) => entryStatus(e) === "eligible" && e.eligible);
  return {
    entries,
    fitCount: fit.length,
    fitNames: fit.map((e) => e.name),
    ...summarizePending(entries),
  };
};

/** Count of inventory units each active lender currently fits. */
export const unitsForEachLender = (
  inventory: CalculatedVehicle[],
  deal: DealData & FilterData,
  lenders: LenderProfile[]
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const lender of lenders) {
    if (!lender || !isActive(lender)) continue;
    let n = 0;
    for (const v of inventory) {
      if (checkBankEligibility(v, deal, lender).eligible) n++;
    }
    counts[lender.id] = n;
  }
  return counts;
};

/** Total number of active lenders (denominator for "X / Y lenders fit"). */
export const activeLenderCount = (lenders: LenderProfile[]): number =>
  lenders.filter((l) => l && isActive(l)).length;
