/**
 * Registers global 401 handler with the API client.
 * On 401 from any /api/* call: logout, toast, redirect to login.
 * Must be mounted inside AuthProvider, ToastProvider, and BrowserRouter.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';

export default function SessionExpiredHandler() {
  const { logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    api.setSessionExpiredHandler(() => {
      logout();
      showToast('Session expired. Please sign in again.', 'error');
      navigate('/login', { replace: true });
    });
    return () => api.setSessionExpiredHandler(null);
  }, [logout, showToast, navigate]);

  return null;
}
