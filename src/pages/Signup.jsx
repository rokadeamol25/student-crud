import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmEmailSent, setConfirmEmailSent] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setConfirmEmailSent(false);
    setSubmitting(true);
    try {
      const data = await signUp(email.trim(), password);
      // If Supabase returns a session, user goes straight to "Create your shop"
      if (data?.session) {
        navigate('/signup/complete', { replace: true });
        return;
      }
      // Email confirmation required: no session yet
      setConfirmEmailSent(true);
    } catch (err) {
      setError(err.message || 'Sign up failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmEmailSent) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-card__title">Check your email</h1>
          <p className="auth-card__subtitle">
            We sent a confirmation link to <strong>{email}</strong>. Click the link to verify your account, then log in.
          </p>
          <p className="auth-card__footer" style={{ marginTop: 16 }}>
            <Link to="/login" className="btn btn--primary">Go to Log in</Link>
          </p>
          <p className="auth-card__footer" style={{ marginTop: 12 }}>
            Already have an account? <Link to="/login">Log in2</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-card__title">Create account</h1>
        <p className="auth-card__subtitle">Next step: name your shop.</p>
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
              minLength={6}
              autoComplete="new-password"
              className="auth-form__input"
            />
          </label>
          <button type="submit" className="btn btn--primary auth-form__submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Sign up'}
          </button>
        </form>
        <p className="auth-card__footer">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
