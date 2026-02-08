/**
 * Empty state for lists (products, customers, invoices).
 * Shows icon/title/description and primary action.
 */
export default function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon = null,
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state__icon">{icon}</div>}
      <h3 className="empty-state__title">{title}</h3>
      {description && <p className="empty-state__desc">{description}</p>}
      {actionLabel && onAction && (
        <button type="button" className="btn btn--primary empty-state__action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
