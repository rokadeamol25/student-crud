import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import { columnLabel, INVOICE_COLS_BY_TRACKING_TYPE } from '../config/businessTypes';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import html2pdf from 'html2pdf.js';

/**
 * Clean view / print page for an invoice.
 * Status changes & deletion are handled on the list page.
 * This page focuses on: View, Print, PDF download, Payments.
 */
export default function InvoicePrint() {
  const { id } = useParams();
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const { invoiceLineItems } = useBusinessConfig();
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

  const fetchInvoice = useCallback(() => {
    if (!token || !id) return;
    return api.get(token, `/api/invoices/${id}`)
      .then(setInvoice)
      .catch((e) => setError(e.message));
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

  async function handleDownloadPdf() {
    const el = printAreaRef.current;
    if (!el || !invoice) return;
    setPdfGenerating(true);
    try {
      const pageSize = tenant?.invoice_page_size === 'Letter' ? 'letter' : 'a4';

      // Temporarily expand the table wrapper so html2canvas captures the full table
      const tableWrap = el.querySelector('.invoice-print__table-wrap');
      if (tableWrap) {
        tableWrap.style.overflow = 'visible';
        tableWrap.style.minWidth = '0';
      }
      const table = el.querySelector('.invoice-print__table');
      if (table) table.style.minWidth = '0';

      // Force the print area to a fixed width so the table compresses to fit portrait A4
      const origWidth = el.style.width;
      const origMaxWidth = el.style.maxWidth;
      el.style.width = '700px';
      el.style.maxWidth = '700px';

      await html2pdf()
        .set({
          margin: [8, 5, 8, 5],
          filename: `invoice-${(invoice.invoice_number || 'invoice').replace(/\s+/g, '-')}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0, windowWidth: 700 },
          jsPDF: { unit: 'mm', format: pageSize, orientation: 'portrait' },
        })
        .from(el)
        .save();

      // Restore styles
      el.style.width = origWidth;
      el.style.maxWidth = origMaxWidth;
      if (tableWrap) {
        tableWrap.style.overflow = '';
        tableWrap.style.minWidth = '';
      }
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

  if (loading) return <div className="page"><p className="page__muted">Loading invoice…</p></div>;
  if (error || !invoice) {
    return (
      <div className="page">
        <p className="page__error">{error || 'Invoice not found'}</p>
        <Link to="/invoices">Back to invoices</Link>
      </div>
    );
  }

  const customer = invoice.customer || {};
  const items = invoice.invoice_items || [];
  const hasSerial = items.some((row) => row.serials && row.serials.length > 0);

  return (
    <div className="invoice-print-wrap">
      <div className="invoice-print-actions no-print">
        <Link to="/invoices" className="btn btn--secondary">← Invoices</Link>
        <span className="invoice-print__status-label" style={{ marginLeft: '0.5rem' }}>
          Status: <span className={`badge badge--${invoice.status}`}>{invoice.status}</span>
        </span>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          {invoice.status !== 'paid' && (
            <Link to={`/invoices/${id}/edit`} className="btn btn--secondary">Edit</Link>
          )}
          <button type="button" className="btn btn--primary" onClick={() => window.print()}>
            Print
          </button>
          <button type="button" className="btn btn--secondary" onClick={handleDownloadPdf} disabled={pdfGenerating}>
            {pdfGenerating ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
        {/* Payments section */}
        <div className="invoice-print__payments no-print" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', width: '100%' }}>
          <h3 className="card__subheading" style={{ marginBottom: '0.5rem' }}>Payments</h3>
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
                        <th>Date</th>
                        <th>Method</th>
                        <th>Amount</th>
                        <th>Reference</th>
                        <th></th>
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
        <header className="invoice-print__header">
          <div className="invoice-print__header-left">
            {tenant?.logo_url && (
              <img src={tenant.logo_url} alt="" className="invoice-print__logo" />
            )}
            <div>
              <h1 className="invoice-print__shop">{tenant?.name || 'Shop'}</h1>
              {tenant?.gstin && <p className="invoice-print__meta">GSTIN: {tenant.gstin}</p>}
              <p className="invoice-print__meta">Invoice</p>
            </div>
          </div>
          <div className="invoice-print__num">
            <strong>{invoice.invoice_number}</strong>
            <br />
            <span>{invoice.invoice_date}</span>
          </div>
        </header>
        {tenant?.invoice_header_note && (
          <div className="invoice-print__header-note">{tenant.invoice_header_note}</div>
        )}
        <div className="invoice-print__parties">
          <div>
            <h3>Bill to</h3>
            <p className="invoice-print__customer">{customer.name}</p>
            {customer.email && <p>{customer.email}</p>}
            {customer.phone && <p>{customer.phone}</p>}
            {customer.address && <p className="invoice-print__address">{customer.address}</p>}
          </div>
        </div>
        <div className="invoice-print__table-wrap">
          <table className="invoice-print__table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Type</th>
                {hasSerial && <th>Serial / IMEI</th>}
                {extraInvCols.map((col) => <th key={col}>{columnLabel(col)}</th>)}
                <th>Qty</th>
                <th>Unit price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => {
                const trackingType = row.product?.tracking_type || 'quantity';
                const serials = row.serials || [];
                return (
                  <tr key={row.id || i}>
                    <td>{i + 1}</td>
                    <td>{row.description}</td>
                    <td>
                      <span className={`badge badge--${trackingType === 'serial' ? 'sent' : trackingType === 'batch' ? 'paid' : 'draft'}`} style={{ fontSize: '0.7rem' }}>
                        {trackingType}
                      </span>
                    </td>
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
                    <td>{Number(row.quantity)}</td>
                    <td>{formatMoney(row.unit_price, tenant)}</td>
                    <td>{formatMoney(row.amount, tenant)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="invoice-print__totals">
          {invoice.tax_percent != null && Number(invoice.tax_percent) > 0 && (
            <>
              <div className="invoice-print__total">
                <span>Subtotal</span>
                <span>{formatMoney(invoice.subtotal ?? invoice.total, tenant)}</span>
              </div>
              <div className="invoice-print__total">
                <span>Tax ({Number(invoice.tax_percent)}%)</span>
                <span>{formatMoney(invoice.tax_amount ?? 0, tenant)}</span>
              </div>
            </>
          )}
          <div className="invoice-print__total">
            <span>Total</span>
            <span>{formatMoney(invoice.total, tenant)}</span>
          </div>
        </div>
        <p className="invoice-print__footer">Thank you for your business.</p>
        {tenant?.invoice_footer_note && (
          <div className="invoice-print__footer-note">{tenant.invoice_footer_note}</div>
        )}
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
                    className="form__input"
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
    </div>
  );
}
