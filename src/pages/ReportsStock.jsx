import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';

const TRACKING_LABELS = { quantity: 'Quantity', serial: 'Serial', batch: 'Batch' };
const STOCK_LIMIT = 1000;

export default function ReportsStock() {
  const { token, tenant } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStock = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    api.get(token, `/api/products?limit=${STOCK_LIMIT}`)
      .then((res) => {
        const data = Array.isArray(res) ? res : (res?.data ?? []);
        setProducts(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  const totalValue = products.reduce((sum, p) => {
    const stock = Number(p.stock) || 0;
    const cost = p.purchase_price != null ? Number(p.purchase_price) : (p.last_purchase_price != null ? Number(p.last_purchase_price) : 0);
    return sum + stock * cost;
  }, 0);

  const totalUnits = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);

  if (loading && products.length === 0) {
    return (
      <div className="page">
        <div className="page__toolbar" style={{ marginBottom: '1rem' }}>
          <Link to="/reports" className="btn btn--ghost btn--sm">← Reports</Link>
        </div>
        <h1 className="page__title">Stock report</h1>
        <p className="page__muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__toolbar" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Link to="/reports" className="btn btn--ghost btn--sm">← Reports</Link>
        <button type="button" className="btn btn--secondary btn--sm" onClick={fetchStock}>Refresh</button>
      </div>
      <h1 className="page__title">Stock report</h1>
      <p className="page__subtitle">Current inventory by product. Value uses purchase / last purchase price.</p>

      {error && <div className="page__error">{error}</div>}

      <section className="card page__section">
        <div className="report-cards report-cards--inline" style={{ marginBottom: '1rem' }}>
          <div className="report-card">
            <span className="report-card__label">Products</span>
            <span className="report-card__value">{products.length}</span>
          </div>
          <div className="report-card">
            <span className="report-card__label">Total units</span>
            <span className="report-card__value">{totalUnits}</span>
          </div>
          <div className="report-card">
            <span className="report-card__label">Est. stock value</span>
            <span className="report-card__value">{formatMoney(totalValue, tenant)}</span>
          </div>
        </div>

        {products.length === 0 ? (
          <p className="page__muted">No products. Add products and record purchase bills to see stock.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Company</th>
                  <th>Tracking</th>
                  <th>Stock</th>
                  <th>Unit</th>
                  <th className="col-right">Unit cost</th>
                  <th className="col-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const stock = Number(p.stock) || 0;
                  const unitCost = p.purchase_price != null ? Number(p.purchase_price) : (p.last_purchase_price != null ? Number(p.last_purchase_price) : null);
                  const value = unitCost != null ? stock * unitCost : null;
                  const unit = (p.unit || '').trim() || '—';
                  return (
                    <tr key={p.id}>
                      <td>{p.name || '—'}</td>
                      <td>{(p.sku || '').trim() || '—'}</td>
                      <td>{(p.company || '').trim() || '—'}</td>
                      <td>{TRACKING_LABELS[p.tracking_type] || p.tracking_type || '—'}</td>
                      <td>{stock}</td>
                      <td>{unit}</td>
                      <td className="col-right">{unitCost != null ? formatMoney(unitCost, tenant) : '—'}</td>
                      <td className="col-right">{value != null ? formatMoney(value, tenant) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
