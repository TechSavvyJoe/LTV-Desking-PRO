
import React from 'react';
import Button from './common/Button';

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
    setPagination(prev => ({ ...prev, currentPage: Math.max(1, prev.currentPage - 1) }));
  };

  const handleNext = () => {
    setPagination(prev => ({ ...prev, currentPage: Math.min(totalPages, prev.currentPage + 1) }));
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value === 'Infinity' ? Infinity : Number(e.target.value);
    setPagination({ currentPage: 1, rowsPerPage: value });
  };

  const pageInfo = rowsPerPage === Infinity ? `Showing all ${totalItems} vehicles` : `Page ${totalItems > 0 ? currentPage : 0} of ${totalPages}`;

  return (
    <div className="flex flex-wrap justify-between items-center mt-4 py-3 border-t border-x-border gap-4">
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={handlePrev} disabled={currentPage === 1 || totalItems === 0}>Previous</Button>
        <span className="text-sm font-medium text-x-text-secondary px-2">{pageInfo}</span>
        <Button variant="secondary" onClick={handleNext} disabled={currentPage === totalPages || totalItems === 0}>Next</Button>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="rowsPerPage" className="text-sm font-medium text-x-text-secondary">Rows:</label>
        <select
          id="rowsPerPage"
          value={rowsPerPage}
          onChange={handleRowsPerPageChange}
          className="px-3 py-1.5 text-sm bg-x-black border border-x-border rounded-md focus:outline-none focus:ring-1 focus:ring-x-blue focus:border-x-blue"
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