import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import ErrorWithRetry from '../components/ErrorWithRetry';
import ListSkeleton from '../components/ListSkeleton';

const TRACKING_LABELS = { quantity: 'Quantity', serial: 'Serial', batch: 'Batch' };
const STOCK_LIMIT = 1000;

export default function ReportsStock() {
  const { token, tenant } = useAuth();
  const { productTypeOptions } = useBusinessConfig();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [productTypeFilter, setProductTypeFilter] = useState('');

  const fetchStock = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    params.set('limit', String(STOCK_LIMIT));
    if (productTypeFilter) params.set('product_type', productTypeFilter);
    api.get(token, `/api/products?${params.toString()}`)
      .then((res) => {
        const data = Array.isArray(res) ? res : (res?.data ?? []);
        setProducts(data);
      })
      .catch((e) => setError(e.message || "We couldn't load stock. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [token, productTypeFilter]);

  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  const totalValue = products.reduce((sum, p) => {
    const stock = Number(p.stock) || 0;
    const cost = p.purchase_price != null ? Number(p.purchase_price) : (p.last_purchase_price != null ? Number(p.last_purchase_price) : 0);
    return sum + stock * cost;
  }, 0);

  const totalUnits = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);

  if (loading && products.length === 0 && !error) {
    return (
      <div className="page">
        <div className="page__toolbar" style={{ marginBottom: '1rem' }}>
          <Link to="/reports" className="btn btn--ghost btn--sm">← Reports</Link>
        </div>
        <h1 className="page__title">Stock report</h1>
        <p className="page__subtitle">Current inventory by product.</p>
        <section className="card page__section">
          <ListSkeleton rows={6} columns={5} />
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__toolbar" style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
        <Link to="/reports" className="btn btn--ghost btn--sm">← Reports</Link>
        {productTypeOptions?.length > 0 && (
          <select
            className="form__input page__filter"
            value={productTypeFilter}
            onChange={(e) => setProductTypeFilter(e.target.value)}
            aria-label="Filter by product type"
            style={{ minWidth: '10rem' }}
          >
            <option value="">All product types</option>
            {productTypeOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )}
        <button type="button" className="btn btn--secondary btn--sm" onClick={fetchStock}>Refresh</button>
      </div>
      <h1 className="page__title">Stock report</h1>
      <p className="page__subtitle">
        Current inventory by product. Value uses purchase / last purchase price.
        {productTypeOptions?.length > 0 && ' Use the filter above to show a specific product type (from Settings).'}
      </p>

      {error && <ErrorWithRetry message={error} onRetry={fetchStock} />}

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
                  <th scope="col">Product</th>
                  {productTypeOptions?.length > 0 && <th scope="col">Product type</th>}
                  <th scope="col">SKU</th>
                  <th scope="col">Company</th>
                  <th scope="col">Tracking</th>
                  <th scope="col">Stock</th>
                  <th scope="col">Unit</th>
                  <th scope="col" className="col-right">Unit cost</th>
                  <th scope="col" className="col-right">Value</th>
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
                      {productTypeOptions?.length > 0 && <td>{(p.product_type || '').trim() || '—'}</td>}
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
