import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function SignupComplete() {
  const [shopName, setShopName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { session, tenant, loading, signupComplete } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-card__subtitle">Loading…</p>
        </div>
      </div>
    );
  }
  if (session && tenant) {
    navigate('/', { replace: true });
    return null;
  }
  if (!session) {
    navigate('/login', { replace: true });
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signupComplete(shopName.trim());
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || err.data?.error || 'Failed to create shop');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-card__title">Create your shop</h1>
        <p className="auth-card__subtitle">Name your shop to get started</p>
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-form__error">{error}</div>}
          <label className="auth-form__label">
            <span>Shop name</span>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="e.g. Kiran Store"
              required
              maxLength={200}
              className="auth-form__input"
            />
          </label>
          <button type="submit" className="btn btn--primary auth-form__submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
