import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { columnLabel, PRODUCT_LIST_CORE_COLUMNS, NAV_ORDER_DEFAULT, NAV_MODULE_LABELS, BUSINESS_TYPE_OPTIONS } from '../config/businessTypes';
import * as api from '../api/client';
import DualListSelect from '../components/DualListSelect';
import { supabase } from '../lib/supabase';

// Default suggested options when none saved (7–8 brands, main mobile colors)
const DEFAULT_COMPANY_OPTIONS = 'Samsung\nApple\nXiaomi\nOnePlus\nOppo\nVivo\nRealme\nMotorola';
const DEFAULT_COLOR_OPTIONS = 'Black\nWhite\nBlue\nRed\nGreen\nGold\nGrey\nPurple';

export default function Settings() {
  const { token, tenant, user, refetchMe } = useAuth();
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

  const defaultModules = { invoices: true, purchaseBills: true, suppliers: true, customers: true, products: true, reports: true, dashboard: true };
  const [modules, setModules] = useState(() => ({ ...defaultModules, ...(fc?.modules && typeof fc.modules === 'object' ? fc.modules : {}) }));
  const [appTitle, setAppTitle] = useState((fc?.appTitle ?? '').toString().trim());
  const [defaultDueDays, setDefaultDueDays] = useState(fc?.defaultDueDays != null ? String(fc.defaultDueDays) : '0');
  const [invoiceTitleLabel, setInvoiceTitleLabel] = useState((fc?.invoiceTitleLabel ?? 'Invoice').toString().trim() || 'Invoice');
  const [stockPolicy, setStockPolicy] = useState((fc?.stockPolicy ?? 'warn').toString());
  const [primaryColor, setPrimaryColor] = useState((fc?.primaryColor ?? '').toString().trim());
  const [faviconUrl, setFaviconUrl] = useState((fc?.faviconUrl ?? '').toString().trim());
  const [defaultDiscountType, setDefaultDiscountType] = useState((fc?.defaultDiscountType ?? 'none').toString());
  const [defaultDiscountValue, setDefaultDiscountValue] = useState(fc?.defaultDiscountValue != null ? String(fc.defaultDiscountValue) : '0');
  const [defaultUnit, setDefaultUnit] = useState((fc?.defaultUnit ?? 'pcs').toString().trim() || 'pcs');
  const [purchaseBillDefaultDueDays, setPurchaseBillDefaultDueDays] = useState(fc?.purchaseBillDefaultDueDays != null ? String(fc.purchaseBillDefaultDueDays) : '0');
  const defaultReportToggles = { pnl: true, stock: true };
  const [reportToggles, setReportToggles] = useState(() => ({ ...defaultReportToggles, ...(fc?.reportToggles && typeof fc.reportToggles === 'object' ? fc.reportToggles : {}) }));
  const [defaultReportPeriod, setDefaultReportPeriod] = useState((fc?.defaultReportPeriod ?? 'this_month').toString());
  const [navOrder, setNavOrder] = useState(() => (Array.isArray(fc?.navOrder) && fc.navOrder.length) ? [...fc.navOrder] : [...NAV_ORDER_DEFAULT]);
  const [homeTarget, setHomeTarget] = useState((fc?.homeTarget === 'invoices' ? 'invoices' : 'dashboard').toString());
  const [timezone, setTimezone] = useState((fc?.timezone ?? '').toString().trim());
  const [legalName, setLegalName] = useState((fc?.legalName ?? '').toString().trim());
  const [businessType, setBusinessType] = useState((tenant?.business_type ?? '').toString().trim());
  const [settingsSearch, setSettingsSearch] = useState('');
  const [tipsDismissed, setTipsDismissed] = useState(() => typeof localStorage !== 'undefined' && localStorage.getItem('settings-tips-dismissed') === 'true');

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
    setModules({ ...defaultModules, ...(tfc?.modules && typeof tfc.modules === 'object' ? tfc.modules : {}) });
    setAppTitle((tfc?.appTitle ?? '').toString().trim());
    setDefaultDueDays(tfc?.defaultDueDays != null ? String(tfc.defaultDueDays) : '0');
    setInvoiceTitleLabel((tfc?.invoiceTitleLabel ?? 'Invoice').toString().trim() || 'Invoice');
    setStockPolicy((tfc?.stockPolicy ?? 'warn').toString());
    setPrimaryColor((tfc?.primaryColor ?? '').toString().trim());
    setFaviconUrl((tfc?.faviconUrl ?? '').toString().trim());
    setDefaultDiscountType((tfc?.defaultDiscountType ?? 'none').toString());
    setDefaultDiscountValue(tfc?.defaultDiscountValue != null ? String(tfc.defaultDiscountValue) : '0');
    setDefaultUnit((tfc?.defaultUnit ?? 'pcs').toString().trim() || 'pcs');
    setPurchaseBillDefaultDueDays(tfc?.purchaseBillDefaultDueDays != null ? String(tfc.purchaseBillDefaultDueDays) : '0');
    setReportToggles({ ...defaultReportToggles, ...(tfc?.reportToggles && typeof tfc.reportToggles === 'object' ? tfc.reportToggles : {}) });
    setDefaultReportPeriod((tfc?.defaultReportPeriod ?? 'this_month').toString());
    const order = Array.isArray(tfc?.navOrder) && tfc.navOrder.length ? tfc.navOrder : NAV_ORDER_DEFAULT;
    setNavOrder([...order]);
    setHomeTarget(tfc?.homeTarget === 'invoices' ? 'invoices' : 'dashboard');
    setTimezone((tfc?.timezone ?? '').toString().trim());
    setLegalName((tfc?.legalName ?? '').toString().trim());
    setBusinessType((tenant?.business_type ?? '').toString().trim());
  }, [tenant?.name, tenant?.address, tenant?.business_type, tenant?.phone, tenant?.currency, tenant?.currency_symbol, tenant?.gstin, tenant?.tax_percent, tenant?.invoice_prefix, tenant?.invoice_next_number, tenant?.invoice_header_note, tenant?.invoice_footer_note, tenant?.invoice_page_size, tenant?.feature_config, productColumns]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({ taxPercent: '', invoiceNextNumber: '', productListColumns: '' });
  const [activeTab, setActiveTab] = useState('shop');

  useEffect(() => {
    if (activeTab === 'data-danger' && token) {
      setAuditLoading(true);
      api.get(token, '/api/me/audit?limit=10')
        .then((res) => setAuditEntries(res.entries || []))
        .catch(() => setAuditEntries([]))
        .finally(() => setAuditLoading(false));
    }
  }, [activeTab, token]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [resetNumberingConfirm, setResetNumberingConfirm] = useState(false);
  const [deleteDataConfirm, setDeleteDataConfirm] = useState(false);
  const [dangerLoading, setDangerLoading] = useState(false);
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  function setModule(key, value) {
    setModules((prev) => ({ ...prev, [key]: !!value }));
  }

  const isDirty = useMemo(() => {
    if (!tenant) return false;
    const t = tenant;
    const tfc = t.feature_config ?? {};
    if ((name ?? '') !== (t.name ?? '') || (address ?? '') !== (t.address ?? '') || (phone ?? '') !== (t.phone ?? '')) return true;
    if ((currency ?? '') !== (t.currency ?? 'INR') || (currencySymbol ?? '') !== (t.currency_symbol ?? '')) return true;
    if ((gstin ?? '') !== (t.gstin ?? '') || taxPercent !== String(t.tax_percent ?? '0')) return true;
    if ((invoicePrefix ?? '') !== (t.invoice_prefix ?? 'INV-') || invoiceNextNumber !== String(t.invoice_next_number ?? '1')) return true;
    if ((invoiceHeaderNote ?? '') !== (t.invoice_header_note ?? '') || (invoiceFooterNote ?? '') !== (t.invoice_footer_note ?? '')) return true;
    if ((invoicePageSize ?? 'A4') !== (t.invoice_page_size ?? 'A4')) return true;
    if ((appTitle ?? '').trim() !== (tfc.appTitle ?? '').toString().trim()) return true;
    if (String(defaultDueDays) !== String(tfc.defaultDueDays ?? 0)) return true;
    if ((invoiceTitleLabel ?? 'Invoice').trim() !== (tfc.invoiceTitleLabel ?? 'Invoice').toString().trim()) return true;
    if (stockPolicy !== (tfc.stockPolicy ?? 'warn')) return true;
    if ((primaryColor ?? '').trim() !== (tfc.primaryColor ?? '').toString().trim()) return true;
    if ((faviconUrl ?? '').trim() !== (tfc.faviconUrl ?? '').toString().trim()) return true;
    if ((defaultDiscountType ?? 'none') !== (tfc.defaultDiscountType ?? 'none')) return true;
    if (String(defaultDiscountValue) !== String(tfc.defaultDiscountValue ?? 0)) return true;
    if ((defaultUnit ?? 'pcs').trim() !== (tfc.defaultUnit ?? 'pcs').toString().trim()) return true;
    if (String(purchaseBillDefaultDueDays) !== String(tfc.purchaseBillDefaultDueDays ?? 0)) return true;
    const trep = tfc.reportToggles ?? {};
    if (!!reportToggles.pnl !== !!trep.pnl || !!reportToggles.stock !== !!trep.stock) return true;
    if ((defaultReportPeriod ?? 'this_month') !== (tfc.defaultReportPeriod ?? 'this_month')) return true;
    const savedOrder = Array.isArray(tfc.navOrder) ? tfc.navOrder : NAV_ORDER_DEFAULT;
    if (navOrder.length !== savedOrder.length || navOrder.some((id, i) => id !== savedOrder[i])) return true;
    if ((homeTarget ?? 'dashboard') !== (tfc.homeTarget ?? 'dashboard')) return true;
    if ((timezone ?? '').trim() !== (tfc.timezone ?? '').toString().trim()) return true;
    if ((legalName ?? '').trim() !== (tfc.legalName ?? '').toString().trim()) return true;
    if ((businessType ?? '').trim() !== (tenant?.business_type ?? '').toString().trim()) return true;
    const tmod = tfc.modules ?? {};
    for (const k of Object.keys(modules)) {
      if (!!modules[k] !== !!tmod[k]) return true;
    }
    return false;
  }, [tenant, name, address, phone, currency, currencySymbol, gstin, taxPercent, invoicePrefix, invoiceNextNumber, invoiceHeaderNote, invoiceFooterNote, invoicePageSize, appTitle, defaultDueDays, invoiceTitleLabel, stockPolicy, primaryColor, faviconUrl, defaultDiscountType, defaultDiscountValue, defaultUnit, purchaseBillDefaultDueDays, reportToggles, defaultReportPeriod, navOrder, homeTarget, timezone, legalName, businessType, modules]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

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
      const dueDaysNum = Math.max(0, Math.min(365, parseInt(defaultDueDays, 10) || 0));
      const invoiceLabel = (invoiceTitleLabel ?? 'Invoice').toString().trim() || 'Invoice';
      const policy = ['allow', 'warn', 'block'].includes(stockPolicy) ? stockPolicy : 'warn';

      await api.patch(token, '/api/me', {
        name: (name ?? '').trim(),
        address: (address ?? '').trim() || undefined,
        phone: (phone ?? '').trim() || undefined,
        business_type: (businessType ?? '').trim() || null,
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
          ...(tenant?.feature_config && typeof tenant.feature_config === 'object' ? tenant.feature_config : {}),
          productForm: prodToggles,
          productListColumns: productListToggles,
          invoiceLineItems: invToggles,
          invoiceProductSearch: { method: searchMethod },
          customerSupplierSearch: { method: customerSupplierSearchMethod },
          defaultTrackingType,
          showRoughBillRef: showRoughBillRef,
          companyOptions: (companyOptionsText || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
          colorOptions: (colorOptionsText || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
          productTypeOptions: (productTypeOptionsText || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
          modules: { ...defaultModules, ...modules },
          appTitle: (appTitle ?? '').trim() || undefined,
          defaultDueDays: dueDaysNum,
          invoiceTitleLabel: invoiceLabel,
          stockPolicy: policy,
          primaryColor: (primaryColor ?? '').trim() || undefined,
          faviconUrl: (faviconUrl ?? '').trim() || undefined,
          defaultDiscountType: (defaultDiscountType === 'percent' || defaultDiscountType === 'flat') ? defaultDiscountType : 'none',
          defaultDiscountValue: Math.max(0, parseFloat(defaultDiscountValue, 10) || 0),
          defaultUnit: (defaultUnit ?? 'pcs').toString().trim() || 'pcs',
          purchaseBillDefaultDueDays: Math.max(0, Math.min(365, parseInt(purchaseBillDefaultDueDays, 10) || 0)),
          reportToggles: { ...defaultReportToggles, ...reportToggles },
          defaultReportPeriod: (defaultReportPeriod ?? 'this_month').toString() || 'this_month',
          navOrder: Array.isArray(navOrder) && navOrder.length ? navOrder : NAV_ORDER_DEFAULT,
          homeTarget: homeTarget === 'invoices' ? 'invoices' : 'dashboard',
          timezone: (timezone ?? '').trim() || undefined,
          legalName: (legalName ?? '').trim() || undefined,
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
    { id: 'features', label: 'Features', keywords: ['preset', 'modules', 'nav', 'home', 'title'] },
    { id: 'shop', label: 'Shop', keywords: ['name', 'address', 'phone', 'timezone', 'legal', 'inventory', 'tracking'] },
    { id: 'products-invoices', label: 'Products & invoices', keywords: ['product', 'invoice', 'columns', 'form', 'discount', 'unit', 'stock'] },
    { id: 'invoicing', label: 'Invoicing', keywords: ['currency', 'tax', 'number', 'due', 'purchase', 'bill'] },
    { id: 'branding', label: 'Branding', keywords: ['logo', 'color', 'favicon', 'header', 'footer'] },
    { id: 'reports', label: 'Reports', keywords: ['report', 'pnl', 'stock', 'period'] },
    { id: 'account', label: 'Account', keywords: ['profile', 'password', 'email', 'session'] },
    { id: 'data-danger', label: 'Data & danger', keywords: ['export', 'reset', 'delete', 'audit', 'danger'] },
  ];

  const settingsSearchLower = (settingsSearch ?? '').toLowerCase().trim();
  const filteredTabs = useMemo(() => {
    if (!settingsSearchLower) return settingsTabs;
    return settingsTabs.filter(
      (t) =>
        t.label.toLowerCase().includes(settingsSearchLower) ||
        (t.keywords && t.keywords.some((k) => k.toLowerCase().includes(settingsSearchLower)))
    );
  }, [settingsSearchLower]);

  function dismissTips() {
    setTipsDismissed(true);
    try {
      localStorage.setItem('settings-tips-dismissed', 'true');
    } catch (_) {}
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPasswordError('');
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match');
      return;
    }
    if (!supabase || !user?.email) return;
    setPasswordSubmitting(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (signInErr) {
        setPasswordError(signInErr.message || 'Current password is incorrect');
        setPasswordSubmitting(false);
        return;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) {
        setPasswordError(updateErr.message || 'Failed to update password');
        setPasswordSubmitting(false);
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password updated', 'success');
    } catch (err) {
      setPasswordError(err.message || 'Failed to update password');
    } finally {
      setPasswordSubmitting(false);
    }
  }

  async function handleExportData() {
    if (!token) return;
    setExportLoading(true);
    try {
      const data = await api.get(token, '/api/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export-${tenant?.name?.replace(/\W/g, '_') || 'data'}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Export downloaded', 'success');
    } catch (e) {
      showToast(e.message || 'Export failed', 'error');
    } finally {
      setExportLoading(false);
    }
  }

  async function handleResetInvoiceNumbering() {
    if (!token || !resetNumberingConfirm) return;
    setDangerLoading(true);
    try {
      await api.post(token, '/api/me/reset-invoice-numbering', { confirm: true });
      await refetchMe();
      setResetNumberingConfirm(false);
      showToast('Invoice numbering reset to 1', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to reset numbering', 'error');
    } finally {
      setDangerLoading(false);
    }
  }

  async function handleDeleteAllData() {
    if (!token || !deleteDataConfirm) return;
    setDangerLoading(true);
    try {
      await api.post(token, '/api/me/delete-data', { confirm: true });
      await refetchMe();
      setDeleteDataConfirm(false);
      showToast('All data deleted', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to delete data', 'error');
    } finally {
      setDangerLoading(false);
    }
  }

  const tabsToShow = filteredTabs.length > 0 ? filteredTabs : settingsTabs;
  const activeTabValid = tabsToShow.some((t) => t.id === activeTab);
  const effectiveTab = activeTabValid ? activeTab : (tabsToShow[0]?.id ?? activeTab);

  useEffect(() => {
    if (settingsSearchLower && filteredTabs.length > 0 && !filteredTabs.some((t) => t.id === activeTab)) {
      setActiveTab(filteredTabs[0].id);
    }
  }, [settingsSearchLower, filteredTabs, activeTab]);

  return (
    <div className="page">
      <h1 className="page__title">Settings</h1>
      <p className="page__subtitle">Update your shop details.</p>

      {!tipsDismissed && (
        <div className="card page__section" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div>
              <h2 className="card__heading" style={{ marginTop: 0 }}>Getting started</h2>
              <ul className="section-intro" style={{ marginBottom: 0, paddingLeft: '1.25rem' }}>
                <li>Use <strong>Features</strong> to show or hide sections (Invoices, Products, Reports, etc.) and set your app title.</li>
                <li>Set default due days and invoice label under <strong>Invoicing</strong>.</li>
                <li>Export your data anytime from <strong>Data &amp; danger</strong>.</li>
              </ul>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={dismissTips} aria-label="Dismiss tips">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <label className="form__label" style={{ marginBottom: '0.5rem', maxWidth: '20rem' }}>
        <span className="sr-only">Search settings</span>
        <input
          type="search"
          className="form__input"
          placeholder="Search settings…"
          value={settingsSearch ?? ''}
          onChange={(e) => setSettingsSearch(e.target.value)}
          aria-label="Search settings sections"
        />
      </label>
      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {tabsToShow.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={effectiveTab === id}
            aria-controls={`settings-panel-${id}`}
            id={`settings-tab-${id}`}
            className={`settings-tabs__tab ${effectiveTab === id ? 'settings-tabs__tab--active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {settingsSearchLower && filteredTabs.length === 0 && (
        <p className="muted-sm" style={{ marginTop: '0.5rem' }}>No matching sections. Try another search.</p>
      )}
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
          {isDirty && !submitting && (
            <span className="muted-sm ml-sm" role="status">You have unsaved changes</span>
          )}
        </div>

        {effectiveTab === 'features' && (
        <section id="settings-panel-features" className="card page__section" role="tabpanel" aria-labelledby="settings-tab-features">
          <h2 className="card__heading">Features &amp; app title</h2>
          <p className="section-intro">
            Control which sections appear in the main navigation. Turn off modules you don’t use. Settings is always visible.
          </p>
          <h3 className="card__subheading">Preset (quick setup)</h3>
          <p className="section-intro">
            Apply a preset to match your business type. This changes product form fields and how products are searched on invoices.
          </p>
          <label className="form__label">
            <span>Preset</span>
            <select className="form__input" value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
              {(BUSINESS_TYPE_OPTIONS || []).map((opt) => (
                <option key={opt.value || 'default'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          {BUSINESS_TYPE_OPTIONS?.find((o) => (o.value || '') === (businessType || ''))?.description && (
            <p className="muted-sm" style={{ marginTop: '0.25rem' }}>{BUSINESS_TYPE_OPTIONS.find((o) => (o.value || '') === (businessType || '')).description}</p>
          )}
          <label className="form__label form__label--optional">
            <span>App title (header)</span>
            <input
              className="form__input"
              value={appTitle ?? ''}
              onChange={(e) => setAppTitle(e.target.value)}
              placeholder="e.g. Kiran Billing (leave blank for &quot;Billing&quot;)"
              maxLength={80}
            />
          </label>
          <h3 className="card__subheading">Home page</h3>
          <p className="section-intro">
            Where the app title in the header links to.
          </p>
          <label className="form__label">
            <span>Clicking the app title goes to</span>
            <select className="form__input" value={homeTarget} onChange={(e) => setHomeTarget(e.target.value)}>
              <option value="dashboard">Dashboard</option>
              <option value="invoices">Invoices list</option>
            </select>
          </label>
          <h3 className="card__subheading">Modules to show in nav</h3>
          <div className="toggle-list">
            {[
              { key: 'dashboard', label: 'Dashboard' },
              { key: 'invoices', label: 'Invoices' },
              { key: 'products', label: 'Products' },
              { key: 'customers', label: 'Customers' },
              { key: 'purchaseBills', label: 'Purchase bills' },
              { key: 'suppliers', label: 'Suppliers' },
              { key: 'reports', label: 'Reports' },
            ].map(({ key, label }) => (
              <label key={key} className="settings-toggle">
                <input type="checkbox" checked={!!modules[key]} onChange={(e) => setModule(key, e.target.checked)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <h3 className="card__subheading">Nav order</h3>
          <p className="section-intro">
            Order of items in the sidebar. Only enabled modules appear.
          </p>
          <ul className="nav-order-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {(navOrder.length ? navOrder : NAV_ORDER_DEFAULT).map((id, idx) => (
              <li key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <button type="button" className="btn btn--ghost btn--sm" aria-label="Move up" disabled={idx === 0} onClick={() => setNavOrder((prev) => { const p = [...(prev.length ? prev : NAV_ORDER_DEFAULT)]; if (idx > 0) { [p[idx - 1], p[idx]] = [p[idx], p[idx - 1]]; } return p; })}>↑</button>
                <button type="button" className="btn btn--ghost btn--sm" aria-label="Move down" disabled={idx === (navOrder.length || NAV_ORDER_DEFAULT.length) - 1} onClick={() => setNavOrder((prev) => { const p = [...(prev.length ? prev : NAV_ORDER_DEFAULT)]; if (idx < p.length - 1) { [p[idx], p[idx + 1]] = [p[idx + 1], p[idx]]; } return p; })}>↓</button>
                <span>{NAV_MODULE_LABELS[id] ?? id}</span>
              </li>
            ))}
          </ul>
        </section>
        )}

        {effectiveTab === 'shop' && (
        <section id="settings-panel-shop" className="card page__section" role="tabpanel" aria-labelledby="settings-tab-shop">
          <h2 className="card__heading">Shop &amp; inventory</h2>
          <p className="section-intro">
            Your shop name, address, and phone appear on invoices. Default tracking type applies to new products.
          </p>
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
            <span>Legal name (on invoices)</span>
            <input
              className="form__input"
              value={legalName ?? ''}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Leave blank to use Name above"
              maxLength={500}
            />
          </label>
          <p className="muted-sm" style={{ marginTop: '-0.25rem', marginBottom: '0.5rem' }}>Use if your legal business name differs from the display name.</p>
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
          <label className="form__label form__label--optional">
            <span>Timezone</span>
            <input
              className="form__input"
              value={timezone ?? ''}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. Asia/Kolkata, America/New_York"
              maxLength={80}
            />
          </label>
          <p className="muted-sm" style={{ marginTop: '-0.25rem', marginBottom: '0.5rem' }}>Used for dates and &quot;today&quot; in the app. Leave blank for browser default.</p>
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

        {effectiveTab === 'products-invoices' && (
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

          <h3 className="card__subheading">Stock policy (invoicing)</h3>
          <p className="section-intro">
            When adding line items to an invoice, what happens if quantity exceeds available stock.
          </p>
          <label className="form__label">
            <span>When quantity &gt; stock</span>
            <select className="form__input" value={stockPolicy} onChange={(e) => setStockPolicy(e.target.value)}>
              <option value="allow">Allow — no warning, can save</option>
              <option value="warn">Warn — show message but allow save</option>
              <option value="block">Block — prevent save until quantity is within stock</option>
            </select>
          </label>

          <h3 className="card__subheading">Defaults for new items</h3>
          <p className="section-intro">
            Default discount and unit applied when adding new invoice lines or products.
          </p>
          <div className="form form--grid">
            <label className="form__label">
              <span>Default discount type (invoice lines)</span>
              <select className="form__input" value={defaultDiscountType} onChange={(e) => setDefaultDiscountType(e.target.value)}>
                <option value="none">None</option>
                <option value="percent">Percent</option>
                <option value="flat">Flat amount</option>
              </select>
            </label>
            <label className="form__label">
              <span>Default discount value</span>
              <input type="number" min={0} step={defaultDiscountType === 'percent' ? 0.01 : 1} className="form__input" value={defaultDiscountValue} onChange={(e) => setDefaultDiscountValue(e.target.value)} placeholder="0" />
            </label>
            <label className="form__label">
              <span>Default unit for new products</span>
              <input type="text" className="form__input" value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value)} placeholder="e.g. pcs, kg" />
            </label>
          </div>

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

        {effectiveTab === 'invoicing' && (
        <section id="settings-panel-invoicing" className="card page__section" role="tabpanel" aria-labelledby="settings-tab-invoicing">
          <h2 className="card__heading">Currency &amp; numbering</h2>
          <p className="section-intro">
            Currency, tax rate, and invoice number sequence. These are used on all new invoices.
          </p>
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
          <h3 className="card__subheading">Invoice defaults</h3>
          <p className="section-intro">
            Default due days and the label shown on the printed invoice (e.g. &quot;Tax Invoice&quot;).
          </p>
          <div className="form form--grid">
            <label className="form__label">
              <span>Default due days</span>
              <input
                type="number"
                min="0"
                max="365"
                step="1"
                className="form__input form__input--number"
                value={defaultDueDays}
                onChange={(e) => setDefaultDueDays(e.target.value)}
              />
            </label>
            <label className="form__label">
              <span>Invoice title label</span>
              <select className="form__input" value={invoiceTitleLabel} onChange={(e) => setInvoiceTitleLabel(e.target.value)}>
                <option value="Invoice">Invoice</option>
                <option value="Tax Invoice">Tax Invoice</option>
                <option value="Bill">Bill</option>
              </select>
            </label>
          </div>
          <h3 className="card__subheading">Purchase bill defaults</h3>
          <p className="section-intro">
            Default due days for purchase bills. Used when the purchase bill form supports a due date.
          </p>
          <label className="form__label">
            <span>Default due days (purchase bills)</span>
            <input type="number" min={0} max={365} step={1} className="form__input form__input--number" value={purchaseBillDefaultDueDays} onChange={(e) => setPurchaseBillDefaultDueDays(e.target.value)} />
          </label>
        </section>
        )}

        {effectiveTab === 'branding' && (
        <section id="settings-panel-branding" className="card page__section" role="tabpanel" aria-labelledby="settings-tab-branding">
          <h2 className="card__heading">App appearance (white-label)</h2>
          <p className="section-intro">
            Primary accent color and favicon for the app. Leave empty to use the default theme.
          </p>
          <div className="form form--grid">
            <label className="form__label form__label--optional">
              <span>Primary color</span>
              <input type="text" className="form__input" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#0d9488" maxLength={20} />
            </label>
            <label className="form__label form__label--optional">
              <span>Favicon URL</span>
              <input type="url" className="form__input" value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)} placeholder="https://…" />
            </label>
          </div>
          <h2 className="card__heading">Invoice branding</h2>
          <p className="section-intro">
            Logo, header and footer notes, and page size for printed and PDF invoices.
          </p>
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

        {effectiveTab === 'reports' && (
        <section id="settings-panel-reports" className="card page__section" role="tabpanel" aria-labelledby="settings-tab-reports">
          <h2 className="card__heading">Reports</h2>
          <p className="section-intro">
            Choose which report links to show on the Reports page and the default time period.
          </p>
          <div className="form form--grid">
            <label className="settings-toggle">
              <input type="checkbox" checked={!!reportToggles.pnl} onChange={(e) => setReportToggles((p) => ({ ...p, pnl: e.target.checked }))} />
              <span>Show P&amp;L Summary link</span>
            </label>
            <label className="settings-toggle">
              <input type="checkbox" checked={!!reportToggles.stock} onChange={(e) => setReportToggles((p) => ({ ...p, stock: e.target.checked }))} />
              <span>Show Stock report link</span>
            </label>
          </div>
          <label className="form__label">
            <span>Default report period</span>
            <select className="form__input" value={defaultReportPeriod} onChange={(e) => setDefaultReportPeriod(e.target.value)}>
              <option value="this_month">This month</option>
              <option value="last_month">Last month</option>
              <option value="this_quarter">This quarter</option>
              <option value="last_quarter">Last quarter</option>
              <option value="this_year">This year</option>
              <option value="last_year">Last year</option>
              <option value="last_7">Last 7 days</option>
              <option value="all">All time</option>
            </select>
          </label>
        </section>
        )}

        {effectiveTab === 'account' && (
        <section id="settings-panel-account" className="card page__section" role="tabpanel" aria-labelledby="settings-tab-account">
          <h2 className="card__heading">Profile</h2>
          <p className="section-intro">
            Your account email. Password and sessions are managed here.
          </p>
          <div className="form form--grid">
            <label className="form__label">
              <span>Email</span>
              <input className="form__input" type="email" value={user?.email ?? ''} readOnly disabled style={{ opacity: 0.9 }} />
            </label>
          </div>
          <h3 className="card__subheading">Change password</h3>
          <div className="form form--grid" style={{ maxWidth: '24rem' }}>
            <label className="form__label">
              <span>Current password</span>
              <input className="form__input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </label>
            <label className="form__label">
              <span>New password</span>
              <input className="form__input" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} />
            </label>
            <label className="form__label">
              <span>Confirm new password</span>
              <input className="form__input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} />
            </label>
            {passwordError && <div className="form__error-inline" role="alert">{passwordError}</div>}
            <button type="button" className="btn btn--primary" disabled={passwordSubmitting} onClick={handleChangePassword}>
              {passwordSubmitting ? 'Updating…' : 'Update password'}
            </button>
          </div>
          <h3 className="card__subheading">Sessions</h3>
          <p className="section-intro muted-sm">
            Changing your password will log you out on all other devices. To sign out from this device, use Log out in the navigation.
          </p>
        </section>
        )}

        {effectiveTab === 'data-danger' && (
        <section id="settings-panel-data-danger" className="card page__section settings-reset" role="tabpanel" aria-labelledby="settings-tab-data-danger">
          <h2 className="card__heading">Recent settings changes</h2>
          <p className="section-intro">
            Last 10 Settings saves and danger-zone actions (reset numbering, delete data).
          </p>
          {auditLoading ? (
            <p className="muted-sm">Loading…</p>
          ) : auditEntries.length === 0 ? (
            <p className="muted-sm">No entries yet.</p>
          ) : (
            <ul className="audit-list" style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.875rem' }}>
              {auditEntries.map((entry) => (
                <li key={entry.id} style={{ marginBottom: '0.25rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span className="badge badge--draft" style={{ textTransform: 'capitalize' }}>{entry.action.replace(/_/g, ' ')}</span>
                  <span className="muted-sm">{new Date(entry.created_at).toLocaleString()}</span>
                  {entry.details?.updated_keys?.length > 0 && (
                    <span className="muted-sm">({entry.details.updated_keys.slice(0, 5).join(', ')}{entry.details.updated_keys.length > 5 ? '…' : ''})</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <h2 className="card__heading section-spacer">Export &amp; data</h2>
          <p className="section-intro">
            Download your data as JSON (products, customers, suppliers, invoices and line items). Use for backup or migration.
          </p>
          <button type="button" className="btn btn--secondary" disabled={exportLoading} onClick={handleExportData}>
            {exportLoading ? 'Preparing…' : 'Export my data (JSON)'}
          </button>

          <h2 className="card__heading section-spacer">Reset column choices</h2>
          <p className="section-intro">
            Reset product form fields, product list columns, and invoice line item columns to show all options. You must click Save above to apply.
          </p>
          <button type="button" className="btn btn--ghost btn--danger" onClick={handleResetToDefaults}>
            Reset product &amp; invoice settings to defaults
          </button>

          <h2 className="card__heading section-spacer danger-zone-heading">Danger zone</h2>
          <p className="section-intro">
            These actions cannot be undone. Reset numbering will set the next invoice number back to 1. Delete all data will remove every invoice, product, customer, supplier, and purchase bill for this tenant.
          </p>
          <div className="form form--grid" style={{ maxWidth: '28rem' }}>
            <div>
              <h3 className="card__subheading">Reset invoice numbering</h3>
              <p className="muted-sm" style={{ marginBottom: '0.5rem' }}>Set the next invoice number to 1. Existing invoice numbers are not changed.</p>
              <label className="settings-toggle" style={{ marginBottom: '0.5rem' }}>
                <input type="checkbox" checked={!!resetNumberingConfirm} onChange={(e) => setResetNumberingConfirm(e.target.checked)} />
                <span>I understand</span>
              </label>
              <button type="button" className="btn btn--ghost btn--danger" disabled={!resetNumberingConfirm || dangerLoading} onClick={handleResetInvoiceNumbering}>
                {dangerLoading ? 'Resetting…' : 'Reset invoice numbering'}
              </button>
            </div>
            <div>
              <h3 className="card__subheading">Delete all data</h3>
              <p className="muted-sm" style={{ marginBottom: '0.5rem' }}>Permanently delete all invoices, products, customers, suppliers, and purchase bills. Tenant and account are kept.</p>
              <label className="settings-toggle" style={{ marginBottom: '0.5rem' }}>
                <input type="checkbox" checked={!!deleteDataConfirm} onChange={(e) => setDeleteDataConfirm(e.target.checked)} />
                <span>I understand this cannot be undone</span>
              </label>
              <button type="button" className="btn btn--ghost btn--danger" disabled={!deleteDataConfirm || dangerLoading} onClick={handleDeleteAllData}>
                {dangerLoading ? 'Deleting…' : 'Delete all data'}
              </button>
            </div>
          </div>
        </section>
        )}
      </form>
    </div>
  );
}
