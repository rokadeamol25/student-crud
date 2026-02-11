/**
 * Reusable confirm modal for destructive actions and status changes.
 * Use instead of window.confirm for consistent UX.
 * Accessibility: focus trap, Escape to close, return focus to trigger (pass returnFocusRef).
 */
import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
  returnFocusRef,
}) {
  const modalRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const previousActiveRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    previousActiveRef.current = document.activeElement;

    const modal = modalRef.current;
    if (!modal) return;

    // Focus primary action (confirm) when opened
    const confirmBtn = confirmBtnRef.current;
    if (confirmBtn) {
      confirmBtn.focus();
    } else {
      const focusable = modal.querySelectorAll(FOCUSABLE);
      if (focusable.length) focusable[0].focus();
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = [...modal.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.tabIndex >= 0 && !el.disabled
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    modal.addEventListener('keydown', handleKeyDown);
    return () => {
      modal.removeEventListener('keydown', handleKeyDown);
      const toFocus = returnFocusRef?.current ?? previousActiveRef.current;
      if (toFocus && typeof toFocus.focus === 'function') {
        toFocus.focus();
      }
    };
  }, [open, onCancel, returnFocusRef]);

  if (!open) return null;

  const titleId = 'confirm-dialog-title';

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={message ? 'confirm-dialog-desc' : undefined}
      onClick={onCancel}
    >
      <div className="modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId} className="modal__title">{title}</h2>
        {message && <p id="confirm-dialog-desc" className="modal__body">{message}</p>}
        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={danger ? 'btn btn--danger' : 'btn btn--primary'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
