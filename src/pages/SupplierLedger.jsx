import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import ListSkeleton from '../components/ListSkeleton';

export default function SupplierLedger() {
  const { id } = useParams();
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !id) return;
    api.get(token, `/api/suppliers/${id}/ledger`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, id]);

  if (loading) {
    return (
      <div className="page">
        <h1 className="page__title">Supplier ledger</h1>
        <div className="card page__section">
          <ListSkeleton rows={5} columns={4} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page">
        <h1 className="page__title">Supplier ledger</h1>
        <p className="page__error">{error || 'Supplier not found'}</p>
        <Link to="/suppliers" className="btn btn--secondary">Back to Suppliers</Link>
      </div>
    );
  }

  const { supplier, totalPurchases, totalPaid, balancePayable, bills } = data;

  return (
    <div className="page">
      <div className="page__toolbar" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Link to="/suppliers" className="btn btn--ghost btn--sm">← Suppliers</Link>
      </div>
      <h1 className="page__title">Ledger: {supplier?.name}</h1>
      <section className="card page__section">
        <h2 className="card__heading">Summary</h2>
        <div className="form form--grid" style={{ maxWidth: '24rem' }}>
          <div className="form__label">
            <span className="page__muted">Total purchases</span>
            <strong>{formatMoney(totalPurchases, tenant)}</strong>
          </div>
          <div className="form__label">
            <span className="page__muted">Total paid</span>
            <strong>{formatMoney(totalPaid, tenant)}</strong>
          </div>
          <div className="form__label">
            <span className="page__muted">Balance payable</span>
            <strong>{formatMoney(balancePayable, tenant)}</strong>
          </div>
        </div>
      </section>
      <section className="card page__section">
        <h2 className="card__heading">Bills</h2>
        {!bills?.length ? (
          <p className="page__muted">No purchase bills for this supplier.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Bill #</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td>{b.bill_number}</td>
                    <td>{b.bill_date}</td>
                    <td>{b.status}</td>
                    <td>{formatMoney(b.total, tenant)}</td>
                    <td>{formatMoney(b.amount_paid, tenant)}</td>
                    <td>{formatMoney(b.balance, tenant)}</td>
                    <td>
                      <Link to={`/purchase-bills/${b.id}`} className="btn btn--ghost btn--sm">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
