import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { tenant, logout } = useAuth();
  const navigate = useNavigate();

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
        <nav className="layout__nav">
          <Link to="/products">Products</Link>
          <Link to="/customers">Customers</Link>
          <Link to="/invoices">Invoices</Link>
          <Link to="/invoices/new">New invoice</Link>
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
