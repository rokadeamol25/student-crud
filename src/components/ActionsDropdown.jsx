import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getActionIcon } from './Icons';

/**
 * Items: { label, icon?, href?, onClick?, danger?, disabled? }
 * icon: 'view' | 'edit' | 'delete' | 'send' | 'recordPayment' | 'markPaid'
 * Exactly one of href or onClick per item (or disabled).
 */
export default function ActionsDropdown({ items, label = 'Actions', className = '', ariaLabel = 'Row actions' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [open]);

  function renderItemContent(item) {
    const icon = getActionIcon(item.icon);
    return (
      <>
        {icon && <span className="actions-dropdown__icon">{icon}</span>}
        {item.label}
      </>
    );
  }

  return (
    <div className={`actions-dropdown ${className}`} ref={ref} data-open={open ? 'true' : undefined}>
      <button
        type="button"
        className="btn btn--ghost btn--sm actions-dropdown__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={ariaLabel}
      >
        {label}
        <span className="actions-dropdown__chevron" aria-hidden>▼</span>
      </button>
      {open && (
        <div className="actions-dropdown__menu" role="menu">
          {items.filter((i) => !i.hidden).map((item, idx) => {
            if (item.disabled) {
              return (
                <span key={idx} className="actions-dropdown__item actions-dropdown__item--disabled" role="menuitem">
                  {renderItemContent(item)}
                </span>
              );
            }
            const cn = `actions-dropdown__item ${item.danger ? 'actions-dropdown__item--danger' : ''}`;
            if (item.href) {
              return (
                <Link
                  key={idx}
                  to={item.href}
                  className={cn}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  {renderItemContent(item)}
                </Link>
              );
            }
            return (
              <button
                key={idx}
                type="button"
                className={cn}
                role="menuitem"
                onClick={() => {
                  item.onClick?.();
                  setOpen(false);
                }}
              >
                {renderItemContent(item)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
