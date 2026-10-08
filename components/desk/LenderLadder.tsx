import React from "react";
import { entryStatus } from "../../services/lenderFit";
import type { LenderFitEntry } from "../../services/lenderFit";
import type { LenderProfile } from "../../types";
import { metaItem, sansNum } from "./deskConstants";

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
  if (ltv == null && term == null) return <NoneListed label="limits" />;
  return (
    <>
      <span style={{ ...metaItem, ...sansNum }}>
        {ltv != null ? (
          <>
            <span className="sr-only">max LTV </span>
            {`${Math.round(ltv)}%`}
          </>
        ) : (
          <NoneListed label="max LTV" />
        )}
      </span>{" "}
      <span style={sansNum}>
        {term != null ? (
          <>
            <span className="sr-only">max term </span>
            {`${term} mo`}
          </>
        ) : (
          <NoneListed label="max term" />
        )}
      </span>
    </>
  );
};

/** A missing limit: a dash on screen, "<label> none listed" to a screen reader. */
const NoneListed: React.FC<{ label: string }> = ({ label }) => (
  <>
    <span aria-hidden="true">—</span>
    <span className="sr-only">{label} none listed</span>
  </>
);

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
          style={{
            ...sansNum,
            color:
              fitCount > 0
                ? "var(--color-success)"
                : pending
                  ? "var(--color-text-muted)"
                  : "var(--color-warning)",
          }}
          title={pending ? `${pendingCount} pending lender checks` : undefined}
        >
          {pendingCount > 0
            ? `${fitCount} fit · ${pendingCount} pending`
            : `${fitCount}/${totalLenders} fit`}
        </strong>
      </div>
      {/* Lists, one item per lender, so each path is its own stop rather
          than one run of text. role="list" keeps the semantics in Safari,
          which drops them from unstyled lists. */}
      {fitNames.length > 0 && (
        <ul className="desk-lender-paths" role="list" aria-label="Lenders that fit">
          {fitNames.slice(0, 3).map((name) => (
            // A shrinkable flex box, so the pill is a block flex item again:
            // its padding, max-width and ellipsis apply (inline spans ignore them).
            <li key={name} className="flex min-w-0 max-w-full">
              <span>{name}</span>
            </li>
          ))}
        </ul>
      )}
      <ul className="desk-lender-list" role="list">
        {visible.map((entry) => {
          const profile = profilesById.get(entry.lenderId);
          return (
            <li key={entry.lenderId} className="desk-lender-row">
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
              {!limit && (
                <details className="desk-lender-evidence">
                  <summary aria-label={`${entry.name} program details`}>Program details</summary>
                  <p>
                    {entry.evaluatedConstraints ?? 0} configured constraints evaluated. Book basis:{" "}
                    {profile?.bookValueSource ?? "Trade (required)"}.
                  </p>
                  {entry.effectiveRate != null && (
                    <p>
                      Listed buy rate + adder: {entry.effectiveRate.toFixed(2)}%. Payment uses the
                      interest rate entered on the desk.
                    </p>
                  )}
                  {entry.reasons.length > 0 ? (
                    <ul>
                      {entry.reasons.map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      Configured rules pass for the entered structure. This is not a lender
                      approval.
                    </p>
                  )}
                  {profile?.effectiveDate && <p>Program effective date: {profile.effectiveDate}</p>}
                  <p>Source: {profile?.sourceReference || "No source reference recorded"}</p>
                  <p>
                    Valid through: {profile?.expiresOn || "Not specified — confirm with lender"}
                  </p>
                  <p>
                    Source review:{" "}
                    {profile?.reviewRequired
                      ? "Pending"
                      : profile?.verifiedAt
                        ? new Date(profile.verifiedAt).toLocaleDateString("en-US")
                        : "Not recorded"}
                  </p>
                  {profile?.stipulations && <p>Stipulations: {profile.stipulations}</p>}
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default React.memo(LenderLadder);
