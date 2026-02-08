import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import InvoiceListSkeleton from '../components/InvoiceListSkeleton';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
];
const PAGE_SIZE = 20;

function paymentStatus(inv) {
  const total = Number(inv?.total) ?? 0;
  const amountPaid = Number(inv?.amount_paid) ?? 0;
  const balance = Math.round((total - amountPaid) * 100) / 100;
  if (total <= 0) return { label: '—', balance: 0 };
  if (amountPaid >= total) return { label: 'Paid in full', balance: 0 };
  if (amountPaid > 0) return { label: 'Partially paid', balance };
  return { label: 'Unpaid', balance };
}

export default function Invoices() {
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const fetchList = useCallback(() => {
    if (!token) return;
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    const url = `/api/invoices?${params.toString()}`;
    return api.get(token, url).then((res) => {
      setList(Array.isArray(res) ? res : (res?.data ?? []));
      setTotal(typeof res?.total === 'number' ? res.total : (res?.data?.length ?? 0));
    }).catch((e) => setError(e.message));
  }, [token, statusFilter, page]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchList().finally(() => setLoading(false));
  }, [token, statusFilter, page, fetchList]);

  function openDelete(inv) {
    setInvoiceToDelete(inv);
  }

  async function handleConfirmDelete() {
    if (!invoiceToDelete) return;
    setDeleting(true);
    try {
      await api.del(token, `/api/invoices/${invoiceToDelete.id}`);
      setList((prev) => prev.filter((i) => i.id !== invoiceToDelete.id));
      setTotal((t) => Math.max(0, t - 1));
      setInvoiceToDelete(null);
      showToast('Draft invoice deleted', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to delete', 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ format: 'csv' });
      if (statusFilter) params.set('status', statusFilter);
      await api.downloadCsv(token, `/api/invoices?${params.toString()}`, 'invoices.csv');
      showToast('CSV downloaded', 'success');
    } catch (e) {
      showToast(e.message || 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Invoices</h1>
      <div className="page__toolbar">
        <select
          className="form__input page__filter"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button type="button" className="btn btn--secondary" onClick={handleExportCsv} disabled={exporting || total === 0}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
        <Link to="/invoices/new" className="btn btn--primary">
          New invoice
        </Link>
      </div>
      {error && <div className="page__error">{error}</div>}
      <section className="card page__section">
        {loading ? (
          <InvoiceListSkeleton />
        ) : list.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="Create your first invoice to get started."
            actionLabel="Create first invoice"
            onAction={() => navigate('/invoices/new')}
          />
        ) : (
          <>
            <div className="invoice-list-cards">
              {list.map((inv) => (
                <div key={inv.id} className="invoice-card">
                  <div className="invoice-card__row">
                    <span className="invoice-card__label">Number</span>
                    <span className="invoice-card__value">{inv.invoice_number}</span>
                  </div>
                  <div className="invoice-card__row">
                    <span className="invoice-card__label">Date</span>
                    <span className="invoice-card__value">{inv.invoice_date}</span>
                  </div>
                  <div className="invoice-card__row">
                    <span className="invoice-card__label">Status</span>
                    <span className={`badge badge--${inv.status}`}>{inv.status}</span>
                  </div>
                  <div className="invoice-card__row">
                    <span className="invoice-card__label">Payment</span>
                    <span className="invoice-card__value">
                      {paymentStatus(inv).label}
                      {paymentStatus(inv).balance > 0 && (
                        <span className="page__muted" style={{ display: 'block', fontSize: '0.8125rem' }}>
                          Balance: {formatMoney(paymentStatus(inv).balance, tenant)}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="invoice-card__row">
                    <span className="invoice-card__label">Total</span>
                    <span className="invoice-card__value">{formatMoney(inv.total, tenant)}</span>
                  </div>
                  <div className="invoice-card__actions">
                    {inv.status === 'draft' && (
                      <>
                        <Link to={`/invoices/${inv.id}/edit`} className="btn btn--secondary invoice-card__action">
                          Edit
                        </Link>
                        <button type="button" className="btn btn--ghost btn--danger invoice-card__action" onClick={() => openDelete(inv)}>
                          Delete
                        </button>
                      </>
                    )}
                    <Link to={`/invoices/${inv.id}/print`} className="btn btn--primary invoice-card__action">
                      View / Print
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            <div className="invoice-list-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((inv) => {
                    const pay = paymentStatus(inv);
                    return (
                    <tr key={inv.id}>
                      <td>{inv.invoice_number}</td>
                      <td>{inv.invoice_date}</td>
                      <td><span className={`badge badge--${inv.status}`}>{inv.status}</span></td>
                      <td>
                        <span>{pay.label}</span>
                        {pay.balance > 0 && (
                          <span className="page__muted" style={{ display: 'block', fontSize: '0.8125rem' }}>
                            {formatMoney(pay.balance, tenant)} due
                          </span>
                        )}
                      </td>
                      <td>{formatMoney(inv.total, tenant)}</td>
                      <td>
                        <span className="table-actions">
                          {inv.status === 'draft' && (
                            <>
                              <Link to={`/invoices/${inv.id}/edit`} className="btn btn--ghost btn--sm">Edit</Link>
                              <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={() => openDelete(inv)}>Delete</button>
                            </>
                          )}
                          <Link to={`/invoices/${inv.id}/print`} className="btn btn--ghost btn--sm">View / Print</Link>
                        </span>
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
            {total > PAGE_SIZE && (
              <div className="pagination" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button type="button" className="btn btn--ghost btn--sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <span className="page__muted">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </span>
                <button type="button" className="btn btn--ghost btn--sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <ConfirmDialog
        open={!!invoiceToDelete}
        title="Delete draft invoice"
        message={invoiceToDelete ? `Delete draft invoice ${invoiceToDelete.invoice_number}? This cannot be undone.` : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setInvoiceToDelete(null)}
      />
    </div>
  );
}
