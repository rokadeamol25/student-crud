import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import { columnLabel } from '../config/businessTypes';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import ListSkeleton from '../components/ListSkeleton';

const AUTOSAVE_DEBOUNCE_MS = 2500;

const emptyItem = () => ({ productId: '', description: '', quantity: 1, unitPrice: 0 });

function productLabelFn(p, fmt, tenant) {
  const parts = [p.name];
  if (p.company) parts.push(p.company);
  if (p.ram_storage) parts.push(p.ram_storage);
  if (p.color) parts.push(p.color);
  return parts.join(' | ') + ' — ' + fmt(p.price, tenant);
}

function itemFromRow(row) {
  // Copy all fields from the DB row (snake_case)
  const item = {
    productId: row.product_id || '',
    description: row.description || '',
    quantity: Number(row.quantity) || 1,
    unitPrice: Number(row.unit_price) || 0,
  };
  // Dynamically copy any extra columns that exist in the row
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

export default function EditInvoice() {
  const { id } = useParams();
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { invoiceProductSearch, invoiceLineItems } = useBusinessConfig();
  const isTypeahead = invoiceProductSearch.method === 'typeahead';

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
  const [invoiceDate, setInvoiceDate] = useState('');
  const [gstType, setGstType] = useState('intra');
  const [items, setItems] = useState([emptyItem()]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [loadedInvoice, setLoadedInvoice] = useState(null);
  const debounceRef = useRef(null);
  const typeaheadDebounceRef = useRef(null);
  const initialLoadRef = useRef(false);

  const canAutosave = !loading && customerId && invoiceDate && items.length > 0 &&
    items.some((it) => (it.description || '').trim() || it.productId);

  const performSave = useCallback(async () => {
    if (!token || !id || !canAutosave) return;
    setSaveStatus('saving');
    try {
      await api.patch(token, `/api/invoices/${id}`, {
        customerId,
        invoiceDate,
        gst_type: gstType,
        items: items.map((it) => ({
          productId: it.productId || undefined,
          description: (it.description || '').trim() || 'Item',
          quantity: Number(it.quantity) || 1,
          unitPrice: Number(it.unitPrice) || 0,
        })),
      });
      setSaveStatus('saved');
      setLastSavedAt(new Date());
    } catch (e) {
      setSaveStatus('idle');
      setError(e.message || e.data?.error || 'Autosave failed');
    }
  }, [token, id, customerId, invoiceDate, gstType, items, canAutosave]);

  useEffect(() => {
    if (!canAutosave || !initialLoadRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      performSave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [customerId, invoiceDate, items, canAutosave, performSave]);

  const productLimit = isTypeahead ? (invoiceProductSearch.limit || 20) : (invoiceProductSearch.limit || 500);
  useEffect(() => {
    if (!token || !id) return;
    Promise.all([
      api.get(token, '/api/customers?limit=500'),
      api.get(token, `/api/products?limit=${productLimit}`),
      api.get(token, `/api/invoices/${id}`),
    ])
      .then(([cRes, pRes, inv]) => {
        const c = Array.isArray(cRes) ? cRes : (cRes?.data ?? []);
        const p = Array.isArray(pRes) ? pRes : (pRes?.data ?? []);
        setCustomers(c);
        setProducts(p);
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
        setGstType(inv.gst_type === 'inter' ? 'inter' : 'intra');
        const invItems = inv.invoice_items || [];
        setItems(invItems.length ? invItems.map(itemFromRow) : [emptyItem()]);
        setLoadedInvoice(inv);
        initialLoadRef.current = true;
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, id, navigate, productLimit]);

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
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
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
      await api.patch(token, `/api/invoices/${id}`, {
        customerId,
        invoiceDate,
        gst_type: gstType,
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

  const META_COLS = ['company', 'ram_storage', 'color', 'imei'];

  if (loading) {
    return (
      <div className="page">
        <h1 className="page__title">Edit invoice</h1>
        <p className="page__muted">Loading invoice…</p>
        <div className="card page__section">
          <ListSkeleton rows={5} columns={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page__title">Edit invoice</h1>
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
          {(() => {
            const invItems = loadedInvoice?.invoice_items;
            if (!invItems?.length) return null;
            const costTotal = invItems.reduce((s, row) => s + (Number(row.cost_amount) || 0), 0);
            const grossProfit = total - costTotal;
            const profitPct = total > 0 ? (grossProfit / total * 100) : 0;
            return (
              <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', fontSize: '0.9rem', color: 'var(--muted)' }}>
                <p className="invoice-form__total">Cost total: {formatMoney(costTotal, tenant)}</p>
                <p className="invoice-form__total">Gross profit: {formatMoney(grossProfit, tenant)}</p>
                <p className="invoice-form__total">Profit %: {profitPct.toFixed(1)}%</p>
              </div>
            );
          })()}
        </div>
        <div className="form__actions">
          <Link to={`/invoices/${id}/print`} className="btn btn--secondary">Cancel</Link>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
