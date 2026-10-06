import React from "react";

/**
 * Printed-paper classification from docs/MODEL_CARD.md §10, quoted verbatim.
 * The deal sheet and the Compare PDF carry no Truth-in-Lending companion
 * disclosures, so they are internal-use; every page footer of both says so.
 */
export const INTERNAL_USE_POLICY =
  "Printed deal worksheets are internal-use unless they carry the full Truth-in-Lending companion disclosures.";

export const InternalUseNotice: React.FC = () => (
  <p className="internal-use">
    <strong>Internal use only.</strong> {INTERNAL_USE_POLICY}
  </p>
);
