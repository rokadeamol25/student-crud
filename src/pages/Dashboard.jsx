import { Link } from 'react-router-dom';

export default function Dashboard() {
  return (
    <div className="dashboard">
      <h1 className="dashboard__title">Dashboard</h1>
      <p className="dashboard__subtitle">Manage your shop billing.</p>
      <div className="dashboard__links">
        <Link to="/products" className="dashboard__card">
          <span className="dashboard__cardTitle">Products</span>
          <span className="dashboard__cardDesc">Add and manage products</span>
        </Link>
        <Link to="/customers" className="dashboard__card">
          <span className="dashboard__cardTitle">Customers</span>
          <span className="dashboard__cardDesc">Manage customers</span>
        </Link>
        <Link to="/invoices" className="dashboard__card">
          <span className="dashboard__cardTitle">Invoices</span>
          <span className="dashboard__cardDesc">View and create invoices</span>
        </Link>
        <Link to="/invoices/new" className="dashboard__card dashboard__card--primary">
          <span className="dashboard__cardTitle">New invoice</span>
          <span className="dashboard__cardDesc">Create an invoice</span>
        </Link>
      </div>
    </div>
  );
}
