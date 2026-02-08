import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';

export default function Settings() {
  const { token, tenant, refetchMe } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState(tenant?.name ?? '');

  useEffect(() => {
    if (tenant?.name !== undefined) setName(tenant.name);
  }, [tenant?.name]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.patch(token, '/api/me', { name: name.trim() });
      await refetchMe();
      showToast('Shop name updated', 'success');
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
              value={name}
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
          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
