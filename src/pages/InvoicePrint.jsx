import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';

/**
 * Print-friendly invoice view. User can Print → Save as PDF (MVP).
 * Tenant isolation: invoice is loaded via API; backend enforces tenant_id.
 */
export default function InvoicePrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  async function handleStatusUpdate(newStatus) {
    setStatusUpdating(true);
    try {
      await api.patch(token, `/api/invoices/${id}`, { status: newStatus });
      await fetchInvoice();
      showToast(newStatus === 'sent' ? 'Marked as sent' : 'Marked as paid', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to update status', 'error');
    } finally {
      setStatusUpdating(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this draft invoice? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await api.del(token, `/api/invoices/${id}`);
      showToast('Draft invoice deleted', 'success');
      navigate('/invoices');
    } catch (e) {
      showToast(e.message || 'Failed to delete', 'error');
    } finally {
      setDeleting(false);
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

  return (
    <div className="invoice-print-wrap">
      <div className="invoice-print-actions no-print">
        <Link to="/invoices" className="btn btn--secondary">← Invoices</Link>
        <div className="invoice-print__status-actions">
          <span className="invoice-print__status-label">Status: <strong>{invoice.status}</strong></span>
          {invoice.status === 'draft' && (
            <>
              <Link to={`/invoices/${id}/edit`} className="btn btn--secondary">Edit</Link>
              <button type="button" className="btn btn--ghost btn--danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete draft'}
              </button>
            </>
          )}
          {invoice.status === 'draft' && (
            <button type="button" className="btn btn--secondary" onClick={() => handleStatusUpdate('sent')} disabled={statusUpdating}>
              {statusUpdating ? 'Updating…' : 'Mark as Sent'}
            </button>
          )}
          {(invoice.status === 'draft' || invoice.status === 'sent') && (
            <button type="button" className="btn btn--primary" onClick={() => handleStatusUpdate('paid')} disabled={statusUpdating}>
              {statusUpdating ? 'Updating…' : 'Mark as Paid'}
            </button>
          )}
        </div>
        <button type="button" className="btn btn--primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>
      <div className="invoice-print">
        <header className="invoice-print__header">
          <div>
            <h1 className="invoice-print__shop">{tenant?.name || 'Shop'}</h1>
            {tenant?.gstin && <p className="invoice-print__meta">GSTIN: {tenant.gstin}</p>}
            <p className="invoice-print__meta">Invoice</p>
          </div>
          <div className="invoice-print__num">
            <strong>{invoice.invoice_number}</strong>
            <br />
            <span>{invoice.invoice_date}</span>
          </div>
        </header>
        <div className="invoice-print__parties">
          <div>
            <h3>Bill to</h3>
            <p className="invoice-print__customer">{customer.name}</p>
            {customer.email && <p>{customer.email}</p>}
            {customer.phone && <p>{customer.phone}</p>}
            {customer.address && <p className="invoice-print__address">{customer.address}</p>}
          </div>
        </div>
        <table className="invoice-print__table">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={row.id || i}>
                <td>{i + 1}</td>
                <td>{row.description}</td>
                <td>{Number(row.quantity)}</td>
                <td>{formatMoney(row.unit_price, tenant)}</td>
                <td>{formatMoney(row.amount, tenant)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
      </div>
    </div>
  );
}
