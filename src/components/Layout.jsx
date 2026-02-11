import { useState, useEffect } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { tenant, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const showFab = location.pathname === '/invoices';

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
    <div className="layout">
      <header className="layout__header">
        <div className="layout__brand">
          <Link to="/">Billing</Link>
          {tenant && <span className="layout__tenant">— {tenant.name}</span>}
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
          <div className="layout__nav-group">
            <Link to="/products">Products</Link>
            <Link to="/customers">Customers</Link>
            <Link to="/invoices">Invoices</Link>
            <Link to="/invoices/new" className="layout__nav-cta btn btn--primary btn--sm">
              New invoice
            </Link>
          </div>
          <div className="layout__nav-group">
            <Link to="/suppliers">Suppliers</Link>
            <Link to="/purchase-bills">Purchase bills</Link>
          </div>
          <div className="layout__nav-group">
            <Link to="/reports">Reports</Link>
            <Link to="/settings">Settings</Link>
          </div>
          <div className="layout__nav-group layout__nav-group--end">
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </nav>
      </header>
      <main className="layout__main">
        <Outlet />
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
