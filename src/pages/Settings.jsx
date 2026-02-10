import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { columnLabel } from '../config/businessTypes';
import * as api from '../api/client';

export default function Settings() {
  const { token, tenant, refetchMe } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState(tenant?.name ?? '');
  const [address, setAddress] = useState(tenant?.address ?? '');
  const [phone, setPhone] = useState(tenant?.phone ?? '');
  const [currency, setCurrency] = useState(tenant?.currency ?? 'INR');
  const [currencySymbol, setCurrencySymbol] = useState(tenant?.currency_symbol ?? '₹');
  const [gstin, setGstin] = useState(tenant?.gstin ?? '');
  const [taxPercent, setTaxPercent] = useState(tenant?.tax_percent != null ? String(tenant.tax_percent) : '0');
  const [invoicePrefix, setInvoicePrefix] = useState(tenant?.invoice_prefix ?? 'INV-');
  const [invoiceNextNumber, setInvoiceNextNumber] = useState(tenant?.invoice_next_number != null ? String(tenant.invoice_next_number) : '1');
  const [invoiceHeaderNote, setInvoiceHeaderNote] = useState(tenant?.invoice_header_note ?? '');
  const [invoiceFooterNote, setInvoiceFooterNote] = useState(tenant?.invoice_footer_note ?? '');
  const [invoicePageSize, setInvoicePageSize] = useState(tenant?.invoice_page_size ?? 'A4');

  // Dynamic column lists fetched from the DB schema
  const [productColumns, setProductColumns] = useState([]);
  const [invoiceItemColumns, setInvoiceItemColumns] = useState([]);

  // Strip old camelCase keys (showUnit, showImei, etc.) — only keep snake_case DB column names
  function cleanToggles(obj) {
    if (!obj || typeof obj !== 'object') return {};
    const out = {};
    for (const k of Object.keys(obj)) {
      if (/^[a-z][a-z0-9_]*$/.test(k)) out[k] = obj[k];
    }
    return out;
  }

  // Dynamic toggle state: column_name → boolean
  const fc = tenant?.feature_config ?? {};
  const [prodToggles, setProdToggles] = useState(cleanToggles(fc?.productForm));
  const [invToggles, setInvToggles] = useState(cleanToggles(fc?.invoiceLineItems));
  const [searchMethod, setSearchMethod] = useState(fc?.invoiceProductSearch?.method ?? 'dropdown');
  const [customerSupplierSearchMethod, setCustomerSupplierSearchMethod] = useState(fc?.customerSupplierSearch?.method ?? 'dropdown');
  const [defaultTrackingType, setDefaultTrackingType] = useState(fc?.defaultTrackingType ?? 'quantity');
  const [logoUploading, setLogoUploading] = useState(false);

  // Fetch available columns from DB on mount
  useEffect(() => {
    if (!token) return;
    api.get(token, '/api/me/columns')
      .then((res) => {
        setProductColumns(res.productColumns || []);
        setInvoiceItemColumns(res.invoiceItemColumns || []);
      })
      .catch(() => {}); // graceful if endpoint not available yet
  }, [token]);

  useEffect(() => {
    if (tenant?.name !== undefined) setName(tenant.name ?? '');
    if (tenant?.address !== undefined) setAddress(tenant.address ?? '');
    if (tenant?.phone !== undefined) setPhone(tenant.phone ?? '');
    if (tenant?.currency !== undefined) setCurrency(tenant.currency ?? 'INR');
    if (tenant?.currency_symbol !== undefined) setCurrencySymbol(tenant.currency_symbol ?? '₹');
    if (tenant?.gstin !== undefined) setGstin(tenant.gstin ?? '');
    if (tenant?.tax_percent != null) setTaxPercent(String(tenant.tax_percent));
    if (tenant?.invoice_prefix !== undefined) setInvoicePrefix(tenant.invoice_prefix ?? 'INV-');
    if (tenant?.invoice_next_number != null) setInvoiceNextNumber(String(tenant.invoice_next_number));
    if (tenant?.invoice_header_note !== undefined) setInvoiceHeaderNote(tenant.invoice_header_note ?? '');
    if (tenant?.invoice_footer_note !== undefined) setInvoiceFooterNote(tenant.invoice_footer_note ?? '');
    if (tenant?.invoice_page_size !== undefined) setInvoicePageSize(tenant.invoice_page_size ?? 'A4');
    const tfc = tenant?.feature_config ?? {};
    setProdToggles(cleanToggles(tfc?.productForm));
    setInvToggles(cleanToggles(tfc?.invoiceLineItems));
    setSearchMethod(tfc?.invoiceProductSearch?.method ?? 'dropdown');
    setCustomerSupplierSearchMethod(tfc?.customerSupplierSearch?.method ?? 'dropdown');
    setDefaultTrackingType(tfc?.defaultTrackingType ?? 'quantity');
  }, [tenant?.name, tenant?.address, tenant?.phone, tenant?.currency, tenant?.currency_symbol, tenant?.gstin, tenant?.tax_percent, tenant?.invoice_prefix, tenant?.invoice_next_number, tenant?.invoice_header_note, tenant?.invoice_footer_note, tenant?.invoice_page_size, tenant?.feature_config]);

  function toggleProd(col) {
    setProdToggles((prev) => ({ ...prev, [col]: !prev[col] }));
  }
  function toggleInv(col) {
    setInvToggles((prev) => ({ ...prev, [col]: !prev[col] }));
  }
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleLogoFile(e) {
    const file = e.target?.files?.[0];
    if (!file || !token) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo must be 2MB or smaller', 'error');
      return;
    }
    setLogoUploading(true);
    setError('');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await api.post(token, '/api/me/logo', { logo: dataUrl });
      if (res.tenant) {
        await refetchMe();
        showToast('Logo updated', 'success');
      }
    } catch (err) {
      setError(err.message || 'Failed to upload logo');
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  }

  async function handleRemoveLogo() {
    if (!token) return;
    setLogoUploading(true);
    setError('');
    try {
      await api.post(token, '/api/me/logo', { remove: true });
      await refetchMe();
      showToast('Logo removed', 'success');
    } catch (err) {
      setError(err.message || 'Failed to remove logo');
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const tax = parseFloat(taxPercent, 10);
      if (Number.isNaN(tax) || tax < 0 || tax > 100) {
        setError('Tax % must be between 0 and 100');
        return;
      }
      const nextNum = parseInt(invoiceNextNumber, 10);
      if (Number.isNaN(nextNum) || nextNum < 1) {
        setError('Next invoice number must be at least 1');
        return;
      }
      await api.patch(token, '/api/me', {
        name: (name ?? '').trim(),
        address: (address ?? '').trim() || undefined,
        phone: (phone ?? '').trim() || undefined,
        currency: (currency ?? '').trim() || 'INR',
        currency_symbol: (currencySymbol ?? '').trim() || undefined,
        gstin: (gstin ?? '').trim() || undefined,
        tax_percent: tax,
        invoice_prefix: (invoicePrefix ?? 'INV-').trim().slice(0, 20) || 'INV-',
        invoice_next_number: nextNum,
        invoice_header_note: (invoiceHeaderNote ?? '').trim().slice(0, 2000) || undefined,
        invoice_footer_note: (invoiceFooterNote ?? '').trim().slice(0, 2000) || undefined,
        invoice_page_size: (invoicePageSize === 'Letter' ? 'Letter' : 'A4'),
        feature_config: {
          productForm: prodToggles,
          invoiceLineItems: invToggles,
          invoiceProductSearch: {
            method: searchMethod,
          },
          customerSupplierSearch: {
            method: customerSupplierSearchMethod,
          },
          defaultTrackingType,
        },
      });
      await refetchMe();
      showToast('Settings updated', 'success');
    } catch (e) {
      setError(e.message || 'Failed to update');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Settings</h1>
      <p className="page__subtitle">Update your shop details.</p>
      {error && <div className="page__error">{error}</div>}
      <section className="card page__section">
        <h2 className="card__heading">Shop name</h2>
        <form onSubmit={handleSubmit}>
          <label className="form__label">
            <span>Name</span>
            <input
              className="form__input"
              value={name ?? ''}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kiran Store"
              required
              maxLength={500}
            />
          </label>
          <label className="form__label">
            <span>Shop address</span>
            <textarea
              className="form__input"
              rows={2}
              value={address ?? ''}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Shop No. 5, Main Road, Pune 411001"
              maxLength={500}
            />
          </label>
          <label className="form__label">
            <span>Phone number</span>
            <input
              className="form__input"
              value={phone ?? ''}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              maxLength={20}
            />
          </label>
          {tenant?.slug && (
            <p className="page__muted" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
              Slug: <code>{tenant.slug}</code> (read-only)
            </p>
          )}
          <h3 className="card__subheading" style={{ marginTop: '1.5rem' }}>Inventory tracking</h3>
          <p className="page__muted" style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            Default tracking type for new products. Can be overridden per product.
          </p>
          <label className="form__label">
            <span>Default tracking type</span>
            <select className="form__input" value={defaultTrackingType} onChange={(e) => setDefaultTrackingType(e.target.value)}>
              <option value="quantity">Quantity — simple count (grocery, hardware, clothing)</option>
              <option value="serial">Serial / IMEI — each unit tracked individually (mobiles, electronics)</option>
              <option value="batch">Batch / Expiry — lot tracking with expiry dates (medical, perishables)</option>
            </select>
          </label>

          <h3 className="card__subheading" style={{ marginTop: '1.5rem' }}>Product form fields</h3>
          <p className="page__muted" style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            Choose which fields to show when creating / editing a product. Name and Price are always shown.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {productColumns.length === 0 && (
              <p className="page__muted" style={{ fontSize: '0.875rem' }}>Loading columns…</p>
            )}
            {productColumns.map((col) => (
              <label key={col} className="settings-toggle">
                <input type="checkbox" checked={!!prodToggles[col]} onChange={() => toggleProd(col)} />
                <span>{columnLabel(col)}</span>
              </label>
            ))}
          </div>

          <h3 className="card__subheading" style={{ marginTop: '1.5rem' }}>Invoice line item columns</h3>
          <p className="page__muted" style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            Choose which extra columns to display on invoice line items (create, edit, and print). Description, Qty, Unit price, and Amount are always shown.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {invoiceItemColumns.length === 0 && (
              <p className="page__muted" style={{ fontSize: '0.875rem' }}>Loading columns…</p>
            )}
            {invoiceItemColumns.map((col) => (
              <label key={col} className="settings-toggle">
                <input type="checkbox" checked={!!invToggles[col]} onChange={() => toggleInv(col)} />
                <span>{columnLabel(col)}</span>
              </label>
            ))}
          </div>

          <h3 className="card__subheading" style={{ marginTop: '1.5rem' }}>Invoice product search</h3>
          <p className="page__muted" style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            How products are selected when adding line items on an invoice.
          </p>
          <label className="form__label">
            <span>Search method</span>
            <select
              className="form__input"
              value={searchMethod}
              onChange={(e) => setSearchMethod(e.target.value)}
            >
              <option value="dropdown">Dropdown (load all products, pick from list)</option>
              <option value="typeahead">Search-as-you-type (type to search, smaller results)</option>
            </select>
          </label>

          <h3 className="card__subheading" style={{ marginTop: '1.5rem' }}>Customer &amp; supplier search</h3>
          <p className="page__muted" style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            How customer (invoice) and supplier (purchase bill) are selected.
          </p>
          <label className="form__label">
            <span>Search method</span>
            <select
              className="form__input"
              value={customerSupplierSearchMethod}
              onChange={(e) => setCustomerSupplierSearchMethod(e.target.value)}
            >
              <option value="dropdown">Dropdown (pick from full list)</option>
              <option value="typeahead">Search by name (type to search)</option>
            </select>
          </label>

          <h3 className="card__subheading" style={{ marginTop: '1.5rem' }}>Currency &amp; tax</h3>
          <div className="form form--grid">
            <label className="form__label">
              <span>Currency code</span>
            <input
              className="form__input"
              value={currency ?? ''}
              onChange={(e) => setCurrency(e.target.value)}
                placeholder="e.g. INR, USD"
                maxLength={10}
              />
            </label>
            <label className="form__label">
              <span>Currency symbol</span>
            <input
              className="form__input"
              value={currencySymbol ?? ''}
              onChange={(e) => setCurrencySymbol(e.target.value)}
                placeholder="e.g. ₹, $"
                maxLength={10}
              />
            </label>
            <label className="form__label">
              <span>GSTIN (India)</span>
            <input
              className="form__input"
              value={gstin ?? ''}
              onChange={(e) => setGstin(e.target.value)}
                placeholder="e.g. 27AABCU9603R1ZM"
                maxLength={20}
              />
            </label>
            <label className="form__label">
              <span>Tax %</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="form__input"
                value={taxPercent ?? '0'}
                onChange={(e) => setTaxPercent(e.target.value)}
              />
            </label>
          </div>
          <h3 className="card__subheading" style={{ marginTop: '1.5rem' }}>Invoice numbering</h3>
          <div className="form form--grid">
            <label className="form__label">
              <span>Invoice prefix</span>
              <input
                className="form__input"
                value={invoicePrefix ?? ''}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                placeholder="e.g. INV-, 2025-INV-"
                maxLength={20}
              />
            </label>
            <label className="form__label">
              <span>Next invoice number</span>
              <input
                type="number"
                min="1"
                className="form__input"
                value={invoiceNextNumber ?? '1'}
                onChange={(e) => setInvoiceNextNumber(e.target.value)}
              />
            </label>
          </div>
          <p className="page__muted" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
            Next invoice will be: <strong>{(invoicePrefix ?? 'INV-').trim() || 'INV-'}{String(parseInt(invoiceNextNumber, 10) || 1).padStart(4, '0')}</strong>
          </p>
          <h3 className="card__subheading" style={{ marginTop: '1.5rem' }}>Invoice branding</h3>
          <div className="form form--grid">
            <label className="form__label form__label--full">
              <span>Header note (on invoice, above Bill to)</span>
              <textarea
                className="form__input"
                rows={2}
                value={invoiceHeaderNote ?? ''}
                onChange={(e) => setInvoiceHeaderNote(e.target.value)}
                placeholder="Optional text or short message"
                maxLength={2000}
              />
            </label>
            <label className="form__label form__label--full">
              <span>Footer note (below thank-you)</span>
              <textarea
                className="form__input"
                rows={2}
                value={invoiceFooterNote ?? ''}
                onChange={(e) => setInvoiceFooterNote(e.target.value)}
                placeholder="Optional terms or note"
                maxLength={2000}
              />
            </label>
            <label className="form__label">
              <span>Invoice page size</span>
              <select
                className="form__input"
                value={invoicePageSize ?? 'A4'}
                onChange={(e) => setInvoicePageSize(e.target.value)}
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </label>
          </div>
          <div className="form__label form__label--full" style={{ marginTop: '1rem' }}>
            <span>Logo (shown on invoice)</span>
            {tenant?.logo_url ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                <img src={tenant.logo_url} alt="Logo" style={{ maxHeight: 48, maxWidth: 120, objectFit: 'contain' }} />
                <div>
                  <label className="btn btn--secondary btn--sm" style={{ marginRight: '0.5rem' }}>
                    Change
                    <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={handleLogoFile} />
                  </label>
                  <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={handleRemoveLogo} disabled={logoUploading}>
                    Remove logo
                  </button>
                </div>
              </div>
            ) : (
              <label className="btn btn--secondary btn--sm" style={{ marginTop: '0.5rem' }}>
                Upload logo (PNG, JPEG, GIF, WebP, max 2MB)
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={handleLogoFile} />
              </label>
            )}
            {logoUploading && <span className="page__muted" style={{ marginLeft: '0.5rem' }}>Uploading…</span>}
          </div>
          <div className="form__actions" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
