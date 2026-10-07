import React from "react";
import { fmt } from "../../utils/format";
import { DOWN_LABELS } from "./deskConstants";

interface StructureMatrixProps {
  grid: {
    term: number;
    cells: {
      down: number;
      pay: number | null;
      fits?: number;
      pending?: number;
      interest?: number | null;
    }[];
  }[];
  loanTerm: number;
  downPayment: number;
  onSetTermDown: (term: number, down: number) => void;
}

const StructureMatrix: React.FC<StructureMatrixProps> = ({
  grid,
  loanTerm,
  downPayment,
  onSetTermDown,
}) => (
  <section className="desk-panel-section">
    <div className="desk-panel-heading">
      <span>Payment options</span>
      <strong>Term × cash down</strong>
    </div>
    <div className="desk-matrix">
      <div className="desk-matrix-head">
        <span />
        {DOWN_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {grid.map((row) => (
        <div key={row.term} className="desk-matrix-row">
          <span>{row.term}mo</span>
          {row.cells.map((cell) => (
            <button
              type="button"
              key={`${row.term}-${cell.down}`}
              className="desk-matrix-cell transition-colors"
              data-active={row.term === loanTerm && cell.down === downPayment}
              aria-label={`${row.term} months, ${fmt(cell.down)} down, ${cell.pay === null ? "payment unknown" : `${fmt(cell.pay)} estimated payment`}${cell.fits === undefined ? "" : `, ${cell.fits} verified program fits, ${cell.pending} pending`}`}
              title={
                cell.interest === undefined || cell.interest === null
                  ? undefined
                  : `${fmt(cell.interest)} estimated total interest`
              }
              onClick={() => onSetTermDown(row.term, cell.down)}
            >
              {cell.pay === null ? "—" : fmt(cell.pay)}
              {cell.fits !== undefined && (
                <small className="desk-matrix-fit">
                  {cell.fits} {cell.fits === 1 ? "fit" : "fits"}
                </small>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
    <p className="desk-matrix-note">
      Select a payment to apply the term and down payment. Fit counts exclude pending programs.
    </p>
  </section>
);

export default React.memo(StructureMatrix);
