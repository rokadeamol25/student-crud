/**
 * Shows an error message with a "Try again" action for recovery.
 * Use when a fetch/list load fails so users don't have to refresh the page.
 */
export default function ErrorWithRetry({ message, onRetry, className = '' }) {
  return (
    <div className={`page__error page__error--with-retry ${className}`} role="alert">
      <span className="page__error-text">{message}</span>
      {onRetry && (
        <button
          type="button"
          className="btn btn--secondary btn--sm page__error-retry"
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </div>
  );
}
