import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';

export default function Dashboard() {
  const { token, tenant } = useAuth();
  const [sales, setSales] = useState(null);
  const [invoiceSummary, setInvoiceSummary] = useState(null);
  const [outstanding, setOutstanding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    Promise.all([
      api.get(token, `/api/reports/sales-summary?from=${from}&to=${to}`),
      api.get(token, '/api/reports/invoice-summary'),
      api.get(token, '/api/reports/outstanding'),
    ])
      .then(([s, i, o]) => {
        setSales(s);
        setInvoiceSummary(i);
        setOutstanding(o);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="page">
        <p className="page__muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h1 className="dashboard__title">Dashboard</h1>
      <p className="dashboard__subtitle">Manage your shop billing.</p>

      {error && <div className="page__error">{error}</div>}

      {/* Report summary cards */}
      <section className="dashboard__reports card page__section">
        <h2 className="card__heading">This month</h2>
        <div className="report-cards">
          <div className="report-card report-card--revenue">
            <span className="report-card__label">Revenue (paid)</span>
            <span className="report-card__value">{sales ? formatMoney(sales.totalRevenue, tenant) : '—'}</span>
            {sales && <span className="report-card__meta">{sales.invoiceCount} invoices</span>}
          </div>
          <div className="report-card">
            <span className="report-card__label">Draft</span>
            <span className="report-card__value">{invoiceSummary ? formatMoney(invoiceSummary.draft.total, tenant) : '—'}</span>
            {invoiceSummary && <span className="report-card__meta">{invoiceSummary.draft.count} invoices</span>}
          </div>
          <div className="report-card">
            <span className="report-card__label">Sent (pending)</span>
            <span className="report-card__value">{invoiceSummary ? formatMoney(invoiceSummary.sent.total, tenant) : '—'}</span>
            {invoiceSummary && <span className="report-card__meta">{invoiceSummary.sent.count} invoices</span>}
          </div>
          <div className="report-card report-card--outstanding">
            <span className="report-card__label">Outstanding</span>
            <span className="report-card__value">{outstanding ? formatMoney(outstanding.totalDue, tenant) : '—'}</span>
            {outstanding && outstanding.invoices.length > 0 && (
              <Link to="/reports" className="report-card__link">View report →</Link>
            )}
          </div>
        </div>
        <p className="page__muted" style={{ marginTop: '0.75rem' }}>
          <Link to="/reports">View all reports</Link> — sales, top products, customers, tax summary, revenue trend.
        </p>
      </section>

      <section className="dashboard__links">
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
      </section>
    </div>
  );
}
