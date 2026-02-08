import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';

export default function Settings() {
  const { token, tenant, refetchMe } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState(tenant?.name ?? '');
  const [currency, setCurrency] = useState(tenant?.currency ?? 'INR');
  const [currencySymbol, setCurrencySymbol] = useState(tenant?.currency_symbol ?? '₹');
  const [gstin, setGstin] = useState(tenant?.gstin ?? '');
  const [taxPercent, setTaxPercent] = useState(tenant?.tax_percent != null ? String(tenant.tax_percent) : '0');

  useEffect(() => {
    if (tenant?.name !== undefined) setName(tenant.name ?? '');
    if (tenant?.currency !== undefined) setCurrency(tenant.currency ?? 'INR');
    if (tenant?.currency_symbol !== undefined) setCurrencySymbol(tenant.currency_symbol ?? '₹');
    if (tenant?.gstin !== undefined) setGstin(tenant.gstin ?? '');
    if (tenant?.tax_percent != null) setTaxPercent(String(tenant.tax_percent));
  }, [tenant?.name, tenant?.currency, tenant?.currency_symbol, tenant?.gstin, tenant?.tax_percent]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      await api.patch(token, '/api/me', {
        name: (name ?? '').trim(),
        currency: (currency ?? '').trim() || 'INR',
        currency_symbol: (currencySymbol ?? '').trim() || undefined,
        gstin: (gstin ?? '').trim() || undefined,
        tax_percent: tax,
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
          {tenant?.slug && (
            <p className="page__muted" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
              Slug: <code>{tenant.slug}</code> (read-only)
            </p>
          )}
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
