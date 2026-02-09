import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import { columnLabel, INVOICE_COLS_BY_TRACKING_TYPE } from '../config/businessTypes';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import ListSkeleton from '../components/ListSkeleton';

/** Dropdown of available serials (IMEI) for a serial product. Fetches from API when productId is set. */
function SerialSelect({ productId, value, onChange, className = '' }) {
  const { token } = useAuth();
  const [serials, setSerials] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!productId || !token) {
      setSerials([]);
      return;
    }
    setLoading(true);
    api.get(token, `/api/products/${productId}/serials?status=available&limit=200`)
      .then((data) => setSerials(Array.isArray(data) ? data : data?.data ?? []))
      .catch(() => setSerials([]))
      .finally(() => setLoading(false));
  }, [productId, token]);
  if (!productId) return <span className={className}>—</span>;
  if (loading) return <span className={className}>Loading…</span>;
  return (
    <select className={className || 'form__input form__input--sm'} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select serial (IMEI)</option>
      {serials.map((s) => (
        <option key={s.id} value={s.id}>{s.serial_number || s.id}</option>
      ))}
      {serials.length === 0 && <option value="">No available serials</option>}
    </select>
  );
}

const emptyItem = () => ({ productId: '', description: '', quantity: 1, unitPrice: 0, selectedSerialId: '' });

function TrackingBadge({ type }) {
  const t = type || 'quantity';
  const colors = { quantity: 'badge--draft', serial: 'badge--sent', batch: 'badge--paid' };
  return <span className={`badge ${colors[t] || ''}`} style={{ fontSize: '0.7rem' }}>{t}</span>;
}

function productLabelFn(p, fmt, tenant) {
  const parts = [p.name];
  if (p.company) parts.push(p.company);
  if (p.ram_storage) parts.push(p.ram_storage);
  if (p.color) parts.push(p.color);
  return parts.join(' | ') + ' — ' + fmt(p.price, tenant);
}

function itemFromRow(row) {
  const item = {
    productId: row.product_id || '',
    description: row.description || '',
    quantity: Number(row.quantity) || 1,
    unitPrice: Number(row.unit_price) || 0,
    selectedSerialId: '', // serial picker selection not stored on invoice_items
  };
  for (const key of Object.keys(row)) {
    if (!(key in item) && key !== 'id' && key !== 'invoice_id' && key !== 'product_id' &&
        key !== 'description' && key !== 'quantity' && key !== 'unit_price' && key !== 'amount' &&
        key !== 'tax_percent' && key !== 'gst_type' && key !== 'cgst_amount' && key !== 'sgst_amount' &&
        key !== 'igst_amount' && key !== 'hsn_sac_code' && key !== 'cost_price' && key !== 'cost_amount' &&
        key !== 'created_at' && key !== 'updated_at') {
      item[key] = row[key] || '';
    }
  }
  return item;
}

/**
 * Unified invoice form for create and edit.
 * - No autosave: explicit "Save as Draft" or "Save & Send" buttons.
 * - If :id param exists, loads existing draft for editing.
 */
