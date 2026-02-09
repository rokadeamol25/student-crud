import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import ListSkeleton from '../components/ListSkeleton';

const emptyItem = () => ({ product_id: '', quantity: 1, purchase_price: 0 });

const TRACKING_LABELS = { quantity: 'Qty', serial: 'Serial', batch: 'Batch' };

function TrackingBadge({ type }) {
  const t = type || 'quantity';
  const colors = { quantity: 'badge--draft', serial: 'badge--sent', batch: 'badge--paid' };
  return <span className={`badge ${colors[t] || ''}`} style={{ fontSize: '0.7rem' }}>{TRACKING_LABELS[t]}</span>;
}

export default function CreatePurchaseBill() {
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const defaultTrackingType = tenant?.feature_config?.defaultTrackingType || 'quantity';
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([emptyItem()]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.get(token, '/api/suppliers?limit=500'),
      api.get(token, '/api/products?limit=500'),
    ]).then(([sRes, pRes]) => {
      const s = sRes?.data ?? [];
      const p = pRes?.data ?? [];
      setSuppliers(s);
      setProducts(p);
      if (s.length) setSupplierId(s[0].id);
    }).catch((e) => setError(e.message)).finally(() => setLoadingOptions(false));
  }, [token]);

  function addLine() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function updateLine(i, field, value) {
    setItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'product_id' && value) {
        const product = products.find((p) => p.id === value);
        if (product?.last_purchase_price != null) next[i].purchase_price = product.last_purchase_price;
        else if (product?.price != null) next[i].purchase_price = product.price;
      }
      return next;
    });
  }

  function removeLine(i) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  const subtotal = items.reduce((sum, it) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.purchase_price) || 0;
    return sum + qty * price;
  }, 0);
  const total = Math.round(subtotal * 100) / 100;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!supplierId || !billDate) {
      setError('Supplier and date are required.');
      return;
    }
    const validItems = items
      .map((it) => ({
        product_id: (it.product_id || '').toString().trim(),
        quantity: Number(it.quantity) || 0,
        purchase_price: Number(it.purchase_price) || 0,
      }))
      .filter((it) => it.product_id && it.quantity > 0);
    if (validItems.length === 0) {
      setError('Add at least one item with a product and quantity > 0.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        supplier_id: supplierId,
        bill_date: billDate,
        items: validItems,
      };
      if (billNumber.trim()) payload.bill_number = billNumber.trim();
      const bill = await api.post(token, '/api/purchase-bills', payload);
      showToast('Purchase bill created', 'success');
      navigate(`/purchase-bills/${bill.id}`);
    } catch (e) {
      setError(e.message || e.data?.error || 'Failed to create purchase bill');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingOptions && suppliers.length === 0 && products.length === 0) {
    return (
      <div className="page">
        <h1 className="page__title">New purchase bill</h1>
        <p className="page__muted">Loading…</p>
        <div className="card page__section">
          <ListSkeleton rows={4} columns={2} />
        </div>
      </div>
    );
  }

  const hasSerialOrBatch = items.some((it) => {
    const p = products.find((pr) => pr.id === it.product_id);
    return p && (p.tracking_type === 'serial' || p.tracking_type === 'batch');
  });

  return (
    <div className="page">
      <h1 className="page__title">New purchase bill</h1>
      <p className="page__muted" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
        Product type from Settings: <TrackingBadge type={defaultTrackingType} /> — Serial/Batch products need details when you Record the bill.
      </p>
      {error && <div className="page__error">{error}</div>}
      <form onSubmit={handleSubmit} className="card page__section">
        <div className="form form--grid">
          <label className="form__label">
            <span>Supplier</span>
            <select
              className="form__input"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              required
            >
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="form__label">
            <span>Bill number</span>
            <input
              type="text"
              className="form__input"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
              placeholder="Leave blank for auto (e.g. PB-0001)"
            />
            <span className="page__muted" style={{ display: 'block', fontSize: '0.8125rem', marginTop: '0.25rem' }}>Optional — leave blank to auto-generate</span>
          </label>
          <label className="form__label">
            <span>Bill date</span>
            <input
              type="date"
              className="form__input"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
              required
            />
          </label>
        </div>
        <h3 className="card__subheading" style={{ marginTop: '1rem' }}>Items</h3>
        {hasSerialOrBatch && (
          <p className="page__muted" style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            Some products are Serial or Batch — after creating the bill, open it and click Record to enter serial numbers or batch/expiry.
          </p>
        )}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Purchase price</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const product = products.find((p) => p.id === it.product_id);
                return (
                <tr key={i}>
                  <td>
                    <select
                      className="form__input form__input--sm"
                      value={it.product_id}
                      onChange={(e) => updateLine(i, 'product_id', e.target.value)}
                      required
                    >
                      <option value="">Select product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>{product ? <TrackingBadge type={product.tracking_type} /> : '—'}</td>
                  <td>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="form__input form__input--sm form__input--narrow"
                      value={it.quantity}
                      onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="form__input form__input--sm form__input--narrow"
                      value={it.purchase_price}
                      onChange={(e) => updateLine(i, 'purchase_price', e.target.value)}
                    />
                  </td>
                  <td>
                    {formatMoney((Number(it.quantity) || 0) * (Number(it.purchase_price) || 0), tenant)}
                  </td>
                  <td>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeLine(i)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn--secondary" style={{ marginTop: '0.5rem' }} onClick={addLine}>
          Add line
        </button>
        <p className="invoice-form__total" style={{ marginTop: '1rem' }}><strong>Total: {formatMoney(total, tenant)}</strong></p>
        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create purchase bill'}
          </button>
        </div>
      </form>
    </div>
  );
}
