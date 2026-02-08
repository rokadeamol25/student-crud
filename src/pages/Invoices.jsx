import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../api/client';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
];

export default function Invoices() {
  const { token } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const url = statusFilter
      ? `/api/invoices?status=${encodeURIComponent(statusFilter)}`
      : '/api/invoices';
    api.get(token, url)
      .then(setList)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, statusFilter]);

  return (
    <div className="page">
      <h1 className="page__title">Invoices</h1>
      <div className="page__toolbar">
        <select
          className="form__input page__filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <Link to="/invoices/new" className="btn btn--primary">
          New invoice
        </Link>
      </div>
      {error && <div className="page__error">{error}</div>}
      <section className="card page__section">
        {loading ? (
          <p className="page__muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="page__muted">No invoices yet. <Link to="/invoices/new">Create one</Link>.</p>
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
                    <span className="invoice-card__label">Total</span>
                    <span className="invoice-card__value">₹{Number(inv.total).toFixed(2)}</span>
                  </div>
                  <Link to={`/invoices/${inv.id}/print`} className="btn btn--primary invoice-card__action">
                    View / Print
                  </Link>
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
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.invoice_number}</td>
                      <td>{inv.invoice_date}</td>
                      <td><span className={`badge badge--${inv.status}`}>{inv.status}</span></td>
                      <td>₹{Number(inv.total).toFixed(2)}</td>
                      <td>
                        <Link to={`/invoices/${inv.id}/print`} className="btn btn--ghost btn--sm">View / Print</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
