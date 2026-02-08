import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function SignupComplete() {
  const [shopName, setShopName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { session, tenant, loading, signupComplete, lastMeFailCode, refetchMe } = useAuth();
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

  const codeHelp = {
    token_missing: 'API did not receive the login token. Check that VITE_API_URL is not set on Vercel so requests go to same origin.',
    token_invalid: 'Token verification failed. Set SUPABASE_JWT_SECRET in Vercel (Supabase → Project Settings → API → JWT Secret). Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY match the same project as the frontend.',
    user_not_found: 'No user/tenant row in the backend database. Use the same Supabase project for frontend and API; run migrations and complete signup once on this deployment.',
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-card__title">Create your shop</h1>
        <p className="auth-card__subtitle">Name your shop to get started</p>
        {lastMeFailCode && lastMeFailCode !== 'ok' && (
          <div className="auth-form__error" style={{ marginBottom: 12, fontSize: 13 }}>
            <strong>Backend diagnostic:</strong> <code>{lastMeFailCode}</code>
            {codeHelp[lastMeFailCode] && (
              <span> — {codeHelp[lastMeFailCode]}</span>
            )}
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn--secondary" style={{ fontSize: 12 }} onClick={() => refetchMe()}>
                Retry
              </button>
            </div>
          </div>
        )}
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
