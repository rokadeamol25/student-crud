import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Redirects to home if the current user is not an owner (staff cannot access Settings).
 * Only owners can access /settings.
 */
export default function SettingsGuard({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isOwner = user?.role === 'owner' || user?.role === undefined;

  useEffect(() => {
    if (location.pathname.startsWith('/settings') && !isOwner) {
      navigate('/', { replace: true });
    }
  }, [location.pathname, isOwner, navigate]);

  if (location.pathname.startsWith('/settings') && !isOwner) {
    return null;
  }

  return children;
}
