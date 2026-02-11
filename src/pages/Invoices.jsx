import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import InvoiceListSkeleton from '../components/InvoiceListSkeleton';
import Pagination from '../components/Pagination';
import ActionsDropdown from '../components/ActionsDropdown';
import ErrorWithRetry from '../components/ErrorWithRetry';
import { IconSortAsc, IconSortDesc, IconSortNone } from '../components/Icons';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
];
const PAGE_SIZE = 20;
const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer'];

function paymentStatus(inv) {
  const total = Number(inv?.total) ?? 0;
  const amountPaid = Number(inv?.amount_paid) ?? 0;
  const balance = Math.round((total - amountPaid) * 100) / 100;
  if (total <= 0) return { label: '—', balance: 0 };
  if (amountPaid >= total) return { label: 'Paid in full', balance: 0 };
  if (amountPaid > 0) return { label: 'Partially paid', balance };
  return { label: 'Unpaid', balance };
}

const VALID_STATUS = ['draft', 'sent', 'paid'];

export default function Invoices() {
  const { token, tenant } = useAuth();
  const { showRoughBillRef: showRoughBillRefEnabled } = useBusinessConfig();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const statusFromUrl = searchParams.get('status');
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => (VALID_STATUS.includes(statusFromUrl) ? statusFromUrl : ''));
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Quick payment modal
  const [payInvoice, setPayInvoice] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', reference: '', paid_at: '' });
  const [paySubmitting, setPaySubmitting] = useState(false);
  // Status update
  const [statusUpdating, setStatusUpdating] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const navigate = useNavigate();

  const fetchList = useCallback(() => {
    if (!token) return;
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    params.set('sort', sortBy);
    params.set('order', sortOrder);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    const url = `/api/invoices?${params.toString()}`;
    return api.get(token, url).then((res) => {
      setList(Array.isArray(res) ? res : (res?.data ?? []));
      setTotal(typeof res?.total === 'number' ? res.total : (res?.data?.length ?? 0));
    }).catch((e) => setError(e.message || "We couldn't load invoices. Check your connection and try again."));
  }, [token, statusFilter, sortBy, sortOrder, page]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchList().finally(() => setLoading(false));
  }, [token, statusFilter, sortBy, sortOrder, page, fetchList]);

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

  // Quick status update
  async function handleStatusUpdate(inv, newStatus) {
    setStatusUpdating(inv.id);
    setSuccessMessage('');
    try {
      await api.patch(token, `/api/invoices/${inv.id}`, { status: newStatus });
      const msg = newStatus === 'sent' ? `Invoice ${inv.invoice_number} marked as sent` : `Invoice ${inv.invoice_number} marked as paid`;
      showToast(newStatus === 'sent' ? 'Marked as sent' : 'Marked as paid', 'success');
      setSuccessMessage(msg);
      setTimeout(() => setSuccessMessage(''), 4000);
      await fetchList();
    } catch (e) {
      showToast(e.message || 'Failed to update', 'error');
    } finally {
      setStatusUpdating(null);
    }
  }

  // Quick payment
  function openPayment(inv) {
    const pay = paymentStatus(inv);
    setPayInvoice(inv);
    setPayForm({
      amount: pay.balance > 0 ? String(pay.balance) : '',
      method: 'cash',
      reference: '',
      paid_at: new Date().toISOString().slice(0, 10),
    });
  }

  async function handleRecordPayment(e) {
    e.preventDefault();
    if (!payInvoice || !token) return;
    const amount = parseFloat(payForm.amount, 10);
    if (Number.isNaN(amount) || amount <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    setPaySubmitting(true);
    try {
      await api.post(token, `/api/invoices/${payInvoice.id}/payments`, {
        amount: Math.round(amount * 100) / 100,
        payment_method: payForm.method,
        reference: (payForm.reference || '').trim() || undefined,
        paid_at: payForm.paid_at || undefined,
      });
      showToast('Payment recorded', 'success');
      setPayInvoice(null);
      await fetchList();
    } catch (e) {
      showToast(e.message || 'Failed to record payment', 'error');
    } finally {
      setPaySubmitting(false);
    }
  }

  function invoiceActionItems(inv) {
    const pay = paymentStatus(inv);
    const isUpdating = statusUpdating === inv.id;
    const canEdit = inv.status !== 'paid';
    const items = [
      { label: 'View', icon: 'view', href: `/invoices/${inv.id}/print` },
      ...(canEdit ? [{ label: 'Edit', icon: 'edit', href: `/invoices/${inv.id}/edit` }] : []),
      ...(inv.status === 'draft' ? [{ label: 'Send', icon: 'send', onClick: () => handleStatusUpdate(inv, 'sent'), disabled: isUpdating }] : []),
      ...(inv.status === 'sent' && pay.balance > 0 ? [{ label: 'Record payment', icon: 'recordPayment', onClick: () => openPayment(inv) }] : []),
      ...((inv.status === 'draft' || inv.status === 'sent') ? [{ label: 'Mark paid', icon: 'markPaid', onClick: () => handleStatusUpdate(inv, 'paid'), disabled: isUpdating }] : []),
      ...(canEdit ? [{ label: 'Delete', icon: 'delete', onClick: () => openDelete(inv), danger: true }] : []),
    ];
    return items;
  }

  function renderActions(inv) {
    return (
      <ActionsDropdown
        items={invoiceActionItems(inv)}
        ariaLabel={`Actions for invoice ${inv.invoice_number}`}
      />
    );
  }

  function renderCardActions(inv) {
    const pay = paymentStatus(inv);
    const primaryIsRecordPayment = inv.status === 'sent' && pay.balance > 0;
    return (
      <div className="invoice-card__actions">
        {primaryIsRecordPayment ? (
          <button
            type="button"
            className="btn btn--primary invoice-card__action"
            onClick={() => openPayment(inv)}
          >
            Record payment
          </button>
        ) : (
          <Link
            to={`/invoices/${inv.id}/print`}
            className="btn btn--primary invoice-card__action"
          >
            View
          </Link>
        )}
        <ActionsDropdown
          items={invoiceActionItems(inv)}
          className="invoice-card__actions-dropdown"
          ariaLabel={`More actions for invoice ${inv.invoice_number}`}
        />
      </div>
    );
  }

  function handleSort(col) {
    if (sortBy === col) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder(col === 'invoice_date' || col === 'created_at' || col === 'total' ? 'desc' : 'asc');
    }
    setPage(0);
  }
  function SortableTh({ colKey, label }) {
    const active = sortBy === colKey;
    return (
      <th scope="col">
        <button
          type="button"
          className="table-sort-btn"
          onClick={() => handleSort(colKey)}
          aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          {label}
          <span className="table-sort-icon">
            {!active && <IconSortNone />}
            {active && sortOrder === 'asc' && <IconSortAsc />}
            {active && sortOrder === 'desc' && <IconSortDesc />}
          </span>
        </button>
      </th>
    );
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
      {error && <ErrorWithRetry message={error} onRetry={() => { setError(''); setLoading(true); fetchList().finally(() => setLoading(false)); }} />}
      {successMessage && <div className="page__success" role="status">{successMessage}</div>}
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
                    <span className={`badge badge--${inv.status}`} role="status" aria-label={`Status: ${inv.status}`}>{inv.status}</span>
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
                  {showRoughBillRefEnabled && inv.rough_bill_ref && (
                    <div className="invoice-card__row">
                      <span className="invoice-card__label">Rough bill ref</span>
                      <span className="invoice-card__value">{inv.rough_bill_ref}</span>
                    </div>
                  )}
                  {renderCardActions(inv)}
                </div>
              ))}
            </div>
            <div className="invoice-list-table-wrap table-wrap--sticky">
              <table className="table">
                <thead>
                  <tr>
                    <SortableTh colKey="invoice_number" label="Number" />
                    <SortableTh colKey="invoice_date" label="Date" />
                    <SortableTh colKey="status" label="Status" />
                    <th scope="col">Payment</th>
                    <SortableTh colKey="total" label="Total" />
                    {showRoughBillRefEnabled && <th scope="col">Rough bill ref</th>}
                    <th scope="col"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((inv) => {
                    const pay = paymentStatus(inv);
                    return (
                    <tr key={inv.id}>
                      <td>{inv.invoice_number}</td>
                      <td>{inv.invoice_date}</td>
                      <td><span className={`badge badge--${inv.status}`} role="status" aria-label={`Status: ${inv.status}`}>{inv.status}</span></td>
                      <td>
                        <span>{pay.label}</span>
                        {pay.balance > 0 && (
                          <span className="page__muted" style={{ display: 'block', fontSize: '0.8125rem' }}>
                            {formatMoney(pay.balance, tenant)} due
                          </span>
                        )}
                      </td>
                      <td>{formatMoney(inv.total, tenant)}</td>
                      {showRoughBillRefEnabled && <td>{inv.rough_bill_ref || '—'}</td>}
                      <td>{renderActions(inv)}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
            {total > 0 && (
              <Pagination
                page={page}
                totalItems={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                ariaLabel="Invoices"
              />
            )}
          </>
        )}
      </section>

      <ConfirmDialog
        open={!!invoiceToDelete}
        title="Delete invoice"
        message={invoiceToDelete ? `Delete invoice ${invoiceToDelete.invoice_number}? This can't be undone.` : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setInvoiceToDelete(null)}
      />

      {/* Quick payment modal */}
      {payInvoice && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setPayInvoice(null)}>
          <div className="modal" style={{ maxWidth: '22rem', margin: 'auto', borderRadius: 'var(--radius)' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">Record payment — {payInvoice.invoice_number}</h2>
            <p className="page__muted" style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>
              Balance due: <strong>{formatMoney(paymentStatus(payInvoice).balance, tenant)}</strong>
            </p>
            <form onSubmit={handleRecordPayment}>
              <div className="form" style={{ marginBottom: '1rem' }}>
                <label className="form__label">
                  <span>Amount</span>
                  <input
                    type="number" min="0" step="0.01"
                    className="form__input form__input--number"
                    value={payForm.amount}
                    onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </label>
                <label className="form__label">
                  <span>Method</span>
                  <select className="form__input" value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                  </select>
                </label>
                <label className="form__label">
                  <span>Date</span>
                  <input type="date" className="form__input" value={payForm.paid_at} onChange={(e) => setPayForm((f) => ({ ...f, paid_at: e.target.value }))} />
                </label>
                <label className="form__label">
                  <span>Reference (optional)</span>
                  <input type="text" className="form__input" placeholder="UPI ref, cheque no." value={payForm.reference} onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))} />
                </label>
              </div>
              <div className="modal__actions">
                <button type="submit" className="btn btn--primary" disabled={paySubmitting}>
                  {paySubmitting ? 'Saving…' : 'Record payment'}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setPayInvoice(null)} disabled={paySubmitting}>
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
