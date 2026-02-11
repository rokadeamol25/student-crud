import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getBusinessConfig } from '../config/businessTypes';

const DEFAULT_MODULES = { invoices: true, purchaseBills: true, suppliers: true, customers: true, products: true, reports: true, dashboard: true };

/**
 * Redirects to the first enabled module (or /settings) when the current route
 * belongs to a module that is disabled in tenant feature_config.modules.
 */
export default function ModuleGuard({ children }) {
  const { tenant } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const config = getBusinessConfig(tenant?.business_type ?? null, tenant?.feature_config ?? null);
  const modules = { ...DEFAULT_MODULES, ...(config.modules && typeof config.modules === 'object' ? config.modules : {}) };

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/invoices') && modules.invoices === false) {
      navigate(getFirstAllowedPath(modules), { replace: true });
      return;
    }
    if (path.startsWith('/purchase-bills') && modules.purchaseBills === false) {
      navigate(getFirstAllowedPath(modules), { replace: true });
      return;
    }
    if (path.startsWith('/suppliers') && modules.suppliers === false) {
      navigate(getFirstAllowedPath(modules), { replace: true });
      return;
    }
    if (path.startsWith('/customers') && modules.customers === false) {
      navigate(getFirstAllowedPath(modules), { replace: true });
      return;
    }
    if (path.startsWith('/products') && modules.products === false) {
      navigate(getFirstAllowedPath(modules), { replace: true });
      return;
    }
    if (path.startsWith('/reports') && modules.reports === false) {
      navigate(getFirstAllowedPath(modules), { replace: true });
      return;
    }
    if (path === '/' && modules.dashboard === false) {
      navigate(getFirstAllowedPath(modules), { replace: true });
    }
  }, [location.pathname, modules.invoices, modules.purchaseBills, modules.suppliers, modules.customers, modules.products, modules.reports, modules.dashboard, navigate]);

  return children;
}

function getFirstAllowedPath(modules) {
  if (modules.dashboard !== false) return '/';
  if (modules.invoices !== false) return '/invoices';
  if (modules.products !== false) return '/products';
  if (modules.customers !== false) return '/customers';
  if (modules.purchaseBills !== false) return '/purchase-bills';
  if (modules.suppliers !== false) return '/suppliers';
  if (modules.reports !== false) return '/reports';
  return '/settings';
}
