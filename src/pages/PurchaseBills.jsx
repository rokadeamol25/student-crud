import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import EmptyState from '../components/EmptyState';
import ErrorWithRetry from '../components/ErrorWithRetry';
import ListSkeleton from '../components/ListSkeleton';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'recorded', label: 'Recorded' },
];
const PAGE_SIZE = 20;

function billBalance(bill) {
  const total = Number(bill?.total) ?? 0;
  const amountPaid = Number(bill?.amount_paid) ?? 0;
  return Math.round((total - amountPaid) * 100) / 100;
}

export default function PurchaseBills() {
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [error, setError] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmRecord, setConfirmRecord] = useState(null);

  const fetchList = useCallback(() => {
    if (!token) return;
    const params = new URLSearchParams();
    if (supplierFilter) params.set('supplier_id', supplierFilter);
    if (statusFilter) params.set('status', statusFilter);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    return api.get(token, `/api/purchase-bills?${params.toString()}`)
      .then((res) => {
        const data = res?.data ?? [];
        setList(data);
        setTotal(res?.total ?? data.length);
      })
      .catch((e) => setError(e.message || "We couldn't load purchase bills. Check your connection and try again."));
  }, [token, supplierFilter, statusFilter, page]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchList().finally(() => setLoading(false));
  }, [token, supplierFilter, statusFilter, page, fetchList]);

  useEffect(() => {
    if (!token) return;
    api.get(token, '/api/suppliers?limit=500')
      .then((res) => setSuppliers(res?.data ?? []))
      .catch(() => {})
      .finally(() => setOptionsLoading(false));
  }, [token]);

  async function handleDelete(bill) {
    if (bill.status !== 'draft') return;
    setDeletingId(bill.id);
    try {
      await api.del(token, `/api/purchase-bills/${bill.id}`);
      setList((prev) => prev.filter((b) => b.id !== bill.id));
      setTotal((t) => Math.max(0, t - 1));
      showToast('Purchase bill deleted', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to delete', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleConfirmRecord() {
    if (!confirmRecord) return;
    const billId = confirmRecord.id;
    setConfirmRecord(null);
    try {
      await api.post(token, `/api/purchase-bills/${billId}/record`);
      setList((prev) => prev.map((b) => (b.id === billId ? { ...b, status: 'recorded' } : b)));
      showToast('Purchase bill recorded; stock updated', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to record', 'error');
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Purchase bills</h1>
      <div className="page__toolbar">
        <select
          className="form__input page__filter"
          value={supplierFilter}
          onChange={(e) => { setSupplierFilter(e.target.value); setPage(0); }}
          aria-label="Filter by supplier"
          disabled={optionsLoading}
        >
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
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
        <Link to="/purchase-bills/new" className="btn btn--primary">
          New purchase bill
        </Link>
      </div>
      {error && <ErrorWithRetry message={error} onRetry={() => { setError(''); setLoading(true); fetchList().finally(() => setLoading(false)); }} />}
      <section className="card page__section">
        {loading ? (
          <ListSkeleton rows={6} columns={5} />
        ) : list.length === 0 ? (
          <EmptyState
            title="No purchase bills yet"
            description="Create your first purchase bill to record stock and track supplier payments."
            actionLabel="New purchase bill"
            onAction={() => navigate('/purchase-bills/new')}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Supplier</th>
                  <th scope="col">Bill #</th>
                  <th scope="col">Date</th>
                  <th scope="col">Status</th>
                  <th scope="col">Total</th>
                  <th scope="col">Balance</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => {
                  const supplierName = b.supplier?.name ?? '—';
                  const balance = billBalance(b);
                  return (
                    <tr key={b.id}>
                      <td>{supplierName}</td>
                      <td>{b.bill_number}</td>
                      <td>{b.bill_date}</td>
                      <td>{b.status}</td>
                      <td>{formatMoney(b.total, tenant)}</td>
                      <td>{formatMoney(balance, tenant)}</td>
                      <td>
                        <Link to={`/purchase-bills/${b.id}`} className="btn btn--ghost btn--sm">View</Link>
                        {b.status === 'draft' && (
                          <>
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmRecord(b)}>
                              Record
                            </button>
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleDelete(b)} disabled={deletingId === b.id}>
                              {deletingId === b.id ? '…' : 'Delete'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE_SIZE && (
          <div className="pagination" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button type="button" className="btn btn--ghost btn--sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className="page__muted">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
            <button type="button" className="btn btn--ghost btn--sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </section>

      {confirmRecord && (
        <div className="modal-backdrop" onClick={() => setConfirmRecord(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">Record purchase bill</h2>
            <p>Record this bill? Stock and last purchase price will be updated for all items. This cannot be undone.</p>
            <div className="modal__actions">
              <button type="button" className="btn btn--secondary" onClick={() => setConfirmRecord(null)}>Cancel</button>
              <button type="button" className="btn btn--primary" onClick={handleConfirmRecord}>Record</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
