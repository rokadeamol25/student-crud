import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (!supabase) throw new Error('Auth not configured');
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (err) throw err;
      setForgotSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset link');
    } finally {
      setSubmitting(false);
    }
  }

  if (showForgot) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-card__title">Forgot password</h1>
          <p className="auth-card__subtitle">Enter your email and we’ll send you a reset link.</p>
          {forgotSent ? (
            <>
              <p className="auth-form__success">Check your email for a link to reset your password.</p>
              <button type="button" className="btn btn--primary auth-form__submit" onClick={() => { setShowForgot(false); setForgotSent(false); }}>
                Back to log in
              </button>
            </>
          ) : (
            <form onSubmit={handleForgotPassword} className="auth-form">
              {error && <div className="auth-form__error">{error}</div>}
              <label className="auth-form__label">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="auth-form__input"
                />
              </label>
              <button type="submit" className="btn btn--primary auth-form__submit" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
              <button type="button" className="btn btn--ghost auth-form__submit" onClick={() => { setShowForgot(false); setError(''); }}>
                Back to log in
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-card__title">Log in</h1>
        <p className="auth-card__subtitle">Sign in to Tulja Billing</p>
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-form__error">{error}</div>}
          <label className="auth-form__label">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="auth-form__input"
            />
          </label>
          <label className="auth-form__label">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="auth-form__input"
            />
          </label>
          <p className="auth-form__forgot">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowForgot(true)}>
              Forgot password?
            </button>
          </p>
          <button type="submit" className="btn btn--primary auth-form__submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Log in'}
          </button>
        </form>
        <p className="auth-card__footer">
          Don’t have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
