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
    totalItems === 0
      ? 0
      : isShowAll
      ? 1
      : (currentPage - 1) * itemsPerPage + 1;
  const endItem = isShowAll
    ? totalItems
    : Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <span>
          Showing{" "}
          <span className="font-medium text-slate-900 dark:text-white">
            {startItem}
          </span>{" "}
          to{" "}
          <span className="font-medium text-slate-900 dark:text-white">
            {endItem}
          </span>{" "}
          of{" "}
          <span className="font-medium text-slate-900 dark:text-white">
            {totalItems}
          </span>{" "}
          results
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor="rows-per-page"
          className="text-sm text-slate-600 dark:text-slate-400"
        >
          Rows:
        </label>
        <select
          id="rows-per-page"
          value={isShowAll ? "all" : itemsPerPage}
          onChange={handleItemsPerPageChange}
          className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="15">15</option>
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="all">All</option>
        </select>

        <div className="flex items-center gap-2">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1 || isShowAll}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <Icons.ChevronLeftIcon className="w-4 h-4 mr-1" />
            Previous
          </button>

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

              return (
                <button
                  key={pageNum}
                  onClick={() => goToPage(pageNum)}
                  className={`inline-flex items-center justify-center w-10 h-10 text-sm font-medium rounded-lg transition-colors ${
                    currentPage === pageNum
                      ? "bg-blue-600 text-white"
                      : "text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                  }`}
                  aria-label={`Go to page ${pageNum}`}
                  aria-current={currentPage === pageNum ? "page" : undefined}
                  disabled={isShowAll}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages || isShowAll}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            Next
            <Icons.ChevronRightIcon className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Pagination;
