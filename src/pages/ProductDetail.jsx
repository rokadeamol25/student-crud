import { useEffect, useState, useMemo, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import { columnLabel, PRODUCT_COLS_BY_TRACKING_TYPE } from '../config/businessTypes';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';

export default function ProductDetail() {
  const { id } = useParams();
  const { token, tenant } = useAuth();
  const config = useBusinessConfig();
  const productForm = config.productForm;
  const defaultTrackingType = tenant?.feature_config?.defaultTrackingType || 'quantity';

  const extraCols = useMemo(() => {
    const enabled = Object.keys(productForm).filter((k) => productForm[k]);
    const allowed = PRODUCT_COLS_BY_TRACKING_TYPE[defaultTrackingType];
    if (!allowed) return enabled;
    return enabled.filter((k) => allowed.includes(k));
  }, [productForm, defaultTrackingType]);

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    setError('');
    api.get(token, `/api/products/${id}`)
      .then((data) => setProduct(data))
      .catch((e) => setError(e.message || 'Failed to load product'))
      .finally(() => setLoading(false));
  }, [token, id]);

  function formatValue(p, col) {
    const v = p[col];
    if (v == null || v === '') return '—';
    if (col === 'tax_percent') return `${v}%`;
    return String(v);
  }

  if (loading) {
    return (
      <div className="page">
        <p className="page__muted">Loading…</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="page">
        <div className="page__error">{error || 'Product not found'}</div>
        <p>
          <Link to="/products" className="btn btn--secondary">Back to products</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <p className="page__subtitle" style={{ marginBottom: '1rem' }}>
        <Link to="/products" className="page__muted" style={{ textDecoration: 'none' }}>← Products</Link>
      </p>
      <h1 className="page__title">Product details</h1>

      <section className="card page__section product-detail">
        <h2 className="card__heading">{product.name}</h2>
        <dl className="product-detail__list">
          <dt>Selling price</dt>
          <dd>{formatMoney(product.price, tenant)}</dd>

          <dt>Purchase price</dt>
          <dd>{product.purchase_price != null ? formatMoney(product.purchase_price, tenant) : '—'}</dd>

          {extraCols.map((col) => (
            <Fragment key={col}>
              <dt>{columnLabel(col)}</dt>
              <dd>{formatValue(product, col)}</dd>
            </Fragment>
          ))}
        </dl>
        <div className="product-detail__actions">
          <Link to="/products" className="btn btn--secondary">Back to list</Link>
        </div>
      </section>
    </div>
  );
}
