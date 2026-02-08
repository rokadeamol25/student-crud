import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';

const emptyItem = () => ({ productId: '', description: '', quantity: 1, unitPrice: 0 });

function itemFromRow(row) {
  return {
    productId: row.product_id || '',
    description: row.description || '',
    quantity: Number(row.quantity) || 1,
    unitPrice: Number(row.unit_price) || 0,
  };
}

export default function EditInvoice() {
  const { id } = useParams();
  const { token } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [items, setItems] = useState([emptyItem()]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !id) return;
    Promise.all([
      api.get(token, '/api/customers'),
      api.get(token, '/api/products'),
      api.get(token, `/api/invoices/${id}`),
    ])
      .then(([c, p, inv]) => {
        setCustomers(c || []);
        setProducts(p || []);
        if (!inv) {
          setError('Invoice not found');
          return;
        }
        if (inv.status !== 'draft') {
          navigate(`/invoices/${id}/print`, { replace: true });
          return;
        }
        setCustomerId(inv.customer_id || inv.customer?.id || '');
        setInvoiceDate(inv.invoice_date || '');
        const invItems = inv.invoice_items || [];
        setItems(invItems.length ? invItems.map(itemFromRow) : [emptyItem()]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, id, navigate]);

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
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  const total = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.patch(token, `/api/invoices/${id}`, {
        customerId,
        invoiceDate,
        items: items.map((it) => ({
          productId: it.productId || undefined,
          description: (it.description || '').trim() || 'Item',
          quantity: Number(it.quantity) || 1,
          unitPrice: Number(it.unitPrice) || 0,
        })),
      });
      showToast('Invoice updated', 'success');
      navigate(`/invoices/${id}/print`);
    } catch (e) {
      setError(e.message || e.data?.error || 'Failed to update invoice');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <p className="page__muted">Loading invoice…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page__title">Edit invoice</h1>
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

        <div className="invoice-items-cards">
          {items.map((it, i) => (
            <div key={i} className="invoice-item-card">
              <label className="form__label">
                <span>Product (optional)</span>
                <select
                  className="form__input"
                  value={it.productId}
                  onChange={(e) => updateLine(i, 'productId', e.target.value)}
                >
                  <option value="">—</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — ₹{Number(p.price).toFixed(2)}</option>
                  ))}
                </select>
              </label>
              <label className="form__label">
                <span>Description</span>
                <input
                  className="form__input"
                  value={it.description}
                  onChange={(e) => updateLine(i, 'description', e.target.value)}
                  placeholder="Description"
                />
              </label>
              <div className="invoice-item-card__row">
                <label className="form__label" style={{ flex: 1 }}>
                  <span>Qty</span>
                  <input
                    type="number" min="0.01" step="0.01"
                    className="form__input"
                    value={it.quantity}
                    onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                  />
                </label>
                <label className="form__label" style={{ flex: 1 }}>
                  <span>Unit price</span>
                  <input
                    type="number" min="0" step="0.01"
                    className="form__input"
                    value={it.unitPrice}
                    onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                  />
                </label>
              </div>
              <div className="invoice-item-card__footer">
                <span className="invoice-item-card__amount">
                  ₹{((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)).toFixed(2)}
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeLine(i)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="invoice-items-table">
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
                        type="number" min="0.01" step="0.01"
                        className="form__input form__input--sm form__input--narrow"
                        value={it.quantity}
                        onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min="0" step="0.01"
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
        </div>

        <button type="button" className="btn btn--secondary invoice-form__add-line" onClick={addLine}>
          Add line
        </button>
        <p className="invoice-form__total"><strong>Total: ₹{total.toFixed(2)}</strong></p>
        <div className="form__actions">
          <Link to={`/invoices/${id}/print`} className="btn btn--secondary">
            Cancel
          </Link>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