export default function InvoiceForm() {
  const { id } = useParams(); // undefined = create, string = edit
  const isEdit = !!id;
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { invoiceProductSearch, invoiceLineItems } = useBusinessConfig();
  const isTypeahead = invoiceProductSearch.method === 'typeahead';
  const defaultTrackingType = tenant?.feature_config?.defaultTrackingType || 'quantity';

  const extraInvCols = useMemo(() => {
    const allowed = INVOICE_COLS_BY_TRACKING_TYPE[defaultTrackingType];
    return Object.keys(invoiceLineItems).filter((k) => {
      if (!invoiceLineItems[k]) return false;
      if (k === 'imei') return false; // serials from picker, not product column
      if (!allowed) return true;
      return allowed.includes(k);
    });
  }, [invoiceLineItems, defaultTrackingType]);

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [gstType, setGstType] = useState('intra');
  const [items, setItems] = useState([emptyItem()]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const typeaheadDebounceRef = useRef(null);

  // Load customers, products, and (if edit) the existing invoice
  const productLimit = isTypeahead ? (invoiceProductSearch.limit || 20) : (invoiceProductSearch.limit || 500);
  useEffect(() => {
    if (!token) return;
    const fetches = [
      api.get(token, '/api/customers?limit=500'),
      api.get(token, `/api/products?limit=${productLimit}`),
    ];
    if (isEdit) fetches.push(api.get(token, `/api/invoices/${id}`));

    Promise.all(fetches)
      .then(([cRes, pRes, inv]) => {
        const c = Array.isArray(cRes) ? cRes : (cRes?.data ?? []);
        const p = Array.isArray(pRes) ? pRes : (pRes?.data ?? []);
        setCustomers(c);
        setProducts(p);

        if (isEdit && inv) {
          if (inv.status === 'paid') {
            navigate(`/invoices/${id}/print`, { replace: true });
            return;
          }
          setCustomerId(inv.customer_id || inv.customer?.id || '');
          setInvoiceDate(inv.invoice_date || '');
          setGstType(inv.gst_type === 'inter' ? 'inter' : 'intra');
          const invItems = inv.invoice_items || [];
          setItems(invItems.length ? invItems.map(itemFromRow) : [emptyItem()]);
        } else if (!isEdit && c.length) {
          setCustomerId(c[0].id);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, id, isEdit, navigate, productLimit]);

  // Typeahead search
  useEffect(() => {
    if (!token || !isTypeahead) return;
    if (!productSearchQuery.trim()) {
      setProductSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    if (typeaheadDebounceRef.current) clearTimeout(typeaheadDebounceRef.current);
    typeaheadDebounceRef.current = setTimeout(() => {
      typeaheadDebounceRef.current = null;
      const params = new URLSearchParams();
      params.set('limit', String(invoiceProductSearch.limit || 20));
      params.set('q', productSearchQuery.trim());
      setProductSearchLoading(true);
      api.get(token, `/api/products?${params.toString()}`)
        .then((res) => {
          const p = Array.isArray(res) ? res : (res?.data ?? []);
          setProductSearchResults(p);
          setShowSearchResults(true);
        })
        .catch(() => setProductSearchResults([]))
        .finally(() => setProductSearchLoading(false));
    }, invoiceProductSearch.typeaheadDebounceMs ?? 300);
    return () => { if (typeaheadDebounceRef.current) clearTimeout(typeaheadDebounceRef.current); };
  }, [token, isTypeahead, productSearchQuery, invoiceProductSearch.limit, invoiceProductSearch.typeaheadDebounceMs]);

  function makeLineFromProduct(product) {
    const line = { productId: product.id, description: product.name, quantity: 1, unitPrice: product.price, selectedSerialId: '' };
    for (const col of extraInvCols) {
      line[col] = product[col] || '';
    }
    return line;
  }

  function addProductFromSearch(product) {
    setItems((prev) => {
      const last = prev[prev.length - 1];
      if (last && !last.productId && !(last.description || '').trim() && Number(last.unitPrice) === 0) {
        const next = [...prev];
        next[prev.length - 1] = makeLineFromProduct(product);
        return next;
      }
      return [...prev, makeLineFromProduct(product)];
    });
    setProductSearchQuery('');
    setProductSearchResults([]);
    setShowSearchResults(false);
  }

  function addLine() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function updateLine(i, field, value) {
    setItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'productId' && value) {
        next[i].selectedSerialId = '';
        const product = products.find((p) => p.id === value);
        if (product) {
          next[i].description = product.name;
          next[i].unitPrice = product.price;
          for (const col of extraInvCols) {
            next[i][col] = product[col] || '';
          }
        }
      }
      return next;
    });
  }

  function removeLine(i) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const taxPercent = tenant?.tax_percent != null ? Number(tenant.tax_percent) : 0;
  const taxAmount = Math.round(subtotal * taxPercent / 100 * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  const hasSerialOrBatch = items.some((it) => {
    const p = products.find((pr) => pr.id === it.productId);
    return p && (p.tracking_type === 'serial' || p.tracking_type === 'batch');
  });

  function buildPayload(status) {
    const payload = {
      customerId,
      invoiceDate,
      status,
      gst_type: gstType,
      items: items.map((it) => ({
        productId: it.productId || undefined,
        description: (it.description || '').trim() || 'Item',
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unitPrice) || 0,
      })),
    };
    if (status === 'sent') {
      const serialIds = {};
      items.forEach((it) => {
        if (it.productId && it.selectedSerialId) {
          const pid = it.productId;
          if (!serialIds[pid]) serialIds[pid] = [];
          serialIds[pid].push(it.selectedSerialId);
        }
      });
      if (Object.keys(serialIds).length) payload.serialIds = serialIds;
    }
    return payload;
  }

  async function handleSave(status) {
    setError('');
    setSubmitting(true);
    try {
      const payload = buildPayload(status);
      let inv;
      if (isEdit) {
        inv = await api.patch(token, `/api/invoices/${id}`, payload);
        inv = inv || { id };
      } else {
        inv = await api.post(token, '/api/invoices', payload);
      }
      const msg = status === 'draft' ? 'Invoice saved as draft' : 'Invoice saved & sent';
      showToast(msg, 'success');
      if (status === 'sent') {
        navigate(`/invoices/${inv.id || id}/print`);
      } else {
        navigate('/invoices');
      }
    } catch (e) {
      setError(e.message || e.data?.error || 'Failed to save invoice');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    // Default form submit = Save & Send
    handleSave('sent');
  }

  const META_COLS = ['company', 'ram_storage', 'color'];

  if (loading) {
    return (
      <div className="page">
        <h1 className="page__title">{isEdit ? 'Edit invoice' : 'New invoice'}</h1>
        <p className="page__muted">Loading…</p>
        <div className="card page__section">
          <ListSkeleton rows={4} columns={2} />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page__title">{isEdit ? 'Edit invoice' : 'New invoice'}</h1>
      <p className="page__muted" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
        Product type from Settings: <TrackingBadge type={defaultTrackingType} /> — Serial/Batch: stock is allocated when you send.
      </p>
      {error && <div className="page__error">{error}</div>}
      <form onSubmit={handleSubmit} className="card page__section">
        <div className="form form--grid">
          <label className="form__label">
            <span>Customer</span>
            <select className="form__input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              <option value="">Select customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="form__label">
            <span>Date</span>
            <input type="date" className="form__input" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
          </label>
          <label className="form__label">
            <span>GST type</span>
            <select className="form__input" value={gstType} onChange={(e) => setGstType(e.target.value)}>
              <option value="intra">Intra-state (CGST + SGST)</option>
              <option value="inter">Inter-state (IGST)</option>
            </select>
          </label>
        </div>
        <h3 className="invoice-form__items-title">Items</h3>
        <p className="page__muted" style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          Type shows each line’s product: quantity, serial, or batch.
          {hasSerialOrBatch && ' For serial products, pick which serial (IMEI) to sell below; stock is deducted when you Save & Send.'}
        </p>
        {isTypeahead && (
          <div className="typeahead-wrap" style={{ marginBottom: '0.75rem' }}>
            <label className="form__label" style={{ marginBottom: 0 }}>
              <span>Search products to add</span>
              <input
                type="search"
                className="form__input"
                placeholder="Type product name…"
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                onFocus={() => { if (productSearchResults.length) setShowSearchResults(true); }}
                autoComplete="off"
              />
            </label>
            {productSearchLoading && <p className="page__muted" style={{ fontSize: '0.875rem', margin: '0.25rem 0 0' }}>Searching…</p>}
            {showSearchResults && !productSearchLoading && productSearchResults.length === 0 && productSearchQuery.trim() && (
              <p className="page__muted" style={{ fontSize: '0.875rem', margin: '0.25rem 0 0' }}>No products found for &quot;{productSearchQuery.trim()}&quot;</p>
            )}
            {showSearchResults && productSearchResults.length > 0 && (
              <ul className="typeahead-results">
                {productSearchResults.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="typeahead-results__item" onClick={() => addProductFromSearch(p)}>
                      <span className="typeahead-results__name">
                        {p.name}
                        {META_COLS.map((col) => p[col] ? (
                          <span key={col} className="typeahead-results__meta"> · {p[col]}</span>
                        ) : null)}
                      </span>
                      <span className="typeahead-results__price">{formatMoney(p.price, tenant)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Mobile: card-based line items */}
        <div className="invoice-items-cards">
          {items.map((it, i) => {
            const product = products.find((p) => p.id === it.productId);
            const isSerial = product?.tracking_type === 'serial';
            return (
              <div key={i} className="invoice-item-card">
                <label className="form__label">
                  <span>Product (optional)</span>
                  <select className="form__input" value={it.productId} onChange={(e) => updateLine(i, 'productId', e.target.value)}>
                    <option value="">—</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{productLabelFn(p, formatMoney, tenant)}</option>)}
                  </select>
                </label>
                {isSerial && (
                  <div className="form__label">
                    <span>Serial (IMEI) to sell</span>
                    <SerialSelect productId={it.productId} value={it.selectedSerialId} onChange={(v) => updateLine(i, 'selectedSerialId', v)} className="form__input" />
                  </div>
                )}
                <label className="form__label">
                  <span>Description</span>
                  <input className="form__input" value={it.description} onChange={(e) => updateLine(i, 'description', e.target.value)} placeholder="Description" />
                </label>
                {extraInvCols.map((col) => it[col] ? (
                  <div key={col} className="form__label"><span>{columnLabel(col)}</span><span className="form__readonly">{it[col]}</span></div>
                ) : null)}
                <div className="invoice-item-card__row">
                <label className="form__label" style={{ flex: 1 }}>
                  <span>Qty</span>
                  <input type="number" min="0.01" step="0.01" className="form__input" value={it.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} />
                </label>
                <label className="form__label" style={{ flex: 1 }}>
                  <span>Unit price</span>
                  <input type="number" min="0" step="0.01" className="form__input" value={it.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} />
                </label>
              </div>
              <div className="invoice-item-card__footer">
                <span className="invoice-item-card__amount">
                  {formatMoney((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), tenant)}
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeLine(i)}>Remove</button>
              </div>
            </div>
            );
          })}
        </div>

        {/* Tablet+: table-based line items */}
        <div className="invoice-items-table">
          <div className="table-wrap invoice-form__table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product (optional)</th>
                  {(defaultTrackingType === 'serial' || hasSerialOrBatch) && <th>Serial (IMEI)</th>}
                  <th>Description</th>
                  {extraInvCols.map((col) => <th key={col}>{columnLabel(col)}</th>)}
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const product = products.find((p) => p.id === it.productId);
                  const isSerial = product?.tracking_type === 'serial';
                  return (
                    <tr key={i}>
                      <td>
                        <select className="form__input form__input--sm" value={it.productId} onChange={(e) => updateLine(i, 'productId', e.target.value)}>
                          <option value="">—</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{productLabelFn(p, formatMoney, tenant)}</option>)}
                        </select>
                      </td>
                      {(defaultTrackingType === 'serial' || hasSerialOrBatch) && (
                        <td>
                          {isSerial ? (
                            <SerialSelect productId={it.productId} value={it.selectedSerialId} onChange={(v) => updateLine(i, 'selectedSerialId', v)} />
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                      )}
                      <td>
                        <input className="form__input form__input--sm" value={it.description} onChange={(e) => updateLine(i, 'description', e.target.value)} placeholder="Description" />
                      </td>
                      {extraInvCols.map((col) => <td key={col}>{it[col] || '—'}</td>)}
                      <td>
                        <input type="number" min="0.01" step="0.01" className="form__input form__input--sm form__input--narrow" value={it.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} />
                      </td>
                      <td>
                        <input type="number" min="0" step="0.01" className="form__input form__input--sm form__input--narrow" value={it.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} />
                      </td>
                      <td>{formatMoney((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), tenant)}</td>
                      <td>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeLine(i)}>Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <button type="button" className="btn btn--secondary invoice-form__add-line" onClick={addLine}>Add line</button>
        <div className="invoice-form__totals" style={{ marginTop: '1rem' }}>
          <p className="invoice-form__total">Subtotal: {formatMoney(subtotal, tenant)}</p>
          {taxPercent > 0 && (
            <p className="invoice-form__total">Tax ({taxPercent}%): {formatMoney(taxAmount, tenant)}</p>
          )}
          <p className="invoice-form__total"><strong>Total: {formatMoney(total, tenant)}</strong></p>
        </div>
        <div className="form__actions" style={{ gap: '0.75rem' }}>
          {isEdit && (
            <Link to={`/invoices/${id}/print`} className="btn btn--ghost">Cancel</Link>
          )}
          <button
            type="button"
            className="btn btn--secondary"
            disabled={submitting}
            onClick={() => handleSave('draft')}
          >
            {submitting ? 'Saving…' : 'Save as Draft'}
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save & Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
