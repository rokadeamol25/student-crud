import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import { columnLabel } from '../config/businessTypes';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import ListSkeleton from '../components/ListSkeleton';

const emptyItem = () => ({ productId: '', description: '', quantity: 1, unitPrice: 0 });

function productLabelFn(p, fmt, tenant) {
  const parts = [p.name];
  if (p.company) parts.push(p.company);
  if (p.ram_storage) parts.push(p.ram_storage);
  if (p.color) parts.push(p.color);
  return parts.join(' | ') + ' — ' + fmt(p.price, tenant);
}
const AUTOSAVE_DEBOUNCE_MS = 2500;

function buildPayload(customerId, invoiceDate, items, gstType = 'intra') {
  return {
    customerId,
    invoiceDate,
    status: 'draft',
    gst_type: gstType,
    items: items.map((it) => ({
      productId: it.productId || undefined,
      description: (it.description || '').trim() || 'Item',
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unitPrice) || 0,
    })),
  };
}

export default function CreateInvoice() {
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { invoiceProductSearch, invoiceLineItems } = useBusinessConfig();
  const isTypeahead = invoiceProductSearch.method === 'typeahead';

  // Dynamic extra columns for invoice line items
  const extraInvCols = useMemo(() =>
    Object.keys(invoiceLineItems).filter((k) => invoiceLineItems[k]),
    [invoiceLineItems]
  );

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
  const [draftId, setDraftId] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const debounceRef = useRef(null);
  const typeaheadDebounceRef = useRef(null);

  const canAutosave = customerId && invoiceDate && items.length > 0 &&
    items.some((it) => (it.description || '').trim() || it.productId);

  const performSave = useCallback(async () => {
    if (!token || !canAutosave) return;
    setSaveStatus('saving');
    try {
      const payload = buildPayload(customerId, invoiceDate, items, gstType);
      if (draftId) {
        await api.patch(token, `/api/invoices/${draftId}`, payload);
      } else {
        const inv = await api.post(token, '/api/invoices', payload);
        setDraftId(inv.id);
      }
      setSaveStatus('saved');
      setLastSavedAt(new Date());
    } catch (e) {
      setSaveStatus('idle');
      setError(e.message || e.data?.error || 'Autosave failed');
    }
  }, [token, draftId, customerId, invoiceDate, gstType, items, canAutosave]);

  useEffect(() => {
    if (!canAutosave) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      performSave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [customerId, invoiceDate, items, canAutosave, performSave]);

  const productLimit = isTypeahead ? (invoiceProductSearch.limit || 20) : (invoiceProductSearch.limit || 500);
  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.get(token, '/api/customers?limit=500'),
      api.get(token, `/api/products?limit=${productLimit}`),
    ]).then(([cRes, pRes]) => {
      const c = Array.isArray(cRes) ? cRes : (cRes?.data ?? []);
      const p = Array.isArray(pRes) ? pRes : (pRes?.data ?? []);
      setCustomers(c);
      setProducts(p);
      if (c.length) setCustomerId(c[0].id);
    }).catch((e) => setError(e.message)).finally(() => setLoadingOptions(false));
  }, [token, productLimit]);

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
    const line = { productId: product.id, description: product.name, quantity: 1, unitPrice: product.price };
    // Copy all extra columns from product (snake_case)
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
    setItems((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  }

  const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const taxPercent = tenant?.tax_percent != null ? Number(tenant.tax_percent) : 0;
  const taxAmount = Math.round(subtotal * taxPercent / 100 * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = buildPayload(customerId, invoiceDate, items);
      if (draftId) {
        await api.patch(token, `/api/invoices/${draftId}`, payload);
        showToast('Invoice updated', 'success');
        navigate(`/invoices/${draftId}/print`);
      } else {
        const inv = await api.post(token, '/api/invoices', payload);
        showToast('Invoice created', 'success');
        navigate(`/invoices/${inv.id}/print`);
      }
    } catch (e) {
      setError(e.message || e.data?.error || 'Failed to save invoice');
    } finally {
      setSubmitting(false);
    }
  }

  // Meta fields to show in typeahead results (show all that have a value)
  const META_COLS = ['company', 'ram_storage', 'color', 'imei'];

  if (loadingOptions && customers.length === 0 && products.length === 0) {
    return (
      <div className="page">
        <h1 className="page__title">New invoice</h1>
        <p className="page__muted">Loading…</p>
        <div className="card page__section">
          <ListSkeleton rows={4} columns={2} />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page__title">New invoice</h1>
      {(saveStatus === 'saving' || saveStatus === 'saved') && (
        <p className="page__muted invoice-form__autosave" style={{ marginBottom: '0.5rem' }}>
          {saveStatus === 'saving' ? 'Saving…' : lastSavedAt ? `Saved at ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Saved'}
        </p>
      )}
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
                          <span key={col} className="typeahead-results__meta"> · {col === 'imei' ? `IMEI: ${p[col]}` : p[col]}</span>
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
          {items.map((it, i) => (
            <div key={i} className="invoice-item-card">
              <label className="form__label">
                <span>Product (optional)</span>
                <select className="form__input" value={it.productId} onChange={(e) => updateLine(i, 'productId', e.target.value)}>
                  <option value="">—</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{productLabelFn(p, formatMoney, tenant)}</option>)}
                </select>
              </label>
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
          ))}
        </div>

        {/* Tablet+: table-based line items */}
        <div className="invoice-items-table">
          <div className="table-wrap invoice-form__table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product (optional)</th>
                  <th>Description</th>
                  {extraInvCols.map((col) => <th key={col}>{columnLabel(col)}</th>)}
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
                      <select className="form__input form__input--sm" value={it.productId} onChange={(e) => updateLine(i, 'productId', e.target.value)}>
                        <option value="">—</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{productLabelFn(p, formatMoney, tenant)}</option>)}
                      </select>
                    </td>
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
                ))}
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
        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}
