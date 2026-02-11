import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import { columnLabel, INVOICE_COLS_BY_TRACKING_TYPE } from '../config/businessTypes';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import { amountInWords, formatDatePrint } from '../lib/amountInWords';
import html2pdf from 'html2pdf.js';
import ErrorWithRetry from '../components/ErrorWithRetry';
import ConfirmDialog from '../components/ConfirmDialog';

/**
 * Clean view / print page for an invoice.
 * Status changes & deletion are handled on the list page.
 * This page focuses on: View, Print, PDF download, Payments.
 */
export default function InvoicePrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const { invoiceLineItems, showRoughBillRef: showRoughBillRefEnabled, invoiceTitleLabel, legalName } = useBusinessConfig();
  const invoiceTitle = (invoiceTitleLabel || 'Invoice').toString().trim().toUpperCase() || 'INVOICE';
  const defaultTrackingType = tenant?.feature_config?.defaultTrackingType || 'quantity';
  const extraInvCols = (() => {
    const allowed = INVOICE_COLS_BY_TRACKING_TYPE[defaultTrackingType];
    return Object.keys(invoiceLineItems).filter((k) => {
      if (!invoiceLineItems[k]) return false;
      if (k === 'imei') return false;
      if (!allowed) return true;
      return allowed.includes(k);
    });
  })();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const printAreaRef = useRef(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_method: 'cash', reference: '', paid_at: new Date().toISOString().slice(0, 10) });
  const [deletingPaymentId, setDeletingPaymentId] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchInvoice = useCallback(() => {
    if (!token || !id) return;
    return api.get(token, `/api/invoices/${id}`)
      .then(setInvoice)
      .catch((e) => setError(e.message || "We couldn't load the invoice. Check your connection and try again."));
  }, [token, id]);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    fetchInvoice().finally(() => setLoading(false));
  }, [token, id, fetchInvoice]);

  // Apply tenant page size for print/PDF (A4 or Letter)
  useEffect(() => {
    const size = tenant?.invoice_page_size === 'Letter' ? 'Letter' : 'A4';
    let styleEl = document.getElementById('invoice-page-size-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'invoice-page-size-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `@media print { @page { size: ${size}; } }`;
    return () => {
      const s = document.getElementById('invoice-page-size-style');
      if (s) s.textContent = '';
    };
  }, [tenant?.invoice_page_size]);

  // CSS variables that define the dark theme — override them to white-paper values
  // on the captured element so html2canvas sees white bg / black text.
  const WHITE_PAPER_VARS = {
    '--bg': '#fff',
    '--bg-elevated': '#fff',
    '--bg-card': '#fff',
    '--text': '#000',
    '--text-muted': '#444',
    '--accent': '#000',
    '--accent-hover': '#000',
    '--border': '#333',
    '--shadow': 'none',
    '--shadow-lg': 'none',
    '--overlay': 'transparent',
  };

  async function handleDownloadPdf() {
    const el = printAreaRef.current;
    if (!el || !invoice) return;
    setPdfGenerating(true);
    try {
      const pageSize = tenant?.invoice_page_size === 'Letter' ? 'letter' : 'a4';

      // 1. Override CSS variables on the element so every var() resolves to white-paper values
      Object.entries(WHITE_PAPER_VARS).forEach(([k, v]) => el.style.setProperty(k, v));
      el.style.background = '#fff';
      el.style.color = '#000';
      el.style.border = 'none';
      el.style.boxShadow = 'none';

      // 2. Override badges (they use hard-coded rgba not variables)
      const badges = el.querySelectorAll('.badge');
      badges.forEach((b) => {
        b.dataset.origStyle = b.style.cssText;
        b.style.cssText = 'background:#fff !important;color:#000 !important;border:1px solid #555 !important;';
      });

      // 3. Override table header for white-paper readability
      const thead = el.querySelector('.invoice-print__table thead tr');
      if (thead) { thead.dataset.origStyle = thead.style.cssText; thead.style.cssText = 'background:#f0f0f0 !important;'; }
      const ths = el.querySelectorAll('.invoice-print__table th');
      ths.forEach((th) => { th.dataset.origStyle = th.style.cssText; th.style.cssText += 'color:#000 !important;'; });

      // 4. Expand table for capture
      const tableWrap = el.querySelector('.invoice-print__table-wrap');
      if (tableWrap) { tableWrap.style.overflow = 'visible'; tableWrap.style.minWidth = '0'; }
      const table = el.querySelector('.invoice-print__table');
      if (table) table.style.minWidth = '0';

      const origWidth = el.style.width;
      const origMaxWidth = el.style.maxWidth;
      el.style.width = '700px';
      el.style.maxWidth = '700px';

      // 4. Wait one frame so browser paints the white version
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 80)));

      // 5. Capture
      await html2pdf()
        .set({
          margin: [8, 5, 8, 5],
          filename: `invoice-${(invoice.invoice_number || 'invoice').replace(/\s+/g, '-')}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0, windowWidth: 700, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: pageSize, orientation: 'portrait' },
        })
        .from(el)
        .save();

      // 6. Restore everything
      Object.keys(WHITE_PAPER_VARS).forEach((k) => el.style.removeProperty(k));
      el.style.background = '';
      el.style.color = '';
      el.style.border = '';
      el.style.boxShadow = '';
      el.style.width = origWidth;
      el.style.maxWidth = origMaxWidth;
      badges.forEach((b) => { b.style.cssText = b.dataset.origStyle || ''; delete b.dataset.origStyle; });
      if (thead) { thead.style.cssText = thead.dataset.origStyle || ''; delete thead.dataset.origStyle; }
      ths.forEach((th) => { th.style.cssText = th.dataset.origStyle || ''; delete th.dataset.origStyle; });
      if (tableWrap) { tableWrap.style.overflow = ''; tableWrap.style.minWidth = ''; }
      if (table) table.style.minWidth = '';

      showToast('PDF downloaded', 'success');
    } catch (e) {
      showToast(e?.message || 'Failed to generate PDF', 'error');
    } finally {
      setPdfGenerating(false);
    }
  }

  function openPaymentModal() {
    const balance = Number(invoice?.balance) ?? (Number(invoice?.total) - Number(invoice?.amount_paid ?? 0));
    setPaymentForm({
      amount: balance > 0 ? String(balance) : '',
      payment_method: 'cash',
      reference: '',
      paid_at: new Date().toISOString().slice(0, 10),
    });
    setPaymentModalOpen(true);
  }

  async function handleRecordPayment(e) {
    e.preventDefault();
    if (!token || !id) return;
    const amount = parseFloat(paymentForm.amount, 10);
    if (Number.isNaN(amount) || amount <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    const balance = Number(invoice?.balance) ?? (Number(invoice?.total) - Number(invoice?.amount_paid ?? 0));
    if (amount > balance) {
      showToast(`Amount cannot exceed balance due (${formatMoney(balance, tenant)})`, 'error');
      return;
    }
    setPaymentSubmitting(true);
    try {
      await api.post(token, `/api/invoices/${id}/payments`, {
        amount: Math.round(amount * 100) / 100,
        payment_method: paymentForm.payment_method,
        reference: (paymentForm.reference || '').trim() || undefined,
        paid_at: paymentForm.paid_at || undefined,
      });
      await fetchInvoice();
      setPaymentModalOpen(false);
      showToast('Payment recorded', 'success');
    } catch (e) {
      showToast(e?.message || 'Failed to record payment', 'error');
    } finally {
      setPaymentSubmitting(false);
    }
  }

  async function handleDeletePayment(paymentId) {
    if (!token || !id) return;
    setDeletingPaymentId(paymentId);
    try {
      await api.del(token, `/api/invoices/${id}/payments/${paymentId}`);
      await fetchInvoice();
      showToast('Payment removed', 'success');
    } catch (e) {
      showToast(e?.message || 'Failed to remove payment', 'error');
    } finally {
      setDeletingPaymentId(null);
    }
  }

  async function handleStatusUpdate(newStatus) {
    if (!token || !invoice) return;
    setStatusUpdating(true);
    try {
      await api.patch(token, `/api/invoices/${invoice.id}`, { status: newStatus });
      showToast(newStatus === 'sent' ? 'Marked as sent' : 'Marked as paid', 'success');
      await fetchInvoice();
    } catch (e) {
      showToast(e?.message || 'Failed to update', 'error');
    } finally {
      setStatusUpdating(false);
    }
  }

  async function handleDelete() {
    if (!token || !invoice) return;
    setDeleting(true);
    try {
      await api.del(token, `/api/invoices/${invoice.id}`);
      showToast('Invoice deleted', 'success');
      setDeleteConfirmOpen(false);
      navigate('/invoices');
    } catch (e) {
      showToast(e?.message || 'Failed to delete', 'error');
    } finally {
      setDeleting(false);
    }
  }

  if (loading && !invoice) {
    return (
      <div className="page">
        <p className="page__subtitle" style={{ marginBottom: '1rem' }}><Link to="/invoices" className="btn btn--ghost btn--sm">Back to list</Link></p>
        <div className="card page__section">
          <div className="skeleton skeleton--text" style={{ width: '50%', height: '1.5rem', marginBottom: '1rem' }} />
          <div className="skeleton skeleton--text" style={{ width: '70%', height: '1rem' }} />
          <div className="skeleton skeleton--text" style={{ width: '40%', height: '1rem', marginTop: '0.5rem' }} />
        </div>
      </div>
    );
  }
  if (error || !invoice) {
    return (
      <div className="page">
        <ErrorWithRetry message={error || "We couldn't load the invoice. Check your connection and try again."} onRetry={() => { setError(''); setLoading(true); fetchInvoice().finally(() => setLoading(false)); }} />
        <p style={{ marginTop: '1rem' }}><Link to="/invoices" className="btn btn--secondary">Back to list</Link></p>
      </div>
    );
  }

  const customer = invoice.customer || {};
  const items = invoice.invoice_items || [];
  const hasSerial = items.some((row) => row.serials && row.serials.length > 0);

  const canEdit = invoice.status !== 'paid';

  return (
    <div className="invoice-print-wrap">
      <div className="invoice-print-actions no-print">
        <div className="invoice-print-actions__nav">
          <Link to="/invoices" className="btn btn--ghost btn--sm">Back to list</Link>
          {canEdit && (
            <Link to={`/invoices/${id}/edit`} className="btn btn--ghost btn--sm">Back to invoice</Link>
          )}
        </div>
        <div className="invoice-print-actions__primary">
          <button type="button" className="btn btn--primary" onClick={() => window.print()} aria-label="Print invoice">
            Print
          </button>
          <button type="button" className="btn btn--secondary" onClick={handleDownloadPdf} disabled={pdfGenerating} aria-label="Download PDF">
            {pdfGenerating ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
        <div className="invoice-print-actions__secondary">
          <span className="invoice-print__status-label" role="status">
            Status: <span className={`badge badge--${invoice.status}`} aria-label={`Status: ${invoice.status}`}>{invoice.status}</span>
          </span>
          {invoice.status === 'draft' && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleStatusUpdate('sent')} disabled={statusUpdating}>
              Mark sent
            </button>
          )}
          {(invoice.status === 'draft' || invoice.status === 'sent') && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleStatusUpdate('paid')} disabled={statusUpdating}>
              Mark paid
            </button>
          )}
          {canEdit && (
            <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={() => setDeleteConfirmOpen(true)}>
              Delete
            </button>
          )}
        </div>
        {/* Payments section */}
        <div className="invoice-print__payments no-print" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', width: '100%' }}>
          <h3 className="card__subheading">Payments</h3>
          {(() => {
            const amtPaid = Number(invoice?.amount_paid) ?? 0;
            const invoiceTotal = Number(invoice?.total) ?? 0;
            const balance = Number(invoice?.balance) ?? (invoiceTotal - amtPaid);
            const payments = invoice?.payments ?? [];
            return (
              <>
                <div className="invoice-print__balance" style={{ marginBottom: '0.75rem' }}>
                  {balance <= 0 ? (
                    <strong style={{ color: 'var(--accent)' }}>Paid in full</strong>
                  ) : (
                    <>
                      <span className="page__muted">Balance due: </span>
                      <strong>{formatMoney(balance, tenant)}</strong>
                    </>
                  )}
                </div>
                {payments.length > 0 && (
                  <table className="invoice-print__payments-table table" style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Method</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Reference</th>
                        <th scope="col"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td>{p.paid_at}</td>
                          <td>{String(p.payment_method).replace('_', ' ')}</td>
                          <td>{formatMoney(p.amount, tenant)}</td>
                          <td>{p.reference || '—'}</td>
                          <td>
                            <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={() => handleDeletePayment(p.id)} disabled={deletingPaymentId === p.id}>
                              {deletingPaymentId === p.id ? '…' : 'Remove'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {balance > 0 && (
                  <button type="button" className="btn btn--secondary btn--sm" onClick={openPaymentModal}>
                    Record payment
                  </button>
                )}
              </>
            );
          })()}
        </div>
      </div>
      <div className="invoice-print" ref={printAreaRef}>
        {/* ── Header: Two-column ── */}
        <header className="invoice-print__header">
          <div className="invoice-print__header-left">
            {tenant?.logo_url && (
              <img src={tenant.logo_url} alt="" className="invoice-print__logo" />
            )}
            <div>
              <h1 className="invoice-print__shop">{(legalName && legalName.trim()) ? legalName.trim() : (tenant?.name || 'Shop')}</h1>
              {tenant?.gstin && <p className="invoice-print__meta">GSTIN: {tenant.gstin}</p>}
              {tenant?.address && <p className="invoice-print__meta">{tenant.address}</p>}
              {tenant?.phone && <p className="invoice-print__meta">{tenant.phone}</p>}
            </div>
          </div>
          <div className="invoice-print__header-right">
            <h2 className="invoice-print__title">
              {invoiceTitle} <span className="invoice-print__invoice-number">{invoice.invoice_number}</span>
            </h2>
            <p className="invoice-print__header-detail"><span>Date:</span> <strong>{formatDatePrint(invoice.invoice_date)}</strong></p>
          </div>
        </header>

        {tenant?.invoice_header_note && (
          <div className="invoice-print__header-note">{tenant.invoice_header_note}</div>
        )}

        {/* ── Parties: Two-column ── */}
        <div className="invoice-print__parties">
          <div className="invoice-print__party">
            <h3>Bill To</h3>
            <p className="invoice-print__customer">{customer.name}</p>
            {customer.phone && <p>{customer.phone}</p>}
            {customer.email && <p>{customer.email}</p>}
            {customer.address && <p className="invoice-print__address">{customer.address}</p>}
          </div>
          <div className="invoice-print__party invoice-print__party--right">
            <h3>Invoice Details</h3>
            <p><span className="invoice-print__detail-label">Invoice:</span> {invoice.invoice_number}</p>
            <p><span className="invoice-print__detail-label">Date:</span> {formatDatePrint(invoice.invoice_date)}</p>
            {invoice.due_date && <p><span className="invoice-print__detail-label">Due:</span> {formatDatePrint(invoice.due_date)}</p>}
            {invoice.status && invoice.status !== 'paid' && (
              <p><span className="invoice-print__detail-label">Status:</span> <span className={`badge badge--${invoice.status}`} role="status" aria-label={`Status: ${invoice.status}`}>{invoice.status}</span></p>
            )}
            {showRoughBillRefEnabled && invoice.rough_bill_ref && (
              <p className="no-print"><span className="invoice-print__detail-label">Rough bill ref:</span> {invoice.rough_bill_ref}</p>
            )}
          </div>
        </div>

        {/* ── Items table ── */}
        <div className="invoice-print__table-wrap">
          <table className="invoice-print__table">
            <thead>
              <tr>
                <th scope="col" className="col-num">#</th>
                <th scope="col">Description</th>
                {hasSerial && <th scope="col">Serial / IMEI</th>}
                {extraInvCols.map((col) => <th scope="col" key={col}>{columnLabel(col)}</th>)}
                <th scope="col" className="col-right">Qty</th>
                <th scope="col" className="col-right">Unit Price</th>
                <th scope="col" className="col-right">Disc</th>
                <th scope="col" className="col-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => {
                const serials = row.serials || [];
                const qty = Number(row.quantity) || 0;
                const unit = Number(row.unit_price) || 0;
                const base = Math.round(qty * unit * 100) / 100;
                const netAmount = Number(row.amount) || 0;
                const storedDisc = Number(row.discount_amount) || 0;
                const derivedDisc = Math.max(0, Math.round((base - netAmount) * 100) / 100);
                const discountAmount = storedDisc > 0 ? storedDisc : derivedDisc;
                return (
                  <tr key={row.id || i}>
                    <td className="col-num">{i + 1}</td>
                    <td>{row.description}</td>
                    {hasSerial && (
                      <td>
                        {serials.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            {serials.map((s, j) => (
                              <span key={s.id || j}>{s.serial_number}</span>
                            ))}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    {extraInvCols.map((col) => <td key={col}>{row[col] || '—'}</td>)}
                    <td className="col-right">{qty}</td>
                    <td className="col-right">{formatMoney(unit, tenant)}</td>
                    <td className="col-right">
                      {discountAmount > 0 ? formatMoney(discountAmount, tenant) : '—'}
                    </td>
                    <td className="col-right">{formatMoney(netAmount, tenant)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Totals box ── */}
        <div className="invoice-print__totals-box">
          <div className="invoice-print__total-row">
            <span>Subtotal</span>
            <span>{formatMoney((invoice.subtotal ?? invoice.total) + (invoice.discount_total ?? 0), tenant)}</span>
          </div>
          {Number(invoice.discount_total) > 0 && (
            <div className="invoice-print__total-row">
              <span>Discount</span>
              <span>-{formatMoney(invoice.discount_total, tenant)}</span>
            </div>
          )}
          {invoice.tax_percent != null && Number(invoice.tax_percent) > 0 && (
            <div className="invoice-print__total-row">
              <span>Tax ({Number(invoice.tax_percent)}%)</span>
              <span>{formatMoney(invoice.tax_amount ?? 0, tenant)}</span>
            </div>
          )}
          <div className="invoice-print__total-row invoice-print__total-row--grand">
            <span>Total</span>
            <span>{formatMoney(invoice.total, tenant)}</span>
          </div>
        </div>

        {/* ── Amount in words ── */}
        <div className="invoice-print__words">
          {amountInWords(Number(invoice.total))}
        </div>

        {/* ── Footer ── */}
        <div className="invoice-print__footer-section">
          <p className="invoice-print__footer">Thank you for your business.</p>
          {tenant?.invoice_footer_note && (
            <div className="invoice-print__footer-note">{tenant.invoice_footer_note}</div>
          )}
        </div>
      </div>

      {paymentModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="record-payment-title" onClick={() => setPaymentModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '22rem', margin: 'auto', borderRadius: 'var(--radius)' }} onClick={(e) => e.stopPropagation()}>
            <h2 id="record-payment-title" className="modal__title">Record payment</h2>
            <form onSubmit={handleRecordPayment}>
              <div className="form" style={{ marginBottom: '1rem' }}>
                <label className="form__label">
                  <span>Amount</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form__input form__input--number"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </label>
                <label className="form__label">
                  <span>Method</span>
                  <select
                    className="form__input"
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, payment_method: e.target.value }))}
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank transfer</option>
                  </select>
                </label>
                <label className="form__label">
                  <span>Date</span>
                  <input
                    type="date"
                    className="form__input"
                    value={paymentForm.paid_at}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, paid_at: e.target.value }))}
                  />
                </label>
                <label className="form__label">
                  <span>Reference (optional)</span>
                  <input
                    type="text"
                    className="form__input"
                    placeholder="UPI ref, cheque no."
                    value={paymentForm.reference}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
                  />
                </label>
              </div>
              <div className="modal__actions">
                <button type="submit" className="btn btn--primary" disabled={paymentSubmitting}>
                  {paymentSubmitting ? 'Saving…' : 'Record payment'}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setPaymentModalOpen(false)} disabled={paymentSubmitting}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete invoice"
        message={invoice ? `Delete invoice ${invoice.invoice_number}? This can't be undone.` : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}
