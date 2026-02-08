import { useState, useEffect } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { tenant, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

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

        <nav className={`layout__nav${menuOpen ? ' layout__nav--open' : ''}`}>
          <Link to="/products">Products</Link>
          <Link to="/customers">Customers</Link>
          <Link to="/suppliers">Suppliers</Link>
          <Link to="/purchase-bills">Purchase bills</Link>
          <Link to="/invoices">Invoices</Link>
          <Link to="/invoices/new">New invoice</Link>
          <Link to="/reports">Reports</Link>
          <Link to="/settings">Settings</Link>
          <button type="button" className="btn btn--ghost btn--sm" onClick={handleLogout}>
            Log out
          </button>
        </nav>
      </header>
      <main className="layout__main">
        <Outlet />
      </main>
    </div>
  );
}
