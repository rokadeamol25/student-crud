/**
 * Protects routes: requires session; if no tenant, redirect to signup/complete.
 */
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute({ children }) {
  const { session, tenant, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading__spinner" />
        <p>Loading…</p>
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (!tenant) {
    return <Navigate to="/signup/complete" state={{ from: location }} replace />;
  }
  return children;
}
