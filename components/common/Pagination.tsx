import React from "react";
import * as Icons from "./Icons";

interface PaginationProps {
  totalItems: number;
  pagination: {
    currentPage: number;
    itemsPerPage: number;
  };
  setPagination: (pagination: {
    currentPage: number;
    itemsPerPage: number;
  }) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  totalItems,
  pagination,
  setPagination,
}) => {
  const { currentPage, itemsPerPage } = pagination;
  const isShowAll = itemsPerPage === Infinity;
  const totalPages = isShowAll
    ? 1
    : Math.max(1, Math.ceil(totalItems / itemsPerPage));

  const goToPage = (page: number) => {
    if (isShowAll) return;
    if (page < 1 || page > totalPages) return;
    setPagination({ ...pagination, currentPage: page });
  };

  const handleItemsPerPageChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value === "all" ? Infinity : Number(e.target.value);
    setPagination({ currentPage: 1, itemsPerPage: value });
  };

  const startItem =
    totalItems === 0 ? 0 : isShowAll ? 1 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = isShowAll
    ? totalItems
    : Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between px-5 py-4 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
      {/* Results Info */}
      <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
        <span>Showing</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">
          {startItem}–{endItem}
        </span>
        <span>of</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">
          {totalItems.toLocaleString()}
        </span>
        <span>results</span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Rows per page */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="rows-per-page"
            className="text-sm text-slate-500 dark:text-slate-400"
          >
            Rows:
          </label>
          <select
            id="rows-per-page"
            value={isShowAll ? "all" : itemsPerPage}
            onChange={handleItemsPerPageChange}
            className="
              px-3 py-2 text-sm font-medium
              bg-white dark:bg-slate-800
              border border-slate-200 dark:border-slate-700
              rounded-lg
              text-slate-700 dark:text-slate-200
              focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
              transition-all duration-150
              cursor-pointer
            "
          >
            <option value="15">15</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">All</option>
          </select>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1.5">
          {/* Previous Button */}
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1 || isShowAll}
            className="
              inline-flex items-center gap-1.5
              px-3 py-2
              text-sm font-medium
              text-slate-600 dark:text-slate-300
              bg-white dark:bg-slate-800
              border border-slate-200 dark:border-slate-700
              rounded-lg
              hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-800
              transition-all duration-150
            "
            aria-label="Previous page"
          >
            <Icons.ChevronLeftIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Prev</span>
          </button>

          {/* Page Numbers */}
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              const isActive = currentPage === pageNum;

              return (
                <button
                  key={pageNum}
                  onClick={() => goToPage(pageNum)}
                  className={`
                    inline-flex items-center justify-center
                    w-10 h-10
                    text-sm font-semibold
                    rounded-lg
                    transition-all duration-150
                    ${
                      isActive
                        ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/25"
                        : "text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                    }
                    disabled:opacity-40 disabled:cursor-not-allowed
                  `}
                  aria-label={`Go to page ${pageNum}`}
                  aria-current={isActive ? "page" : undefined}
                  disabled={isShowAll}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          {/* Next Button */}
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages || isShowAll}
            className="
              inline-flex items-center gap-1.5
              px-3 py-2
              text-sm font-medium
              text-slate-600 dark:text-slate-300
              bg-white dark:bg-slate-800
              border border-slate-200 dark:border-slate-700
              rounded-lg
              hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-800
              transition-all duration-150
            "
            aria-label="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <Icons.ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Pagination;
