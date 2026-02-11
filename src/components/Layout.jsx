import { useState, useEffect } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getBusinessConfig } from '../config/businessTypes';
import ModuleGuard from './ModuleGuard';

const DEFAULT_MODULES = { invoices: true, purchaseBills: true, suppliers: true, customers: true, products: true, reports: true, dashboard: true };

export default function Layout() {
  const { tenant, user, logout } = useAuth();
  const canAccessSettings = user?.role === 'owner' || user?.role === undefined;
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const config = getBusinessConfig(tenant?.business_type ?? null, tenant?.feature_config ?? null);
  const modules = { ...DEFAULT_MODULES, ...(config.modules && typeof config.modules === 'object' ? config.modules : {}) };
  const appTitle = (config.appTitle ?? '').toString().trim();
  const headerLabel = appTitle || tenant?.name || 'Billing';
  const navOrder = Array.isArray(config.navOrder) && config.navOrder.length ? config.navOrder : ['dashboard', 'invoices', 'products', 'customers', 'suppliers', 'purchaseBills', 'reports'];
  const homeTarget = config.homeTarget === 'invoices' ? 'invoices' : 'dashboard';
  const homeHref = homeTarget === 'invoices' ? '/invoices' : '/';
  const primaryColor = (config.primaryColor ?? '').toString().trim();
  const primaryColorHover = (config.primaryColorHover ?? primaryColor).toString().trim();
  const faviconUrl = (config.faviconUrl ?? '').toString().trim();
  const accentStyle = primaryColor ? { '--accent': primaryColor, '--accent-hover': primaryColorHover || primaryColor } : undefined;

  const showFab = modules.invoices !== false && location.pathname === '/invoices';

  // Apply tenant favicon when set
  useEffect(() => {
    let link = document.querySelector('link[rel="icon"]');
    if (faviconUrl) {
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = faviconUrl;
    } else if (link) {
      link.href = '/favicon.ico';
    }
  }, [faviconUrl]);

  // close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // close menu on escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setMenuOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // lock body scroll when mobile menu is open
  useEffect(() => {
    if (menuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [menuOpen]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="layout" style={accentStyle}>
      <header className="layout__header">
        <div className="layout__brand">
          <Link to={homeHref}>{headerLabel}</Link>
          {tenant && !appTitle && <span className="layout__tenant">— {tenant.name}</span>}
          {tenant && appTitle && tenant.name && tenant.name !== appTitle && <span className="layout__tenant">— {tenant.name}</span>}
        </div>

        {/* Hamburger — mobile only */}
        <button
          type="button"
          className="layout__hamburger"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <span className={`layout__hamburger-line${menuOpen ? ' open' : ''}`} />
          <span className={`layout__hamburger-line${menuOpen ? ' open' : ''}`} />
          <span className={`layout__hamburger-line${menuOpen ? ' open' : ''}`} />
        </button>

        {/* Overlay when menu is open on mobile */}
        {menuOpen && <div className="layout__overlay" onClick={() => setMenuOpen(false)} />}

        <nav className={`layout__nav${menuOpen ? ' layout__nav--open' : ''}`} aria-label="Main navigation">
          {navOrder.map((id) => {
            if (id === 'dashboard' && modules.dashboard !== false) {
              return (
                <div key="dashboard" className="layout__nav-group">
                  <Link to="/">Dashboard</Link>
                </div>
              );
            }
            if (id === 'invoices' && modules.invoices !== false) {
              return (
                <div key="invoices" className="layout__nav-group">
                  <Link to="/invoices">Invoices</Link>
                  <Link to="/invoices/new" className="layout__nav-cta btn btn--primary btn--sm">
                    New invoice
                  </Link>
                </div>
              );
            }
            if (id === 'products' && modules.products !== false) {
              return (
                <div key="products" className="layout__nav-group">
                  <Link to="/products">Products</Link>
                </div>
              );
            }
            if (id === 'customers' && modules.customers !== false) {
              return (
                <div key="customers" className="layout__nav-group">
                  <Link to="/customers">Customers</Link>
                </div>
              );
            }
            if (id === 'suppliers' && modules.suppliers !== false) {
              return (
                <div key="suppliers" className="layout__nav-group">
                  <Link to="/suppliers">Suppliers</Link>
                </div>
              );
            }
            if (id === 'purchaseBills' && modules.purchaseBills !== false) {
              return (
                <div key="purchaseBills" className="layout__nav-group">
                  <Link to="/purchase-bills">Purchase bills</Link>
                </div>
              );
            }
            if (id === 'reports' && modules.reports !== false) {
              return (
                <div key="reports" className="layout__nav-group">
                  <Link to="/reports">Reports</Link>
                </div>
              );
            }
            return null;
          })}
          {canAccessSettings && (
            <div className="layout__nav-group">
              <Link to="/settings">Settings</Link>
            </div>
          )}
          <div className="layout__nav-group layout__nav-group--end">
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </nav>
      </header>
      <main className="layout__main">
        <ModuleGuard>
          <Outlet />
        </ModuleGuard>
      </main>

      {/* Floating "New invoice" on mobile when on Invoices */}
      {showFab && (
        <Link
          to="/invoices/new"
          className="layout__fab"
          aria-label="New invoice"
        >
          <span className="layout__fab-icon">+</span>
          <span className="layout__fab-label">New invoice</span>
        </Link>
      )}
    </div>
  );
}
