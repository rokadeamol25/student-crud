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

function TrackingBadge({ type }) {
  const t = type || 'quantity';
  const colors = { quantity: 'badge--draft', serial: 'badge--sent', batch: 'badge--paid' };
  return <span className={`badge ${colors[t] || ''}`} style={{ fontSize: '0.7rem' }}>{t}</span>;
}

function stockDisplay(p) {
  const stock = Number(p.stock) ?? 0;
  const unit = (p.unit || '').toString().trim();
  if (!unit) return String(stock);
  return `${stock} · ${unit}`;
}

function productLabelFn(p, fmt, tenant) {
  const parts = [p.name];
  if (p.company) parts.push(p.company);
  if (p.ram_storage) parts.push(p.ram_storage);
  if (p.color) parts.push(p.color);
  let label = parts.join(' | ') + ' — ' + fmt(p.price, tenant);
  if (p.stock != null && p.stock !== '') label += ' · Stock: ' + stockDisplay(p);
  return label;
}

function itemFromRow(row) {
  const item = {
    productId: row.product_id || '',
    description: row.description || '',
    quantity: Number(row.quantity) || 1,
    unitPrice: Number(row.unit_price) || 0,
    discountType: row.discount_type || 'none',
    discountValue: Number(row.discount_value) || 0,
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
  const { invoiceProductSearch, invoiceLineItems, customerSupplierSearch, showRoughBillRef: showRoughBillRefEnabled, stockPolicy, defaultDiscountType, defaultDiscountValue } = useBusinessConfig();
  const isTypeahead = invoiceProductSearch.method === 'typeahead';
  const getEmptyItem = () => ({
    productId: '', description: '', quantity: 1, unitPrice: 0, selectedSerialId: '',
    discountType: (defaultDiscountType === 'percent' || defaultDiscountType === 'flat') ? defaultDiscountType : 'none',
    discountValue: Math.max(0, Number(defaultDiscountValue) || 0),
  });
  const isCustomerTypeahead = (customerSupplierSearch?.method ?? 'dropdown') === 'typeahead';
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
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [roughBillRef, setRoughBillRef] = useState('');
  const [gstType, setGstType] = useState('intra');
  const [items, setItems] = useState(() => [getEmptyItem()]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const typeaheadDebounceRef = useRef(null);
  const customerDebounceRef = useRef(null);
  const selectedCustomerDisplayRef = useRef(null);

  // Load customers (full list only when dropdown), products, and (if edit) the existing invoice
  const productLimit = isTypeahead ? (invoiceProductSearch.limit || 20) : (invoiceProductSearch.limit || 500);
  useEffect(() => {
    if (!token) return;
    const fetches = [
      isCustomerTypeahead ? Promise.resolve({ data: [] }) : api.get(token, '/api/customers?limit=500'),
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
          const cid = inv.customer_id || inv.customer?.id || '';
          setCustomerId(cid);
          if (inv.customer) setSelectedCustomer(inv.customer);
          setInvoiceDate(inv.invoice_date || '');
          setGstType(inv.gst_type === 'inter' ? 'inter' : 'intra');
          setRoughBillRef(inv.rough_bill_ref || '');
          const invItems = inv.invoice_items || [];
          setItems(invItems.length ? invItems.map(itemFromRow) : [getEmptyItem()]);
        } else if (!isEdit && !isCustomerTypeahead && c.length) {
          setCustomerId(c[0].id);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, id, isEdit, navigate, productLimit, isCustomerTypeahead]);

  // Restore selected customer display when we have customerId but selectedCustomer was lost
  useEffect(() => {
    if (!isCustomerTypeahead || !token || !customerId || (selectedCustomer && selectedCustomer.id === customerId)) return;
    api.get(token, `/api/customers/${customerId}`)
      .then((data) => {
        if (!data?.id) return;
        const obj = { id: data.id, name: data.name ?? '', email: data.email ?? '', phone: data.phone ?? '' };
        selectedCustomerDisplayRef.current = obj;
        setSelectedCustomer(obj);
      })
      .catch(() => {});
  }, [isCustomerTypeahead, token, customerId, selectedCustomer?.id]);

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

  // Customer typeahead: debounced search when method is typeahead
  useEffect(() => {
    if (!isCustomerTypeahead || !token) return;
    if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);
    const q = customerSearchQuery.trim();
    if (!q) {
      setCustomerSearchResults([]);
      return;
    }
    customerDebounceRef.current = setTimeout(() => {
      customerDebounceRef.current = null;
      setCustomerSearchLoading(true);
      api.get(token, `/api/customers?q=${encodeURIComponent(q)}&limit=30`)
        .then((res) => {
          const c = Array.isArray(res) ? res : (res?.data ?? []);
          setCustomerSearchResults(c);
          setShowCustomerResults(true);
        })
        .catch(() => setCustomerSearchResults([]))
        .finally(() => setCustomerSearchLoading(false));
    }, 300);
    return () => { if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current); };
  }, [token, isCustomerTypeahead, customerSearchQuery]);

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
    setItems((prev) => [...prev, getEmptyItem()]);
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

  function lineNetAmount(it) {
    const qty = Number(it.quantity) || 0;
    const unit = Number(it.unitPrice) || 0;
    const base = Math.round(qty * unit * 100) / 100;
    const val = Number(it.discountValue) || 0;
    let disc = 0;
    if (it.discountType === 'flat') {
      disc = Math.min(base, Math.max(0, val));
    } else if (it.discountType === 'percent') {
      const pct = Math.max(0, val);
      disc = Math.round(base * pct / 100 * 100) / 100;
      if (disc > base) disc = base;
    }
    return base - disc;
  }

  const subtotal = items.reduce((sum, it) => sum + lineNetAmount(it), 0);
  const discountTotal = items.reduce((sum, it) => {
    const qty = Number(it.quantity) || 0;
    const unit = Number(it.unitPrice) || 0;
    const base = Math.round(qty * unit * 100) / 100;
    const net = lineNetAmount(it);
    return sum + (base - net);
  }, 0);
  const taxPercent = tenant?.tax_percent != null ? Number(tenant.tax_percent) : 0;
  const taxAmount = Math.round(subtotal * taxPercent / 100 * 100) / 100;
  const total = Math.round(subtotal + taxAmount);

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
        discountType: it.discountType === 'flat' || it.discountType === 'percent' ? it.discountType : undefined,
        discountValue: Number(it.discountValue) || 0,
      })),
    };
    if (showRoughBillRefEnabled) payload.rough_bill_ref = (roughBillRef || '').trim() || undefined;
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
    if (isCustomerTypeahead && !customerId) {
      setError('Please select a customer');
      return;
    }
    if (stockPolicy === 'block') {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.productId) continue;
        const product = products.find((p) => p.id === it.productId);
        if (product && product.stock != null && product.stock !== '') {
          const stock = Number(product.stock) || 0;
          const qty = Number(it.quantity) || 0;
          if (qty > stock) {
            setError(`Quantity exceeds available stock for "${product.name}" (available: ${stock}). Reduce quantity or change stock policy in Settings.`);
            return;
          }
        }
      }
    }
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
            {isCustomerTypeahead ? (
              <div className="typeahead-wrap">
                {(selectedCustomer || selectedCustomerDisplayRef.current || customerId) ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className="form__input" style={{ flex: '1 1 12rem', minHeight: 40, display: 'flex', alignItems: 'center' }}>
                      {(selectedCustomer || selectedCustomerDisplayRef.current) ? (
                        <>{((selectedCustomer || selectedCustomerDisplayRef.current).name || 'Customer').trim() || 'Customer'}{(selectedCustomer || selectedCustomerDisplayRef.current).phone ? ` · ${(selectedCustomer || selectedCustomerDisplayRef.current).phone}` : ''}{(selectedCustomer || selectedCustomerDisplayRef.current).email ? ` · ${(selectedCustomer || selectedCustomerDisplayRef.current).email}` : ''}</>
                      ) : (
                        <>Customer selected (loading…)</>
                      )}
                    </span>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => { selectedCustomerDisplayRef.current = null; setSelectedCustomer(null); setCustomerId(''); setCustomerSearchQuery(''); setCustomerSearchResults([]); }}>
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="search"
                      className="form__input"
                      placeholder="Search customer by name…"
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      onFocus={() => { if (customerSearchResults.length) setShowCustomerResults(true); }}
                      autoComplete="off"
                    />
                    {customerSearchLoading && <p className="page__muted" style={{ fontSize: '0.875rem', margin: '0.25rem 0 0' }}>Searching…</p>}
                    {showCustomerResults && !customerSearchLoading && customerSearchQuery.trim() && customerSearchResults.length === 0 && (
                      <p className="page__muted" style={{ fontSize: '0.875rem', margin: '0.25rem 0 0' }}>No customers found for &quot;{customerSearchQuery.trim()}&quot;</p>
                    )}
                    {showCustomerResults && customerSearchResults.length > 0 && (
                      <ul className="typeahead-results">
                        {customerSearchResults.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="typeahead-results__item"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const picked = { id: c.id, name: (c.name != null ? String(c.name) : '') || '', email: c.email || '', phone: c.phone || '' };
                                selectedCustomerDisplayRef.current = picked;
                                setCustomerId(picked.id);
                                setSelectedCustomer(picked);
                                setCustomerSearchQuery('');
                                setCustomerSearchResults([]);
                                setShowCustomerResults(false);
                              }}
                            >
                              <span className="typeahead-results__name">{c.name}</span>
                              {c.email ? <span className="typeahead-results__meta"> · {c.email}</span> : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {!customerId && <p className="page__muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>Type to search and select a customer</p>}
              </div>
            ) : (
              <select className="form__input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
                <option value="">Select customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
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
          {showRoughBillRefEnabled && (
            <label className="form__label">
              <span>Rough bill ref (optional)</span>
              <input
                className="form__input"
                placeholder="Internal reference (e.g. rough bill no.)"
                value={roughBillRef}
                onChange={(e) => setRoughBillRef(e.target.value)}
                maxLength={100}
              />
            </label>
          )}
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
                      <span className="typeahead-results__price">
                        {formatMoney(p.price, tenant)}
                        {p.stock != null && p.stock !== '' && (
                          <span className="typeahead-results__meta" style={{ marginLeft: '0.5rem' }}>Stock: {stockDisplay(p)}</span>
                        )}
                      </span>
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
                  <span>Qty{product && product.stock != null && product.stock !== '' ? ` (Available: ${stockDisplay(product)})` : ''}</span>
                  <input type="number" min="0.01" step="0.01" className="form__input form__input--number" value={it.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} />
                  {product && product.stock != null && product.stock !== '' && Number(it.quantity) > Number(product.stock) && (
                    <p className="form__error-inline invoice-form__stock-warning" role="alert">Quantity exceeds available stock</p>
                  )}
                </label>
                <label className="form__label" style={{ flex: 1 }}>
                  <span>Unit price</span>
                  <input type="number" min="0" step="0.01" className="form__input form__input--number" value={it.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} />
                </label>
              </div>
              <div className="invoice-item-card__row">
                <label className="form__label" style={{ flex: 1 }}>
                  <span>Discount type</span>
                  <select className="form__input" value={it.discountType || 'none'} onChange={(e) => updateLine(i, 'discountType', e.target.value)}>
                    <option value="none">No discount</option>
                    <option value="percent">% off</option>
                    <option value="flat">Flat</option>
                  </select>
                </label>
                <label className="form__label" style={{ flex: 1 }}>
                  <span>Discount value</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form__input form__input--number"
                    value={it.discountValue}
                    onChange={(e) => updateLine(i, 'discountValue', e.target.value)}
                  />
                </label>
              </div>
              <div className="invoice-item-card__footer">
                <span className="invoice-item-card__amount">
                  {formatMoney(lineNetAmount(it), tenant)}
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeLine(i)}>Remove</button>
              </div>
            </div>
            );
          })}
        </div>

        {/* Tablet+: table-based line items */}
        <div className="invoice-items-table">
          <p className="table-swipe-hint" aria-live="polite">Swipe to see more columns</p>
          <div className="table-wrap invoice-form__table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Product (optional)</th>
                  {(defaultTrackingType === 'serial' || hasSerialOrBatch) && <th scope="col">Serial (IMEI)</th>}
                  <th scope="col">Description</th>
                  {extraInvCols.map((col) => <th scope="col" key={col}>{columnLabel(col)}</th>)}
                  <th scope="col">Qty</th>
                  <th scope="col">Unit price</th>
                  <th scope="col">Disc</th>
                  <th scope="col">Amount</th>
                  <th scope="col"></th>
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
                        <div>
                          <input type="number" min="0.01" step="0.01" className="form__input form__input--sm form__input--narrow form__input--number" value={it.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} />
                          {product && product.stock != null && product.stock !== '' && (
                            <span className="page__muted" style={{ display: 'block', fontSize: '0.75rem', marginTop: '0.125rem' }}>Available: {stockDisplay(product)}</span>
                          )}
                          {product && product.stock != null && product.stock !== '' && Number(it.quantity) > Number(product.stock) && (
                            <p className="form__error-inline invoice-form__stock-warning" style={{ marginTop: '0.25rem', marginBottom: 0 }} role="alert">Exceeds stock</p>
                          )}
                        </div>
                      </td>
                      <td>
                        <input type="number" min="0" step="0.01" className="form__input form__input--sm form__input--narrow form__input--number" value={it.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                          <select
                            className="form__input form__input--sm form__input--narrow"
                            value={it.discountType || 'none'}
                            onChange={(e) => updateLine(i, 'discountType', e.target.value)}
                          >
                            <option value="none">None</option>
                            <option value="percent">% off</option>
                            <option value="flat">Flat</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="form__input form__input--sm form__input--narrow form__input--number"
                            value={it.discountValue}
                            onChange={(e) => updateLine(i, 'discountValue', e.target.value)}
                          />
                        </div>
                      </td>
                      <td>{formatMoney(lineNetAmount(it), tenant)}</td>
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
          <p className="invoice-form__total">Subtotal: {formatMoney(subtotal + discountTotal, tenant)}</p>
          {discountTotal > 0 && (
            <p className="invoice-form__total">Discount: -{formatMoney(discountTotal, tenant)}</p>
          )}
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
