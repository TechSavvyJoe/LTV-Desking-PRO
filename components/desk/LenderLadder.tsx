import React from "react";
import { entryStatus } from "../../services/lenderFit";
import type { LenderFitEntry } from "../../services/lenderFit";
import type { LenderProfile } from "../../types";
import { fitCountColor, metaItem, sansNum } from "./deskConstants";

/** Max of a tier field across a lender's tiers — the honest lender-level ceiling. */
const maxOverTiers = (
  profile: LenderProfile | undefined,
  pick: (t: LenderProfile["tiers"][number]) => number | undefined
): number | null => {
  if (!profile?.tiers?.length) return null;
  let best: number | null = null;
  for (const t of profile.tiers) {
    const n = pick(t);
    if (typeof n === "number" && Number.isFinite(n) && (best === null || n > best)) best = n;
  }
  return best;
};

const lenderMeta = (entry: LenderFitEntry, profile: LenderProfile | undefined): React.ReactNode => {
  const tier = entry.matchedTier;
  const ltv =
    tier?.maxLtv ??
    tier?.otdLtv ??
    tier?.frontEndLtv ??
    maxOverTiers(profile, (t) => t.maxLtv ?? t.otdLtv ?? t.frontEndLtv);
  const term = tier?.maxTerm ?? maxOverTiers(profile, (t) => t.maxTerm);
  if (ltv == null && term == null) return "—";
  return (
    <>
      <span style={{ ...metaItem, ...sansNum }}>{ltv != null ? `${Math.round(ltv)}%` : "—"}</span>{" "}
      <span style={sansNum}>{term != null ? `${term} mo` : "—"}</span>
    </>
  );
};

interface LenderLadderProps {
  entries: LenderFitEntry[];
  fitNames: string[];
  profilesById: Map<string, LenderProfile>;
  fitCount: number;
  totalLenders: number;
  /** Lenders whose check is held pending; a 0 fit count with any pending reads neutral. */
  pendingCount?: number;
  limit?: number;
}

const LenderLadder: React.FC<LenderLadderProps> = ({
  entries,
  fitNames,
  profilesById,
  fitCount,
  totalLenders,
  pendingCount = 0,
  limit,
}) => {
  const visible = (limit ? entries.slice(0, limit) : entries).filter(Boolean);
  const pending = fitCount <= 0 && pendingCount > 0;
  return (
    <section className="desk-panel-section">
      <div className="desk-panel-heading">
        <span>Lender paths</span>
        <strong
          style={{ ...sansNum, color: fitCountColor(fitCount, pending) }}
          title={pending ? `${pendingCount} pending lender checks` : undefined}
        >
          {fitCount}/{totalLenders}
        </strong>
      </div>
      {fitNames.length > 0 && (
        <div className="desk-lender-paths">
          {fitNames.slice(0, 3).map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
      )}
      <div className="desk-lender-list">
        {visible.map((entry) => {
          const profile = profilesById.get(entry.lenderId);
          return (
            <div key={entry.lenderId} className="desk-lender-row">
              {/* Three states, never conflated: fits / held pending a check / declined. */}
              <span
                className="desk-lender-badge"
                data-fit={entry.eligible}
                data-status={entryStatus(entry)}
              >
                {entry.eligible ? "Fit" : entryStatus(entry) === "pending" ? "Pending" : "No fit"}
              </span>
              <span className="desk-lender-name" title={entry.name}>
                {entry.name}
              </span>
              <span className="desk-lender-meta" style={sansNum}>
                {lenderMeta(entry, profile)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default React.memo(LenderLadder);
