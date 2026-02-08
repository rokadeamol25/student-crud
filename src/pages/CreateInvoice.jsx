import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../api/client';

const emptyItem = () => ({ productId: '', description: '', quantity: 1, unitPrice: 0 });

export default function CreateInvoice() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([emptyItem()]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.get(token, '/api/customers'),
      api.get(token, '/api/products'),
    ]).then(([c, p]) => {
      setCustomers(c || []);
      setProducts(p || []);
      if ((c || []).length) setCustomerId(c[0].id);
    }).catch((e) => setError(e.message));
  }, [token]);

  function addLine() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function updateLine(i, field, value) {
    setItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'productId' && value) {
        const product = products.find((p) => p.id === value);
        if (product) {
          next[i].description = product.name;
          next[i].unitPrice = product.price;
        }
      }
      return next;
    });
  }

  function removeLine(i) {
    setItems((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  }

  const total = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        customerId,
        invoiceDate,
        status: 'draft',
        items: items.map((it) => ({
          productId: it.productId || undefined,
          description: (it.description || '').trim() || 'Item',
          quantity: Number(it.quantity) || 1,
          unitPrice: Number(it.unitPrice) || 0,
        })),
      };
      const inv = await api.post(token, '/api/invoices', payload);
      navigate(`/invoices/${inv.id}/print`);
    } catch (e) {
      setError(e.message || e.data?.error || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">New invoice</h1>
      {error && <div className="page__error">{error}</div>}
      <form onSubmit={handleSubmit} className="card page__section">
        <div className="form form--grid">
          <label className="form__label">
            <span>Customer</span>
            <select
              className="form__input"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="form__label">
            <span>Date</span>
            <input
              type="date"
              className="form__input"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              required
            />
          </label>
        </div>
        <h3 className="invoice-form__items-title">Items</h3>
        <div className="table-wrap invoice-form__table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Product (optional)</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>
                  <select
                    className="form__input form__input--sm"
                    value={it.productId}
                    onChange={(e) => updateLine(i, 'productId', e.target.value)}
                  >
                    <option value="">—</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — ₹{Number(p.price).toFixed(2)}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="form__input form__input--sm"
                    value={it.description}
                    onChange={(e) => updateLine(i, 'description', e.target.value)}
                    placeholder="Description"
                  />
                </td>
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
                    value={it.unitPrice}
                    onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                  />
                </td>
                <td>₹{((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)).toFixed(2)}</td>
                <td>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeLine(i)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <button type="button" className="btn btn--secondary invoice-form__add-line" onClick={addLine}>
          Add line
        </button>
        <p className="invoice-form__total"><strong>Total: ₹{total.toFixed(2)}</strong></p>
        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}
