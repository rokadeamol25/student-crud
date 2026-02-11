import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { columnLabel, PRODUCT_LIST_CORE_COLUMNS } from '../config/businessTypes';
import * as api from '../api/client';
import DualListSelect from '../components/DualListSelect';

// Default suggested options when none saved (7–8 brands, main mobile colors)
const DEFAULT_COMPANY_OPTIONS = 'Samsung\nApple\nXiaomi\nOnePlus\nOppo\nVivo\nRealme\nMotorola';
const DEFAULT_COLOR_OPTIONS = 'Black\nWhite\nBlue\nRed\nGreen\nGold\nGrey\nPurple';

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
  const [productListToggles, setProductListToggles] = useState(() => cleanToggles(fc?.productListColumns));
  const [searchMethod, setSearchMethod] = useState(fc?.invoiceProductSearch?.method ?? 'dropdown');
  const [customerSupplierSearchMethod, setCustomerSupplierSearchMethod] = useState(fc?.customerSupplierSearch?.method ?? 'dropdown');
  const [defaultTrackingType, setDefaultTrackingType] = useState(fc?.defaultTrackingType ?? 'quantity');
  const [showRoughBillRef, setShowRoughBillRef] = useState(!!fc?.showRoughBillRef);
  const [companyOptionsText, setCompanyOptionsText] = useState(Array.isArray(fc?.companyOptions) ? fc.companyOptions.filter(Boolean).join('\n') : '');
  const [colorOptionsText, setColorOptionsText] = useState(Array.isArray(fc?.colorOptions) ? fc.colorOptions.filter(Boolean).join('\n') : '');
  const [productTypeOptionsText, setProductTypeOptionsText] = useState(Array.isArray(fc?.productTypeOptions) ? fc.productTypeOptions.filter(Boolean).join('\n') : '');
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
    const listCols = cleanToggles(tfc?.productListColumns);
    if (tfc?.productListColumns != null && typeof tfc.productListColumns === 'object' && Object.keys(listCols).length > 0) {
      setProductListToggles(listCols);
    } else {
      const coreDefaults = PRODUCT_LIST_CORE_COLUMNS.reduce((o, { id }) => ({ ...o, [id]: true }), {});
      const extraDefaults = (productColumns || []).reduce((o, col) => ({ ...o, [col]: tfc?.productForm?.[col] ?? true }), {});
      setProductListToggles({ ...coreDefaults, ...extraDefaults });
    }
    setSearchMethod(tfc?.invoiceProductSearch?.method ?? 'dropdown');
    setCustomerSupplierSearchMethod(tfc?.customerSupplierSearch?.method ?? 'dropdown');
    setDefaultTrackingType(tfc?.defaultTrackingType ?? 'quantity');
    setShowRoughBillRef(!!tfc?.showRoughBillRef);
    setCompanyOptionsText(Array.isArray(tfc?.companyOptions) ? tfc.companyOptions.filter(Boolean).join('\n') : '');
    setColorOptionsText(Array.isArray(tfc?.colorOptions) ? tfc.colorOptions.filter(Boolean).join('\n') : '');
    setProductTypeOptionsText(Array.isArray(tfc?.productTypeOptions) ? tfc.productTypeOptions.filter(Boolean).join('\n') : '');
  }, [tenant?.name, tenant?.address, tenant?.phone, tenant?.currency, tenant?.currency_symbol, tenant?.gstin, tenant?.tax_percent, tenant?.invoice_prefix, tenant?.invoice_next_number, tenant?.invoice_header_note, tenant?.invoice_footer_note, tenant?.invoice_page_size, tenant?.feature_config, productColumns]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({ taxPercent: '', invoiceNextNumber: '', productListColumns: '' });
  const [activeTab, setActiveTab] = useState('shop');

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

  function clearFieldError(field) {
    setFieldErrors((prev) => ({ ...prev, [field]: '' }));
  }

  function handleResetToDefaults(e) {
    e.preventDefault();
    const prodDefault = productColumns.length ? productColumns.reduce((o, col) => ({ ...o, [col]: true }), {}) : {};
    const invDefault = invoiceItemColumns.length ? invoiceItemColumns.reduce((o, col) => ({ ...o, [col]: true }), {}) : {};
    const listCore = PRODUCT_LIST_CORE_COLUMNS.reduce((o, { id }) => ({ ...o, [id]: true }), {});
    const listExtra = productColumns.reduce((o, col) => ({ ...o, [col]: true }), {});
    setProdToggles(prodDefault);
    setInvToggles(invDefault);
    setProductListToggles({ ...listCore, ...listExtra });
    showToast('Settings reset to defaults. Click Save to apply.', 'success');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setFieldErrors({ taxPercent: '', invoiceNextNumber: '', productListColumns: '' });
    setSubmitting(true);
    try {
      const tax = parseFloat(taxPercent, 10);
      if (Number.isNaN(tax) || tax < 0 || tax > 100) {
        setFieldErrors((prev) => ({ ...prev, taxPercent: 'Must be between 0 and 100' }));
        setSubmitting(false);
        return;
      }
      const nextNum = parseInt(invoiceNextNumber, 10);
      if (Number.isNaN(nextNum) || nextNum < 1) {
        setFieldErrors((prev) => ({ ...prev, invoiceNextNumber: 'Must be at least 1' }));
        setSubmitting(false);
        return;
      }
      const listColsOn = Object.keys(productListToggles).filter((k) => productListToggles[k]);
      if (listColsOn.length === 0) {
        setFieldErrors((prev) => ({ ...prev, productListColumns: 'Select at least one column' }));
        setSubmitting(false);
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
          productListColumns: productListToggles,
          invoiceLineItems: invToggles,
          invoiceProductSearch: {
            method: searchMethod,
          },
          customerSupplierSearch: {
            method: customerSupplierSearchMethod,
          },
          defaultTrackingType,
          showRoughBillRef: showRoughBillRef,
          companyOptions: (companyOptionsText || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
          colorOptions: (colorOptionsText || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
          productTypeOptions: (productTypeOptionsText || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
        },
      });
      await refetchMe();
      showToast('Settings updated', 'success');
      setLastSavedAt(new Date());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e.message || 'Failed to update');
    } finally {
      setSubmitting(false);
    }
  }

  const settingsTabs = [
    { id: 'shop', label: 'Shop' },
    { id: 'products-invoices', label: 'Products & invoices' },
    { id: 'invoicing', label: 'Invoicing' },
    { id: 'branding', label: 'Branding' },
    { id: 'reset', label: 'Reset to defaults' },
  ];

  return (
    <div className="page">
      <h1 className="page__title">Settings</h1>
      <p className="page__subtitle">Update your shop details.</p>
      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {settingsTabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`settings-panel-${id}`}
            id={`settings-tab-${id}`}
            className={`settings-tabs__tab ${activeTab === id ? 'settings-tabs__tab--active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <div className="page__error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form__actions form__actions--top settings-form-actions">
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
          {lastSavedAt && !submitting && (
            <span className="muted-sm ml-sm" role="status">
              Saved at {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {activeTab === 'shop' && (
        <section id="settings-panel-shop" className="card page__section" role="tabpanel" aria-labelledby="settings-tab-shop">
          <h2 className="card__heading">Shop &amp; inventory</h2>
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
          <label className="form__label form__label--optional">
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
          <label className="form__label form__label--optional">
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
            <p className="muted-sm section-spacer--sm">
              Slug: <code>{tenant.slug}</code> (read-only)
            </p>
          )}
          <h3 className="card__subheading">Inventory tracking</h3>
          <p className="section-intro">
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
        </section>
        )}

        {activeTab === 'products-invoices' && (
        <section id="settings-panel-products-invoices" className="card page__section" role="tabpanel" aria-labelledby="settings-tab-products-invoices">
          <h2 className="card__heading">Product &amp; invoice settings</h2>
          <h3 className="card__subheading">Product form fields</h3>
          <p className="section-intro">
            Choose which fields to show when creating / editing a product. Name and Price are always shown. Select from the left and move to the right.
          </p>
          <DualListSelect
            options={productColumns.map((col) => ({ id: col, label: columnLabel(col) }))}
            value={prodToggles}
            onChange={setProdToggles}
            leftTitle="Available"
            rightTitle="Shown on product form"
            leftEmptyMessage="None left"
            rightEmptyMessage="None selected"
            disabled={productColumns.length === 0}
          />

          <h3 className="card__subheading">Product list columns</h3>
          <p className="section-intro">
            Choose which columns to show in the Products table. At least one column is required. Select from the left and move to the right.
          </p>
          <DualListSelect
            options={[
              ...PRODUCT_LIST_CORE_COLUMNS.map(({ id, label }) => ({ id, label })),
              ...productColumns.map((col) => ({ id: col, label: columnLabel(col) })),
            ]}
            value={productListToggles}
            onChange={(next) => {
              setProductListToggles(next);
              clearFieldError('productListColumns');
            }}
            leftTitle="Available"
            rightTitle="Shown in Products table"
            leftEmptyMessage="None left"
            rightEmptyMessage="None selected"
          />
          {fieldErrors.productListColumns && <div id="settings-product-list-columns-error" className="form__error-inline" role="alert">{fieldErrors.productListColumns}</div>}

          <h3 className="card__subheading">Invoice line item columns</h3>
          <p className="section-intro">
            Choose which extra columns to display on invoice line items (create, edit, and print). Description, Qty, Unit price, and Amount are always shown. Select from the left and move to the right.
          </p>
          <DualListSelect
            options={invoiceItemColumns.map((col) => ({ id: col, label: columnLabel(col) }))}
            value={invToggles}
            onChange={setInvToggles}
            leftTitle="Available"
            rightTitle="Shown on invoice line items"
            leftEmptyMessage="None left"
            rightEmptyMessage="None selected"
            disabled={invoiceItemColumns.length === 0}
          />

          <h3 className="card__subheading">Invoice product search</h3>
          <p className="section-intro">
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

          <h3 className="card__subheading">Customer &amp; supplier search</h3>
          <p className="section-intro">
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

          <h3 className="card__subheading">Rough bill reference</h3>
          <p className="section-intro">
            When enabled, you can enter an optional rough bill / estimate reference on invoices. Internal use only — never shown on print or PDF.
          </p>
          <label className="settings-toggle">
            <input type="checkbox" checked={!!showRoughBillRef} onChange={(e) => setShowRoughBillRef(e.target.checked)} />
            <span>Show rough bill reference field on invoices</span>
          </label>

          <h3 className="card__subheading">Company / brand, color &amp; product type (picklists)</h3>
          <p className="section-intro">
            Optional lists used as dropdown options when creating products. One option per line or comma-separated. Enable &quot;Product Type&quot; in Product form fields above to use product types.
          </p>
          <div className="form form--grid">
            <label className="form__label">
              <span>Company / brand options</span>
              <textarea
                className="form__input"
                rows={3}
                placeholder="e.g. Samsung, Apple, Xiaomi"
                value={companyOptionsText}
                onChange={(e) => setCompanyOptionsText(e.target.value)}
              />
            </label>
            <label className="form__label">
              <span>Color options</span>
              <textarea
                className="form__input"
                rows={3}
                placeholder="e.g. Black, White, Blue"
                value={colorOptionsText}
                onChange={(e) => setColorOptionsText(e.target.value)}
              />
            </label>
            <label className="form__label">
              <span>Product type options</span>
              <textarea
                className="form__input"
                rows={3}
                placeholder="e.g. Mobile, Accessory, SIM, Repair"
                value={productTypeOptionsText}
                onChange={(e) => setProductTypeOptionsText(e.target.value)}
              />
            </label>
          </div>
        </section>
        )}

        {activeTab === 'invoicing' && (
        <section id="settings-panel-invoicing" className="card page__section" role="tabpanel" aria-labelledby="settings-tab-invoicing">
          <h2 className="card__heading">Currency &amp; numbering</h2>
          <h3 className="card__subheading">Currency &amp; tax</h3>
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
            <label className="form__label form__label--optional">
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
                id="settings-tax-percent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="form__input form__input--number"
                value={taxPercent ?? '0'}
                onChange={(e) => { setTaxPercent(e.target.value); clearFieldError('taxPercent'); }}
                aria-invalid={!!fieldErrors.taxPercent}
                aria-describedby={fieldErrors.taxPercent ? 'settings-tax-percent-error' : undefined}
              />
              {fieldErrors.taxPercent && <div id="settings-tax-percent-error" className="form__error-inline" role="alert">{fieldErrors.taxPercent}</div>}
            </label>
          </div>
          <h3 className="card__subheading">Invoice numbering</h3>
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
                id="settings-invoice-next-number"
                type="number"
                min="1"
                step="1"
                className="form__input form__input--number"
                value={invoiceNextNumber ?? '1'}
                onChange={(e) => { setInvoiceNextNumber(e.target.value); clearFieldError('invoiceNextNumber'); }}
                aria-invalid={!!fieldErrors.invoiceNextNumber}
                aria-describedby={fieldErrors.invoiceNextNumber ? 'settings-invoice-next-number-error' : undefined}
              />
              {fieldErrors.invoiceNextNumber && <div id="settings-invoice-next-number-error" className="form__error-inline" role="alert">{fieldErrors.invoiceNextNumber}</div>}
            </label>
          </div>
          <p className="muted-sm section-spacer--sm">
            Next invoice will be: <strong>{(invoicePrefix ?? 'INV-').trim() || 'INV-'}{String(parseInt(invoiceNextNumber, 10) || 1).padStart(4, '0')}</strong>
          </p>
        </section>
        )}

        {activeTab === 'branding' && (
        <section id="settings-panel-branding" className="card page__section" role="tabpanel" aria-labelledby="settings-tab-branding">
          <h2 className="card__heading">Invoice branding</h2>
          <div className="form form--grid">
            <label className="form__label form__label--full form__label--optional">
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
            <label className="form__label form__label--full form__label--optional">
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
          <div className="form__label form__label--full form__label--optional section-spacer">
            <span>Logo (shown on invoice)</span>
            {tenant?.logo_url ? (
              <div className="form-row section-spacer--sm">
                <img src={tenant.logo_url} alt="Logo" className="logo-preview" />
                <div className="form-row">
                  <label className="btn btn--secondary btn--sm">
                    Change
                    <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={handleLogoFile} />
                  </label>
                  <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={handleRemoveLogo} disabled={logoUploading}>
                    Remove logo
                  </button>
                </div>
              </div>
            ) : (
              <label className="btn btn--secondary btn--sm section-spacer--sm d-inline-block">
                Upload logo (PNG, JPEG, GIF, WebP, max 2MB)
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={handleLogoFile} />
              </label>
            )}
            {logoUploading && <span className="muted-sm ml-sm">Uploading…</span>}
          </div>
          <p className="muted-sm section-spacer--sm">All settings are saved together when you click Save above.</p>
        </section>
        )}

        {activeTab === 'reset' && (
        <section id="settings-panel-reset" className="card page__section settings-reset" role="tabpanel" aria-labelledby="settings-tab-reset">
          <h2 className="card__heading settings-reset__heading">Reset to defaults</h2>
          <p className="section-intro">
            Reset product form fields, product list columns, and invoice line item columns to show all options. You must click Save above to apply.
          </p>
          <button type="button" className="btn btn--ghost btn--danger" onClick={handleResetToDefaults}>
            Reset product &amp; invoice settings to defaults
          </button>
        </section>
        )}
      </form>
    </div>
  );
}
