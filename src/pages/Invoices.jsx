import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../api/client';

export default function Invoices() {
  const { token } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    api.get(token, '/api/invoices')
      .then(setList)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="page">
      <h1 className="page__title">Invoices</h1>
      <div className="page__toolbar">
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
        )}
      </section>
    </div>
  );
}
