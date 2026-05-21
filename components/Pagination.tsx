import React from "react";
import Button from "./common/Button";

interface PaginationProps {
  totalItems: number;
  pagination: {
    currentPage: number;
    rowsPerPage: number;
  };
  setPagination: React.Dispatch<React.SetStateAction<{ currentPage: number; rowsPerPage: number }>>;
}

const Pagination: React.FC<PaginationProps> = ({ totalItems, pagination, setPagination }) => {
  const { currentPage, rowsPerPage } = pagination;
  const totalPages = rowsPerPage === Infinity ? 1 : Math.ceil(totalItems / rowsPerPage);

  const handlePrev = () => {
    setPagination((prev) => ({ ...prev, currentPage: Math.max(1, prev.currentPage - 1) }));
  };

  const handleNext = () => {
    setPagination((prev) => ({ ...prev, currentPage: Math.min(totalPages, prev.currentPage + 1) }));
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value === "Infinity" ? Infinity : Number(e.target.value);
    setPagination({ currentPage: 1, rowsPerPage: value });
  };

  const pageInfo =
    rowsPerPage === Infinity
      ? `Showing all ${totalItems} vehicles`
      : `Page ${totalItems > 0 ? currentPage : 0} of ${totalPages}`;

  return (
    <div className="flex flex-wrap justify-between items-center py-3 px-4 border-t border-neutral-200 dark:border-neutral-800 gap-4 text-neutral-700 dark:text-neutral-200">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handlePrev}
          disabled={currentPage === 1 || totalItems === 0}
          aria-label="Go to previous page"
        >
          Previous
        </Button>
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 px-2 tabular">
          {pageInfo}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleNext}
          disabled={currentPage === totalPages || totalItems === 0}
          aria-label="Go to next page"
        >
          Next
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <label
          htmlFor="rowsPerPage"
          className="text-xs font-medium text-neutral-500 dark:text-neutral-400"
        >
          Rows:
        </label>
        <select
          id="rowsPerPage"
          value={rowsPerPage}
          onChange={handleRowsPerPageChange}
          className="px-2 py-1 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:focus:border-primary-400 text-neutral-700 dark:text-neutral-200"
        >
          <option value="15">15</option>
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="Infinity">All</option>
        </select>
      </div>
    </div>
  );
};

export default Pagination;
