import React from "react";
import { fmt } from "../../utils/format";
import { DOWN_LABELS } from "./deskConstants";

interface StructureMatrixProps {
  grid: { term: number; cells: { down: number; pay: number | null }[] }[];
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
      <span>Desking grid</span>
      <strong>Term × down</strong>
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
              onClick={() => onSetTermDown(row.term, cell.down)}
            >
              {cell.pay === null ? "—" : fmt(cell.pay)}
            </button>
          ))}
        </div>
      ))}
    </div>
  </section>
);

export default React.memo(StructureMatrix);
