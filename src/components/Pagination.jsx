/**
 * Compact pagination: "Showing X–Y of Z" and Previous / Page N of M / Next.
 * Used on Products, Invoices, and other list pages.
 */
export default function Pagination({ page, totalItems, pageSize, onPageChange, ariaLabel = 'List' }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalItems);

  return (
    <nav className="pagination" role="navigation" aria-label={`${ariaLabel} pagination`}>
      <div className="pagination__info">
        <span className="pagination__range">
          Showing <strong>{start}</strong>–<strong>{end}</strong> of <strong>{totalItems}</strong>
        </span>
      </div>
      <div className="pagination__nav">
        <button
          type="button"
          className="pagination__btn"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          Previous
        </button>
        <span className="pagination__page-of" aria-live="polite">
          Page {page + 1} of {totalPages}
        </span>
        <button
          type="button"
          className="pagination__btn"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
